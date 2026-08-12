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
} from "viem";
import { apothemDeploymentArtifacts } from "../../../generated/apothemDeployment";

const EXPECTED_WALLET = getAddress(
  "0x9c67d6cfE6A73497e7348b6b852495CA6236C29a",
);
const APOTHEM_USDC = getAddress(
  "0xb5AB69F7bBada22B28e79C8FFAECe55eF1c771D4",
);
const CHAIN_ID = 51;

const apothem = {
  id: CHAIN_ID,
  name: "XDC Apothem",
  nativeCurrency: { name: "Test XDC", symbol: "TXDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.apothem.network"] },
  },
  blockExplorers: {
    default: { name: "XDCScan Testnet", url: "https://testnet.xdcscan.com" },
  },
} as const;

type DeploymentAddresses = {
  registry?: Address;
  legacyRegistry?: Address;
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
  { label: "Deploy XNSRegistry", state: "pending" },
  { label: "Deploy legacy collision test mock", state: "pending" },
  { label: "Deploy XNSPricingPolicy", state: "pending" },
  { label: "Deploy XNSSignedQuoteRegistrar", state: "pending" },
  { label: "Activate registrar in test registry", state: "pending" },
];

export default function ApothemDeploymentClient() {
  const [account, setAccount] = useState<Address>();
  const [addresses, setAddresses] = useState<DeploymentAddresses>({});
  const [steps, setSteps] = useState(initialSteps);
  const [busy, setBusy] = useState(false);
  const [readyToActivate, setReadyToActivate] = useState(false);
  const [message, setMessage] = useState(
    "Connect the designated Apothem test wallet to begin.",
  );

  async function connect() {
    try {
      const provider = injectedProvider();
      const requested = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!requested[0]) throw new Error("Wallet returned no account");
      const selected = getAddress(requested[0]);
      if (selected !== EXPECTED_WALLET) {
        throw new Error("Select the designated Apothem test wallet");
      }
      await ensureApothem(provider);
      setAccount(selected);
      setMessage("Wallet verified on XDC Apothem.");
    } catch (cause) {
      setMessage(errorMessage(cause));
    }
  }

  async function deployAll() {
    if (!account || busy) return;
    setBusy(true);
    setReadyToActivate(false);
    setAddresses({});
    setSteps(initialSteps);
    try {
      const provider = injectedProvider();
      await ensureApothem(provider);
      const clients = clientsFor(provider, account);

      const registry = await deployStep({
        index: 0,
        clients,
        artifact: apothemDeploymentArtifacts.registry,
        args: [account],
      });
      setAddresses((current) => ({ ...current, registry }));

      const legacyRegistry = await deployStep({
        index: 1,
        clients,
        artifact: apothemDeploymentArtifacts.legacyRegistry,
        args: [],
      });
      setAddresses((current) => ({ ...current, legacyRegistry }));

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
        quoteSigner: account,
        usdcToken: APOTHEM_USDC,
        treasury: account,
        xdcPaymentsEnabled: true,
        usdcPaymentsEnabled: true,
      };
      const pricingPolicy = await deployStep({
        index: 2,
        clients,
        artifact: apothemDeploymentArtifacts.pricingPolicy,
        args: [pricingConfig, account],
      });
      setAddresses((current) => ({ ...current, pricingPolicy }));

      const registrar = await deployStep({
        index: 3,
        clients,
        artifact: apothemDeploymentArtifacts.registrar,
        args: [registry, legacyRegistry, pricingPolicy],
      });
      const completed = {
        registry,
        legacyRegistry,
        pricingPolicy,
        registrar,
      };
      setAddresses(completed);
      await validateDeployment(clients.publicClient, completed, account);
      setReadyToActivate(true);
      setMessage(
        "All four contracts are deployed and validated. Review the addresses before activation.",
      );
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    if (
      !account ||
      !readyToActivate ||
      !addresses.registry ||
      !addresses.registrar ||
      busy
    ) {
      return;
    }
    setBusy(true);
    updateStep(4, { state: "wallet" });
    try {
      const provider = injectedProvider();
      await ensureApothem(provider);
      const { publicClient, walletClient } = clientsFor(provider, account);
      const hash = await walletClient.writeContract({
        account,
        chain: apothem,
        address: addresses.registry,
        abi: apothemDeploymentArtifacts.registry.abi as Abi,
        functionName: "setRegistrar",
        args: [addresses.registrar],
      });
      updateStep(4, { state: "confirming", hash });
      await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 2,
        timeout: 120_000,
      });
      const active = await publicClient.readContract({
        address: addresses.registry,
        abi: apothemDeploymentArtifacts.registry.abi as Abi,
        functionName: "registrar",
      });
      if (getAddress(active as Address) !== addresses.registrar) {
        throw new Error("Registry activation validation failed");
      }
      updateStep(4, { state: "complete", hash });
      setReadyToActivate(false);
      setMessage(
        "Apothem registrar is active. Save the public addresses shown below for verification and Preview configuration.",
      );
    } catch (cause) {
      updateStep(4, { state: "failed", error: errorMessage(cause) });
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function deployStep(input: {
    index: number;
    clients: ReturnType<typeof clientsFor>;
    artifact: { abi: readonly unknown[]; bytecode: string };
    args: readonly unknown[];
  }): Promise<Address> {
    updateStep(input.index, { state: "wallet" });
    const data = encodeDeployData({
      abi: input.artifact.abi as Abi,
      bytecode: input.artifact.bytecode as Hex,
      args: input.args,
    });
    const hash = await input.clients.walletClient.sendTransaction({
      account: input.clients.account,
      chain: apothem,
      data,
    });
    updateStep(input.index, { state: "confirming", hash });
    const receipt = await input.clients.publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 2,
      timeout: 180_000,
    });
    if (receipt.status !== "success" || !receipt.contractAddress) {
      throw new Error(initialSteps[input.index].label + " failed");
    }
    const address = getAddress(receipt.contractAddress);
    const code = await input.clients.publicClient.getCode({ address });
    if (!code || code === "0x") {
      throw new Error("No contract code found after deployment");
    }
    updateStep(input.index, { state: "complete", hash, address });
    return address;
  }

  function updateStep(index: number, patch: Partial<Step>) {
    setSteps((current) =>
      current.map((step, position) =>
        position === index ? { ...step, ...patch } : step,
      ),
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-950">
      <div className="mx-auto max-w-4xl space-y-8">
        <section className="rounded-3xl border border-amber-300 bg-amber-50 p-7">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-800">
            Apothem test deployment only
          </p>
          <h1 className="mt-3 text-4xl font-semibold">
            Deploy XDCID pricing test stack
          </h1>
          <p className="mt-3 text-slate-700">
            This page accepts only the designated wallet on chain ID 51. It
            never reads, transmits, or stores a private key.
          </p>
        </section>

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <dl className="grid gap-4 text-sm md:grid-cols-2">
            <div>
              <dt className="text-slate-500">Allowed wallet</dt>
              <dd className="break-all font-mono">{EXPECTED_WALLET}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Apothem USDC</dt>
              <dd className="break-all font-mono">{APOTHEM_USDC}</dd>
            </div>
          </dl>
          <p className="mt-5 rounded-xl bg-slate-100 p-4">{message}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-50"
              onClick={connect}
              disabled={busy}
            >
              {account ? "Wallet connected" : "Connect browser wallet"}
            </button>
            <button
              className="rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-50"
              onClick={deployAll}
              disabled={!account || busy}
            >
              Deploy and validate four contracts
            </button>
            <button
              className="rounded-xl bg-rose-700 px-5 py-3 font-semibold text-white disabled:opacity-50"
              onClick={activate}
              disabled={!readyToActivate || busy}
            >
              Activate test registrar
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
                {step.hash && (
                  <a
                    className="mt-2 block break-all font-mono text-sm text-blue-700 underline"
                    href={"https://testnet.xdcscan.com/tx/" + step.hash}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {step.hash}
                  </a>
                )}
                {step.address && (
                  <p className="mt-2 break-all font-mono text-sm">
                    {step.address}
                  </p>
                )}
                {step.error && (
                  <p className="mt-2 text-sm text-red-700">{step.error}</p>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <h2 className="text-2xl font-semibold">Deployment addresses</h2>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-950 p-5 text-sm text-white">
            {JSON.stringify(addresses, null, 2)}
          </pre>
        </section>
      </div>
    </main>
  );
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

async function validateDeployment(
  publicClient: ReturnType<typeof createPublicClient>,
  addresses: Required<DeploymentAddresses>,
  account: Address,
) {
  const registryOwner = await publicClient.readContract({
    address: addresses.registry,
    abi: apothemDeploymentArtifacts.registry.abi as Abi,
    functionName: "owner",
  });
  if (getAddress(registryOwner as Address) !== account) {
    throw new Error("Registry owner validation failed");
  }

  const policyOwner = await publicClient.readContract({
    address: addresses.pricingPolicy,
    abi: apothemDeploymentArtifacts.pricingPolicy.abi as Abi,
    functionName: "owner",
  });
  if (getAddress(policyOwner as Address) !== account) {
    throw new Error("Pricing policy owner validation failed");
  }

  const registrarRegistry = await publicClient.readContract({
    address: addresses.registrar,
    abi: apothemDeploymentArtifacts.registrar.abi as Abi,
    functionName: "registry",
  });
  const registrarLegacy = await publicClient.readContract({
    address: addresses.registrar,
    abi: apothemDeploymentArtifacts.registrar.abi as Abi,
    functionName: "legacyRegistry",
  });
  const registrarPolicy = await publicClient.readContract({
    address: addresses.registrar,
    abi: apothemDeploymentArtifacts.registrar.abi as Abi,
    functionName: "pricingPolicy",
  });

  if (
    getAddress(registrarRegistry as Address) !== addresses.registry ||
    getAddress(registrarLegacy as Address) !== addresses.legacyRegistry ||
    getAddress(registrarPolicy as Address) !== addresses.pricingPolicy
  ) {
    throw new Error("Registrar dependency validation failed");
  }
}

function injectedProvider(): EIP1193Provider {
  const provider = (
    window as Window & { ethereum?: EIP1193Provider }
  ).ethereum;
  if (!provider) {
    throw new Error("No injected browser wallet was detected");
  }
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
      params: [
        {
          chainId: "0x33",
          chainName: apothem.name,
          nativeCurrency: apothem.nativeCurrency,
          rpcUrls: apothem.rpcUrls.default.http,
          blockExplorerUrls: [apothem.blockExplorers.default.url],
        },
      ],
    });
  }
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return "The wallet operation failed";
}
