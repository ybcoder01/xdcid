"use client";

import { useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeDeployData,
  getAddress,
  getContractAddress,
  type Abi,
  type Address,
  type EIP1193Provider,
  type Hex,
  type PublicClient,
} from "viem";
import { apothemRegistrarV2DeploymentArtifacts as artifacts } from "../../../generated/apothemRegistrarV2Deployment";

const OWNER = getAddress("0x9c67d6cfE6A73497e7348b6b852495CA6236C29a");
const REGISTRY = getAddress("0x2BeD8EB404e1BD8D690e3dD2Fd06F287e5A92Eb1");
const LEGACY_REGISTRY = getAddress("0xe7CfeC8729686CcB2FB25B8275D6bd6Bc68A4bf0");
const USDC = getAddress("0xb5AB69F7bBada22B28e79C8FFAECe55eF1c771D4");
const CREATE2_DEPLOYER = getAddress("0x4e59b44847b379578588920ca78fbf26c0b4956c");
const CHAIN_ID = 51;
const ZERO_SALT = (suffix: number) =>
  ("0x" + suffix.toString(16).padStart(64, "0")) as Hex;

const apothem = {
  id: CHAIN_ID,
  name: "XDC Apothem",
  nativeCurrency: { name: "TXDC", symbol: "TXDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://erpc.apothem.network"] } },
  blockExplorers: {
    default: { name: "XDCScan Testnet", url: "https://testnet.xdcscan.com" },
  },
} as const;

type Deployment = {
  pricingPolicy?: Address;
  discountAuthorization?: Address;
  registrar?: Address;
};

type Step = {
  label: string;
  state: "pending" | "wallet" | "confirming" | "complete" | "failed";
  hash?: Hex;
  address?: Address;
  error?: string;
};

const initialSteps: Step[] = [
  { label: "Validate Apothem dependencies", state: "pending" },
  { label: "Deploy Pricing Policy v2", state: "pending" },
  { label: "Deploy Discount Authorization", state: "pending" },
  { label: "Deploy Registrar v2", state: "pending" },
  { label: "Propose Registrar v2 as discount consumer", state: "pending" },
  { label: "Validate deployment (no activation)", state: "pending" },
];

export default function ApothemRegistrarV2DeploymentClient() {
  const [account, setAccount] = useState<Address>();
  const [deployment, setDeployment] = useState<Deployment>({});
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "Connect the designated Apothem test wallet to run preflight checks.",
  );

  function updateStep(index: number, patch: Partial<Step>) {
    setSteps((current) =>
      current.map((step, position) =>
        position === index ? { ...step, ...patch } : step,
      ),
    );
  }

  async function connect() {
    try {
      const provider = injectedProvider();
      const requested = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!requested[0]) throw new Error("Wallet returned no account");
      const selected = getAddress(requested[0]);
      if (selected !== OWNER) throw new Error("Select the designated Apothem wallet");
      await ensureApothem(provider);
      const clients = clientsFor(provider, selected);
      await validateDependencies(clients.publicClient, selected);
      setAccount(selected);
      updateStep(0, { state: "complete", error: undefined });
      setMessage("Apothem registry, legacy registry, USDC, and wallet validated.");
    } catch (cause) {
      updateStep(0, { state: "failed", error: errorMessage(cause) });
      setMessage(errorMessage(cause));
    }
  }

  async function deploy() {
    if (!account || busy) return;
    setBusy(true);
    setDeployment({});
    setSteps((current) => [
      { ...current[0], state: "complete", error: undefined },
      ...initialSteps.slice(1),
    ]);

    try {
      const provider = injectedProvider();
      await ensureApothem(provider);
      const clients = clientsFor(provider, account);
      await validateDependencies(clients.publicClient, account);

      const config = {
        twoCharacterAnnualUsdMicros: 50_000_000n,
        threeCharacterAnnualUsdMicros: 20_000_000n,
        fourCharacterAnnualUsdMicros: 10_000_000n,
        standardAnnualUsdMicros: 5_000_000n,
        subdomainAnnualUsdMicros: 1_000_000n,
        premiumSubdomainAnnualUsdMicros: 5_000_000n,
        migrationUsdMicros: 3_000_000n,
        threeYearDiscountBps: 1_000,
        fiveYearDiscountBps: 1_500,
        tenYearDiscountBps: 2_000,
        xdcQuoteBufferBps: 200,
        quoteSigner: OWNER,
        usdcToken: USDC,
        treasury: OWNER,
        xdcPaymentsEnabled: true,
        usdcPaymentsEnabled: true,
      };

      const pricingPolicy = await deployContract({
        index: 1,
        clients,
        artifact: artifacts.pricingPolicy,
        args: [config, OWNER],
        salt: ZERO_SALT(101),
        updateStep,
      });
      setDeployment({ pricingPolicy });

      // The owner is the temporary consumer only until the delayed registrar
      // consumer proposal is activated in the separate activation step.
      const discountAuthorization = await deployContract({
        index: 2,
        clients,
        artifact: artifacts.discountAuthorization,
        args: [OWNER, OWNER, OWNER],
        salt: ZERO_SALT(102),
        updateStep,
      });
      setDeployment({ pricingPolicy, discountAuthorization });

      const registrar = await deployContract({
        index: 3,
        clients,
        artifact: artifacts.registrar,
        args: [
          REGISTRY,
          LEGACY_REGISTRY,
          pricingPolicy,
          discountAuthorization,
          OWNER,
        ],
        salt: ZERO_SALT(103),
        updateStep,
      });
      const completed = { pricingPolicy, discountAuthorization, registrar };
      setDeployment(completed);

      updateStep(4, { state: "wallet" });
      const proposalHash = await clients.walletClient.writeContract({
        account,
        chain: apothem,
        address: discountAuthorization,
        abi: artifacts.discountAuthorization.abi,
        functionName: "proposeConfiguration",
        args: [OWNER, registrar],
      });
      updateStep(4, { state: "confirming", hash: proposalHash });
      const proposalReceipt =
        await clients.publicClient.waitForTransactionReceipt({
          hash: proposalHash,
          confirmations: 2,
          timeout: 180_000,
        });
      if (proposalReceipt.status !== "success") {
        throw new Error("Discount consumer proposal failed");
      }
      updateStep(4, { state: "complete", hash: proposalHash });

      updateStep(5, { state: "confirming" });
      await validateDeployment(clients.publicClient, completed, account);
      updateStep(5, { state: "complete" });
      setMessage(
        "Three contracts are deployed and validated. Nothing is active. Wait 48 hours before activating the proposed discount consumer.",
      );
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-950">
      <div className="mx-auto max-w-4xl space-y-8">
        <section className="rounded-3xl border border-amber-300 bg-amber-50 p-7">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-800">
            Apothem-only deployment
          </p>
          <h1 className="mt-3 text-4xl font-semibold">Deploy Registrar v2 test stack</h1>
          <p className="mt-3 text-slate-700">
            This preview-only page deploys three testnet contracts and proposes
            the registrar as discount consumer. It cannot activate the registrar
            and never reads, sends, or stores a private key.
          </p>
        </section>

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <dl className="grid gap-4 text-sm md:grid-cols-2">
            <Detail label="Test wallet and temporary roles" value={OWNER} />
            <Detail label="Existing Apothem registry" value={REGISTRY} />
            <Detail label="Legacy collision registry" value={LEGACY_REGISTRY} />
            <Detail label="Circle Apothem USDC (6 decimals)" value={USDC} />
          </dl>
          <p className="mt-5 rounded-xl bg-slate-100 p-4">{message}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-50"
              onClick={connect}
              disabled={busy}
            >
              {account ? "Test wallet verified" : "Connect test wallet"}
            </button>
            <button
              className="rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-50"
              onClick={deploy}
              disabled={!account || busy}
            >
              {busy ? "Deployment in progress..." : "Deploy and validate test stack"}
            </button>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <h2 className="text-2xl font-semibold">Transaction sequence</h2>
          <ol className="mt-5 space-y-4">
            {steps.map((step, index) => (
              <li key={step.label} className="rounded-xl border p-4">
                <div className="flex justify-between gap-4">
                  <span>{index + 1}. {step.label}</span>
                  <span className="font-semibold">{step.state}</span>
                </div>
                {step.hash ? (
                  <a
                    className="mt-2 block break-all font-mono text-sm text-blue-700 underline"
                    href={"https://testnet.xdcscan.com/tx/" + step.hash}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {step.hash}
                  </a>
                ) : null}
                {step.address ? (
                  <p className="mt-2 break-all font-mono text-sm">{step.address}</p>
                ) : null}
                {step.error ? (
                  <p className="mt-2 break-words text-sm text-red-700">{step.error}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <h2 className="text-2xl font-semibold">Deployment addresses</h2>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-950 p-5 text-sm text-white">
            {JSON.stringify(deployment, null, 2)}
          </pre>
          <p className="mt-4 text-sm text-slate-600">
            Save these addresses. Hardhat verification, delayed consumer
            activation, registry activation, and functional testing are separate steps.
          </p>
        </section>
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-all font-mono">{value}</dd>
    </div>
  );
}

async function deployContract(input: {
  index: number;
  clients: ReturnType<typeof clientsFor>;
  artifact: { abi: readonly unknown[]; bytecode: string };
  args: readonly unknown[];
  salt: Hex;
  updateStep: (index: number, patch: Partial<Step>) => void;
}): Promise<Address> {
  input.updateStep(input.index, { state: "wallet" });
  try {
    const data = encodeDeployData({
      abi: input.artifact.abi as Abi,
      bytecode: input.artifact.bytecode as Hex,
      args: input.args,
    });
    const address = getAddress(
      getContractAddress({
        bytecode: data,
        from: CREATE2_DEPLOYER,
        opcode: "CREATE2",
        salt: input.salt,
      }),
    );
    const existingCode = await input.clients.publicClient.getCode({ address });
    if (existingCode && existingCode !== "0x") {
      input.updateStep(input.index, { state: "complete", address });
      return address;
    }

    const hash = await input.clients.walletClient.sendTransaction({
      account: input.clients.account,
      chain: apothem,
      to: CREATE2_DEPLOYER,
      data: `${input.salt}${data.slice(2)}` as Hex,
      value: 0n,
    });
    input.updateStep(input.index, { state: "confirming", hash });
    const receipt = await input.clients.publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 2,
      timeout: 180_000,
    });
    if (receipt.status !== "success") throw new Error(input.label + " failed");
    await requireCode(input.clients.publicClient, address, "deployed contract");
    input.updateStep(input.index, { state: "complete", hash, address });
    return address;
  } catch (cause) {
    input.updateStep(input.index, {
      state: "failed",
      error: errorMessage(cause),
    });
    throw cause;
  }
}

function clientsFor(provider: EIP1193Provider, account: Address) {
  return {
    account,
    publicClient: createPublicClient({
      chain: apothem,
      transport: custom(provider),
    }),
    walletClient: createWalletClient({
      chain: apothem,
      transport: custom(provider),
    }),
  };
}

async function validateDependencies(publicClient: PublicClient, account: Address) {
  await requireCode(publicClient, REGISTRY, "registry");
  await requireCode(publicClient, LEGACY_REGISTRY, "legacy registry");
  await requireCode(publicClient, USDC, "USDC");
  await requireCode(publicClient, CREATE2_DEPLOYER, "deployment proxy");

  const owner = await publicClient.readContract({
    address: REGISTRY,
    abi: [{
      type: "function",
      name: "owner",
      stateMutability: "view",
      inputs: [],
      outputs: [{ type: "address" }],
    }],
    functionName: "owner",
  });
  if (getAddress(owner) !== account || account !== OWNER) {
    throw new Error("Connected wallet is not the Apothem registry owner");
  }
  const decimals = await publicClient.readContract({
    address: USDC,
    abi: [{
      type: "function",
      name: "decimals",
      stateMutability: "view",
      inputs: [],
      outputs: [{ type: "uint8" }],
    }],
    functionName: "decimals",
  });
  if (decimals !== 6) throw new Error("Apothem USDC must use six decimals");
}

async function validateDeployment(
  publicClient: PublicClient,
  deployment: Required<Deployment>,
  account: Address,
) {
  const [policyOwner, policyVersion, authorizationOwner, pendingConsumer, registry, legacy, policy, authorization, registrarOwner] =
    await Promise.all([
      publicClient.readContract({ address: deployment.pricingPolicy, abi: artifacts.pricingPolicy.abi, functionName: "owner" }),
      publicClient.readContract({ address: deployment.pricingPolicy, abi: artifacts.pricingPolicy.abi, functionName: "version" }),
      publicClient.readContract({ address: deployment.discountAuthorization, abi: artifacts.discountAuthorization.abi, functionName: "owner" }),
      publicClient.readContract({ address: deployment.discountAuthorization, abi: artifacts.discountAuthorization.abi, functionName: "pendingConsumer" }),
      publicClient.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "registry" }),
      publicClient.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "legacyRegistry" }),
      publicClient.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "pricingPolicy" }),
      publicClient.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "discountAuthorization" }),
      publicClient.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "owner" }),
    ]);

  if (
    getAddress(policyOwner as Address) !== account ||
    getAddress(authorizationOwner as Address) !== account ||
    getAddress(registrarOwner as Address) !== account ||
    BigInt(policyVersion as bigint) !== 1n ||
    getAddress(pendingConsumer as Address) !== deployment.registrar ||
    getAddress(registry as Address) !== REGISTRY ||
    getAddress(legacy as Address) !== LEGACY_REGISTRY ||
    getAddress(policy as Address) !== deployment.pricingPolicy ||
    getAddress(authorization as Address) !== deployment.discountAuthorization
  ) {
    throw new Error("Registrar v2 deployment validation failed");
  }
}

async function requireCode(
  publicClient: PublicClient,
  address: Address,
  label: string,
) {
  const code = await publicClient.getCode({ address });
  if (!code || code === "0x") throw new Error(label + " has no contract code");
}

function injectedProvider(): EIP1193Provider {
  const provider = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
  if (!provider) throw new Error("No injected browser wallet was detected");
  return provider;
}

async function ensureApothem(provider: EIP1193Provider) {
  const chainId = (await provider.request({ method: "eth_chainId" })) as string;
  if (Number.parseInt(chainId, 16) === CHAIN_ID) return;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x33" }],
    });
  } catch {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: "0x33",
        chainName: apothem.name,
        nativeCurrency: apothem.nativeCurrency,
        rpcUrls: apothem.rpcUrls.default.http,
        blockExplorerUrls: [apothem.blockExplorers.default.url],
      }],
    });
  }
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    const text = cause.message.split("\n")[0];
    return text.length > 280 ? text.slice(0, 277) + "..." : text;
  }
  return "The wallet operation failed";
}
