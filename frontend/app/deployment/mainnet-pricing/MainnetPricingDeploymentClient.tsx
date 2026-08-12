"use client";

import { useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeDeployData,
  getAddress,
  type Abi,
  type Address,
  type EIP1193Provider,
  type Hex,
  type PublicClient,
} from "viem";
import { mainnetPricingDeploymentArtifacts } from "../../../generated/mainnetPricingDeployment";

const OWNER = getAddress("0xe82a4267CC310FC6Db334601671A043DFc8Ce06A");
const REGISTRY = getAddress("0x05fa64a05bc205DeDF47e023d2D90c2d119cd097");
const LEGACY_REGISTRY = getAddress("0x295a7aB79368187a6CD03c464cfaAb04d799784E");
const USDC = getAddress("0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1");
const CHAIN_ID = 50;

const xdcMainnet = {
  id: CHAIN_ID,
  name: "XDC Network",
  nativeCurrency: { name: "XDC", symbol: "XDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.xdcrpc.com"] } },
  blockExplorers: { default: { name: "XDCScan", url: "https://xdcscan.com" } },
} as const;

const registryAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const erc20MetadataAbi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

type Deployment = {
  pricingPolicy?: Address;
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
  { label: "Validate mainnet dependencies", state: "pending" },
  { label: "Deploy XNSPricingPolicy", state: "pending" },
  { label: "Deploy XNSSignedQuoteRegistrar", state: "pending" },
  { label: "Validate deployed contracts", state: "pending" },
];

export default function MainnetPricingDeploymentClient() {
  const [account, setAccount] = useState<Address>();
  const [deployment, setDeployment] = useState<Deployment>({});
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "Connect the current owner wallet to run the read-only preflight.",
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
      if (selected !== OWNER) {
        throw new Error("Select the current XDCID owner wallet");
      }
      await ensureXdcMainnet(provider);
      const { publicClient } = clientsFor(provider, selected);
      await validateDependencies(publicClient, selected);
      setAccount(selected);
      updateStep(0, { state: "complete" });
      setMessage(
        "Owner, registry, legacy registry, and six-decimal USDC validated on XDC mainnet.",
      );
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
      await ensureXdcMainnet(provider);
      const clients = clientsFor(provider, account);
      await validateDependencies(clients.publicClient, account);

      const pricingConfig = {
        threeCharacterAnnualUsdMicros: 20_000_000n,
        fourCharacterAnnualUsdMicros: 10_000_000n,
        standardAnnualUsdMicros: 5_000_000n,
        subdomainAnnualUsdMicros: 1_000_000n,
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
        artifact: mainnetPricingDeploymentArtifacts.pricingPolicy,
        args: [pricingConfig, OWNER],
        updateStep,
      });
      setDeployment({ pricingPolicy });

      const registrar = await deployContract({
        index: 2,
        clients,
        artifact: mainnetPricingDeploymentArtifacts.registrar,
        args: [REGISTRY, LEGACY_REGISTRY, pricingPolicy],
        updateStep,
      });
      const completed = { pricingPolicy, registrar };
      setDeployment(completed);

      updateStep(3, { state: "confirming" });
      await validateDeployment(
        clients.publicClient,
        completed,
        account,
        pricingConfig,
      );
      updateStep(3, { state: "complete" });
      setMessage(
        "Both contracts are deployed and validated. Nothing was activated. Save the addresses and transaction hashes for Hardhat verification.",
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
        <section className="rounded-3xl border border-rose-300 bg-rose-50 p-7">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-rose-800">
            XDC mainnet deployment
          </p>
          <h1 className="mt-3 text-4xl font-semibold">
            Deploy the XDCID pricing stack
          </h1>
          <p className="mt-3 text-slate-700">
            This temporary page deploys exactly two contracts. It cannot activate
            the registrar and it never reads, transmits, or stores a private key.
          </p>
        </section>

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <dl className="grid gap-4 text-sm md:grid-cols-2">
            <Detail label="Allowed wallet, roles, and treasury" value={OWNER} />
            <Detail label="Existing registry" value={REGISTRY} />
            <Detail label="Legacy collision registry" value={LEGACY_REGISTRY} />
            <Detail label="XDC USDC (6 decimals)" value={USDC} />
          </dl>
          <p className="mt-5 rounded-xl bg-slate-100 p-4">{message}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-50"
              onClick={connect}
              disabled={busy}
            >
              {account ? "Owner wallet verified" : "Connect owner wallet"}
            </button>
            <button
              className="rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-50"
              onClick={deploy}
              disabled={!account || busy}
            >
              {busy ? "Deployment in progress..." : "Deploy and validate two contracts"}
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
                    href={"https://xdcscan.com/tx/" + step.hash}
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
            The active registrar is unchanged. Verification, quote-signer
            separation, activation preflight, and activation remain separate steps.
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
  updateStep: (index: number, patch: Partial<Step>) => void;
}): Promise<Address> {
  input.updateStep(input.index, { state: "wallet" });
  try {
    const data = encodeDeployData({
      abi: input.artifact.abi as Abi,
      bytecode: input.artifact.bytecode as Hex,
      args: input.args,
    });
    const hash = await input.clients.walletClient.sendTransaction({
      account: input.clients.account,
      chain: xdcMainnet,
      data,
    });
    input.updateStep(input.index, { state: "confirming", hash });
    const receipt = await input.clients.publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 2,
      timeout: 180_000,
    });
    if (receipt.status !== "success" || !receipt.contractAddress) {
      throw new Error(initialSteps[input.index].label + " failed");
    }
    const address = getAddress(receipt.contractAddress);
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
      chain: xdcMainnet,
      transport: custom(provider),
    }),
    walletClient: createWalletClient({
      chain: xdcMainnet,
      transport: custom(provider),
    }),
  };
}

async function validateDependencies(publicClient: PublicClient, account: Address) {
  await requireCode(publicClient, REGISTRY, "registry");
  await requireCode(publicClient, LEGACY_REGISTRY, "legacy registry");
  await requireCode(publicClient, USDC, "USDC");

  const owner = await publicClient.readContract({
    address: REGISTRY,
    abi: registryAbi,
    functionName: "owner",
  });
  if (getAddress(owner) !== account || account !== OWNER) {
    throw new Error("Connected wallet is not the current registry owner");
  }
  const decimals = await publicClient.readContract({
    address: USDC,
    abi: erc20MetadataAbi,
    functionName: "decimals",
  });
  if (decimals !== 6) {
    throw new Error("Configured mainnet USDC must use six decimals");
  }
}

async function validateDeployment(
  publicClient: PublicClient,
  deployment: Required<Deployment>,
  account: Address,
  expectedConfig: {
    quoteSigner: Address;
    usdcToken: Address;
    treasury: Address;
  },
) {
  const policyAbi = mainnetPricingDeploymentArtifacts.pricingPolicy.abi as Abi;
  const registrarAbi = mainnetPricingDeploymentArtifacts.registrar.abi as Abi;

  const [policyOwner, config, version, registry, legacy, policy] =
    await Promise.all([
      publicClient.readContract({
        address: deployment.pricingPolicy,
        abi: policyAbi,
        functionName: "owner",
      }),
      publicClient.readContract({
        address: deployment.pricingPolicy,
        abi: policyAbi,
        functionName: "config",
      }),
      publicClient.readContract({
        address: deployment.pricingPolicy,
        abi: policyAbi,
        functionName: "version",
      }),
      publicClient.readContract({
        address: deployment.registrar,
        abi: registrarAbi,
        functionName: "registry",
      }),
      publicClient.readContract({
        address: deployment.registrar,
        abi: registrarAbi,
        functionName: "legacyRegistry",
      }),
      publicClient.readContract({
        address: deployment.registrar,
        abi: registrarAbi,
        functionName: "pricingPolicy",
      }),
    ]);

  if (getAddress(policyOwner as Address) !== account || BigInt(version as bigint) !== 1n) {
    throw new Error("Pricing-policy owner or version validation failed");
  }

  const values = config as readonly unknown[];
  if (
    getAddress(values[13] as Address) !== expectedConfig.quoteSigner ||
    getAddress(values[14] as Address) !== expectedConfig.usdcToken ||
    getAddress(values[15] as Address) !== expectedConfig.treasury ||
    values[16] !== true ||
    values[17] !== true
  ) {
    throw new Error("Pricing-policy role or payment validation failed");
  }

  if (
    getAddress(registry as Address) !== REGISTRY ||
    getAddress(legacy as Address) !== LEGACY_REGISTRY ||
    getAddress(policy as Address) !== deployment.pricingPolicy
  ) {
    throw new Error("Registrar dependency validation failed");
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

async function ensureXdcMainnet(provider: EIP1193Provider) {
  const chainId = (await provider.request({ method: "eth_chainId" })) as string;
  if (Number.parseInt(chainId, 16) === CHAIN_ID) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x32" }],
    });
  } catch {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: "0x32",
          chainName: xdcMainnet.name,
          nativeCurrency: xdcMainnet.nativeCurrency,
          rpcUrls: xdcMainnet.rpcUrls.default.http,
          blockExplorerUrls: [xdcMainnet.blockExplorers.default.url],
        },
      ],
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
