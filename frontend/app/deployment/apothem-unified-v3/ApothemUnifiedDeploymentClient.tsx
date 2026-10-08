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
import { apothemUnifiedDeploymentArtifacts as artifacts } from "../../../generated/apothemUnifiedDeployment";

const OWNER = getAddress("0x9c67d6cfE6A73497e7348b6b852495CA6236C29a");
const USDC = getAddress("0xb5AB69F7bBada22B28e79C8FFAECe55eF1c771D4");
const CREATE2_DEPLOYER = getAddress("0x4e59b44847b379578588920ca78fbf26c0b4956c");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const CHAIN_ID = 51;

const apothem = {
  id: CHAIN_ID,
  name: "XDC Apothem",
  nativeCurrency: { name: "TXDC", symbol: "TXDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.apothem.network"] } },
  blockExplorers: {
    default: { name: "XDCScan Testnet", url: "https://testnet.xdcscan.com" },
  },
} as const;

type MetaMaskProvider = EIP1193Provider & {
  isMetaMask?: boolean;
  isRabby?: boolean;
  providers?: MetaMaskProvider[];
};
type Artifact = { abi: readonly unknown[]; bytecode: string };
type StepState = "pending" | "wallet" | "confirming" | "complete" | "failed";
type Step = {
  label: string;
  state: StepState;
  hash?: Hex;
  address?: Address;
  error?: string;
};
type Deployment = {
  pricingPolicy: Address;
  registry: Address;
  resolver: Address;
  registrar: Address;
  authorizationSigner: Address;
};

const initialSteps: Step[] = [
  { label: "Validate the clean-bootstrap dependencies", state: "pending" },
  { label: "Deploy Pricing Policy V2", state: "pending" },
  { label: "Deploy Registry V3", state: "pending" },
  { label: "Deploy Universal Resolver", state: "pending" },
  { label: "Deploy Unified Registrar", state: "pending" },
  { label: "Initialize the new Registry registrar", state: "pending" },
  { label: "Validate every immutable binding and control", state: "pending" },
];

export default function ApothemUnifiedDeploymentClient() {
  const [account, setAccount] = useState<Address>();
  const [deployment, setDeployment] = useState<Deployment>();
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "Connect the designated Apothem owner wallet to run the read-only preflight.",
  );

  function updateStep(index: number, patch: Partial<Step>) {
    setSteps((current) =>
      current.map((step, position) =>
        position === index ? { ...step, ...patch } : step,
      ),
    );
  }

  async function connect() {
    setBusy(true);
    try {
      const provider = injectedProvider();
      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!accounts[0]) throw new Error("Wallet returned no account");
      const selected = getAddress(accounts[0]);
      if (selected !== OWNER) {
        throw new Error("Select the designated Apothem owner wallet");
      }
      await ensureApothem(provider);
      const publicClient = createPublicClient({
        chain: apothem,
        transport: custom(provider),
      });
      await validateDependencies(publicClient, selected);
      const predicted = predictDeployment();
      await validateExistingDeployment(publicClient, predicted);
      setAccount(selected);
      setDeployment(predicted);
      updateStep(0, { state: "complete", error: undefined });
      setMessage(
        "Preflight passed. Review the deterministic addresses, then deploy the four-contract clean Apothem stack.",
      );
    } catch (cause) {
      const error = errorMessage(cause);
      updateStep(0, { state: "failed", error });
      setMessage(error);
    } finally {
      setBusy(false);
    }
  }

  async function deploy() {
    if (!account || !deployment || busy) return;
    setBusy(true);
    try {
      const provider = injectedProvider();
      await ensureApothem(provider);
      const publicClient = createPublicClient({
        chain: apothem,
        transport: custom(provider),
      });
      const walletClient = createWalletClient({
        chain: apothem,
        transport: custom(provider),
      });
      await validateDependencies(publicClient, account);
      const send = (data: Hex) =>
        walletClient.sendTransaction({
          account,
          chain: apothem,
          to: CREATE2_DEPLOYER,
          data,
          value: 0n,
        });

      await deployOne({
        artifact: artifacts.pricingPolicy,
        args: [pricingConfig(), OWNER],
        saltValue: salt(25101),
        expected: deployment.pricingPolicy,
        stepIndex: 1,
        publicClient,
        send,
        updateStep,
      });
      await deployOne({
        artifact: artifacts.registry,
        args: [OWNER, ZERO_ADDRESS],
        saltValue: salt(25102),
        expected: deployment.registry,
        stepIndex: 2,
        publicClient,
        send,
        updateStep,
      });
      await deployOne({
        artifact: artifacts.resolver,
        args: [deployment.registry],
        saltValue: salt(25103),
        expected: deployment.resolver,
        stepIndex: 3,
        publicClient,
        send,
        updateStep,
      });
      await deployOne({
        artifact: artifacts.registrar,
        args: [
          deployment.registry,
          deployment.resolver,
          ZERO_ADDRESS,
          deployment.pricingPolicy,
          deployment.authorizationSigner,
          OWNER,
        ],
        saltValue: salt(25104),
        expected: deployment.registrar,
        stepIndex: 4,
        publicClient,
        send,
        updateStep,
      });

      const activeRegistrar = getAddress(
        (await publicClient.readContract({
          address: deployment.registry,
          abi: artifacts.registry.abi,
          functionName: "registrar",
        })) as Address,
      );
      if (activeRegistrar === ZERO_ADDRESS) {
        updateStep(5, { state: "wallet", address: deployment.registrar });
        const hash = await walletClient.writeContract({
          account,
          chain: apothem,
          address: deployment.registry,
          abi: artifacts.registry.abi,
          functionName: "setRegistrar",
          args: [deployment.registrar],
        });
        updateStep(5, {
          state: "confirming",
          hash,
          address: deployment.registrar,
        });
        await successfulReceipt(publicClient, hash, "Registrar initialization");
        updateStep(5, {
          state: "complete",
          hash,
          address: deployment.registrar,
        });
      } else if (activeRegistrar === deployment.registrar) {
        updateStep(5, { state: "complete", address: deployment.registrar });
      } else {
        throw new Error("Registry V3 already points to an unexpected registrar");
      }

      updateStep(6, { state: "confirming" });
      await validateDeployment(publicClient, deployment);
      updateStep(6, { state: "complete" });
      setMessage(
        "Unified V3 is deployed and internally initialized on Apothem. It is not active in the dev application; verify source and complete smoke tests before cutover.",
      );
    } catch (cause) {
      const error = errorMessage(cause);
      setSteps((current) => {
        const failing = current.findIndex(
          (step) => step.state === "wallet" || step.state === "confirming",
        );
        return failing < 0
          ? current
          : current.map((step, index) =>
              index === failing ? { ...step, state: "failed", error } : step,
            );
      });
      setMessage(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl space-y-7">
        <section className="rounded-3xl border border-cyan-800 bg-cyan-950/50 p-6 sm:p-7">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">
            Apothem only · deployment without activation
          </p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
            Deploy Unified XDCID V3
          </h1>
          <p className="mt-3 text-slate-300">
            This protected console deploys a fresh four-contract stack after the
            Apothem rollback and initializes only its new Registry. It never changes
            frontend or quote-service configuration.
          </p>
        </section>

        <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 sm:p-7">
          <dl className="grid gap-4 text-sm md:grid-cols-2">
            <Detail label="Protocol owner" value={OWNER} />
            <Detail label="Migration state" value="Clean bootstrap (no surviving legacy bytecode)" />
            <Detail label="Circle Apothem USDC" value={USDC} />
          </dl>
          <p className="mt-5 rounded-xl bg-slate-800 p-4 text-slate-200">{message}</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              className="rounded-xl border border-cyan-500 px-5 py-3 font-semibold text-cyan-200 disabled:opacity-50"
              onClick={connect}
              disabled={busy}
            >
              {account ? "Owner wallet verified" : "Connect and run preflight"}
            </button>
            <button
              className="rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-40"
              onClick={deploy}
              disabled={!account || !deployment || busy}
            >
              Deploy clean V3 stack
            </button>
            {deployment ? (
              <a
                className="rounded-xl border border-cyan-500 px-5 py-3 text-center font-semibold text-cyan-200"
                href="/deployment/apothem-unified-v3-smoke"
              >
                Open wallet smoke tests
              </a>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 sm:p-7">
          <h2 className="text-2xl font-semibold">Deterministic addresses</h2>
          {deployment ? (
            <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2">
              <Detail label="Registry V3" value={deployment.registry} />
              <Detail label="Universal Resolver" value={deployment.resolver} />
              <Detail label="Unified Registrar" value={deployment.registrar} />
              <Detail label="Pricing Policy V2" value={deployment.pricingPolicy} />
              <Detail
                label="Authorization signer"
                value={deployment.authorizationSigner}
              />
            </dl>
          ) : (
            <p className="mt-5 rounded-xl border border-dashed border-slate-700 p-4 text-slate-400">
              Run preflight to calculate and inspect the addresses.
            </p>
          )}
        </section>

        <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 sm:p-7">
          <h2 className="text-2xl font-semibold">Deployment sequence</h2>
          <ol className="mt-5 space-y-4">
            {steps.map((step, index) => (
              <li key={step.label} className="rounded-xl border border-slate-700 p-4">
                <div className="flex flex-wrap justify-between gap-3">
                  <span>{index + 1}. {step.label}</span>
                  <span className="font-semibold text-cyan-300">{step.state}</span>
                </div>
                {step.hash ? <TransactionLink hash={step.hash} /> : null}
                {step.address ? (
                  <p className="mt-2 break-all font-mono text-sm text-slate-300">
                    {step.address}
                  </p>
                ) : null}
                {step.error ? (
                  <p className="mt-2 break-words text-sm text-red-300">{step.error}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        {deployment ? (
          <section className="rounded-3xl border border-amber-700 bg-amber-950/30 p-6 sm:p-7">
            <h2 className="text-2xl font-semibold">Inactive configuration preview</h2>
            <pre className="mt-4 overflow-x-auto rounded-xl bg-black/40 p-5 text-sm text-amber-100">
              {JSON.stringify(environmentValues(deployment), null, 2)}
            </pre>
            <p className="mt-4 text-sm text-amber-200">
              Do not apply these values until source verification, clean-bootstrap
              smoke tests, and explicit cutover approval are complete.
            </p>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function pricingConfig() {
  return {
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
}

function predictDeployment(): Deployment {
  const pricingPolicy = predictedAddress(
    artifacts.pricingPolicy,
    [pricingConfig(), OWNER],
    salt(25101),
  );
  const registry = predictedAddress(
    artifacts.registry,
    [OWNER, ZERO_ADDRESS],
    salt(25102),
  );
  const resolver = predictedAddress(artifacts.resolver, [registry], salt(25103));
  const registrar = predictedAddress(
    artifacts.registrar,
    [
      registry,
      resolver,
      ZERO_ADDRESS,
      pricingPolicy,
      OWNER,
      OWNER,
    ],
    salt(25104),
  );
  return {
    pricingPolicy,
    registry,
    resolver,
    registrar,
    authorizationSigner: OWNER,
  };
}

function predictedAddress(
  artifact: Artifact,
  args: readonly unknown[],
  saltValue: Hex,
): Address {
  const data = encodeDeployData({
    abi: artifact.abi as Abi,
    bytecode: artifact.bytecode as Hex,
    args,
  });
  return getAddress(
    getContractAddress({
      bytecode: data,
      from: CREATE2_DEPLOYER,
      opcode: "CREATE2",
      salt: saltValue,
    }),
  );
}

async function deployOne(input: {
  artifact: Artifact;
  args: readonly unknown[];
  saltValue: Hex;
  expected: Address;
  stepIndex: number;
  publicClient: PublicClient;
  send: (data: Hex) => Promise<Hex>;
  updateStep: (index: number, patch: Partial<Step>) => void;
}) {
  const data = encodeDeployData({
    abi: input.artifact.abi as Abi,
    bytecode: input.artifact.bytecode as Hex,
    args: input.args,
  });
  if (predictedAddress(input.artifact, input.args, input.saltValue) !== input.expected) {
    throw new Error("Deterministic address changed unexpectedly");
  }
  input.updateStep(input.stepIndex, { state: "wallet", address: input.expected });
  const existingCode = await input.publicClient.getCode({ address: input.expected });
  let hash: Hex | undefined;
  if (!existingCode || existingCode === "0x") {
    hash = await input.send(`${input.saltValue}${data.slice(2)}` as Hex);
    input.updateStep(input.stepIndex, {
      state: "confirming",
      hash,
      address: input.expected,
    });
    await successfulReceipt(input.publicClient, hash, "Contract deployment");
  }
  await requireCode(input.publicClient, input.expected, "deployed contract");
  input.updateStep(input.stepIndex, {
    state: "complete",
    address: input.expected,
    ...(hash ? { hash } : {}),
  });
}

async function validateDependencies(
  client: PublicClient,
  account: Address,
): Promise<void> {
  for (const [label, address] of [
    ["Circle Apothem USDC", USDC],
    ["CREATE2 deployer", CREATE2_DEPLOYER],
  ] as const) {
    await requireCode(client, address, label);
  }
  const balance = await client.getBalance({ address: account });
  if (balance === 0n) throw new Error("The owner wallet has no TXDC for deployment gas");

  const decimals = await client.readContract({
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
  if (decimals !== 6) throw new Error("Circle Apothem USDC must use six decimals");
}

async function validateExistingDeployment(
  client: PublicClient,
  deployment: Deployment,
) {
  const codes = await Promise.all(
    [deployment.pricingPolicy, deployment.registry, deployment.resolver, deployment.registrar].map(
      (address) => client.getCode({ address }),
    ),
  );
  const deployedCount = codes.filter((code) => code && code !== "0x").length;
  if (deployedCount !== 0 && deployedCount !== 4) {
    throw new Error("Only part of the deterministic V3 stack is deployed");
  }
  if (deployedCount === 4) await validateDeployment(client, deployment);
}

async function validateDeployment(client: PublicClient, deployment: Deployment) {
  for (const [label, address] of [
    ["Registry V3", deployment.registry],
    ["Universal Resolver", deployment.resolver],
    ["Unified Registrar", deployment.registrar],
    ["Pricing Policy V2", deployment.pricingPolicy],
  ] as const) {
    await requireCode(client, address, label);
  }
  const [
    registryOwner,
    pendingOwner,
    activeRegistrar,
    legacyRegistry,
    resolverRegistry,
    registrarOwner,
    registrarRegistry,
    registrarResolver,
    registrarLegacySubdomains,
    registrarPolicy,
    registrarSigner,
    registrarAuthorization,
    registrarConsumer,
    pendingConfiguration,
    topRegistrationPaused,
    topRenewalPaused,
    subRegistrationPaused,
    subRenewalPaused,
    policyVersion,
  ] = await Promise.all([
    client.readContract({ address: deployment.registry, abi: artifacts.registry.abi, functionName: "owner" }),
    client.readContract({ address: deployment.registry, abi: artifacts.registry.abi, functionName: "pendingOwner" }),
    client.readContract({ address: deployment.registry, abi: artifacts.registry.abi, functionName: "registrar" }),
    client.readContract({ address: deployment.registry, abi: artifacts.registry.abi, functionName: "legacyRegistry" }),
    client.readContract({ address: deployment.resolver, abi: artifacts.resolver.abi, functionName: "registry" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "owner" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "registry" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "resolver" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "legacySubdomains" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "pricingPolicy" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "authorizationSigner" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "discountAuthorization" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "consumer" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "hasPendingConfiguration" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "topLevelRegistrationsPaused" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "topLevelRenewalsPaused" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "subdomainRegistrationsPaused" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "subdomainRenewalsPaused" }),
    client.readContract({ address: deployment.pricingPolicy, abi: artifacts.pricingPolicy.abi, functionName: "version" }),
  ]);
  const [policyOwner, policyConfig] = await Promise.all([
    client.readContract({
      address: deployment.pricingPolicy,
      abi: artifacts.pricingPolicy.abi,
      functionName: "owner",
    }),
    client.readContract({
      address: deployment.pricingPolicy,
      abi: artifacts.pricingPolicy.abi,
      functionName: "config",
    }),
  ]);
  const config = policyConfig as {
    twoCharacterAnnualUsdMicros: bigint;
    threeCharacterAnnualUsdMicros: bigint;
    fourCharacterAnnualUsdMicros: bigint;
    standardAnnualUsdMicros: bigint;
    subdomainAnnualUsdMicros: bigint;
    premiumSubdomainAnnualUsdMicros: bigint;
    migrationUsdMicros: bigint;
    threeYearDiscountBps: number;
    fiveYearDiscountBps: number;
    tenYearDiscountBps: number;
    xdcQuoteBufferBps: number;
    quoteSigner: Address;
    usdcToken: Address;
    treasury: Address;
    xdcPaymentsEnabled: boolean;
    usdcPaymentsEnabled: boolean;
  };
  const addressChecks: Array<[unknown, Address]> = [
    [registryOwner, OWNER],
    [pendingOwner, ZERO_ADDRESS],
    [activeRegistrar, deployment.registrar],
    [legacyRegistry, ZERO_ADDRESS],
    [resolverRegistry, deployment.registry],
    [registrarOwner, OWNER],
    [registrarRegistry, deployment.registry],
    [registrarResolver, deployment.resolver],
    [registrarLegacySubdomains, ZERO_ADDRESS],
    [registrarPolicy, deployment.pricingPolicy],
    [registrarSigner, deployment.authorizationSigner],
    [registrarAuthorization, deployment.registrar],
    [registrarConsumer, deployment.registrar],
  ];
  if (
    addressChecks.some(([actual, expected]) => getAddress(actual as Address) !== expected) ||
    Boolean(pendingConfiguration) ||
    Boolean(topRegistrationPaused) ||
    Boolean(topRenewalPaused) ||
    Boolean(subRegistrationPaused) ||
    Boolean(subRenewalPaused) ||
    BigInt(policyVersion as bigint) !== 1n ||
    getAddress(policyOwner as Address) !== OWNER ||
    config.twoCharacterAnnualUsdMicros !== 50_000_000n ||
    config.threeCharacterAnnualUsdMicros !== 20_000_000n ||
    config.fourCharacterAnnualUsdMicros !== 10_000_000n ||
    config.standardAnnualUsdMicros !== 5_000_000n ||
    config.subdomainAnnualUsdMicros !== 1_000_000n ||
    config.premiumSubdomainAnnualUsdMicros !== 5_000_000n ||
    config.migrationUsdMicros !== 3_000_000n ||
    config.threeYearDiscountBps !== 1_000 ||
    config.fiveYearDiscountBps !== 1_500 ||
    config.tenYearDiscountBps !== 2_000 ||
    config.xdcQuoteBufferBps !== 200 ||
    getAddress(config.quoteSigner) !== OWNER ||
    getAddress(config.usdcToken) !== USDC ||
    getAddress(config.treasury) !== OWNER ||
    config.xdcPaymentsEnabled !== true ||
    config.usdcPaymentsEnabled !== true
  ) {
    throw new Error("The deployed V3 stack failed immutable or control validation");
  }
}

function environmentValues(deployment: Deployment) {
  return {
    NEXT_PUBLIC_XNS_PROTOCOL_GENERATION: "unified-v3",
    NEXT_PUBLIC_XNS_REGISTRY: deployment.registry,
    NEXT_PUBLIC_XNS_REGISTRAR: deployment.registrar,
    XNS_SIGNED_QUOTE_REGISTRAR: deployment.registrar,
    NEXT_PUBLIC_XNS_PRICING_POLICY: deployment.pricingPolicy,
    NEXT_PUBLIC_XNS_ADMIN_PRICING_POLICY: deployment.pricingPolicy,
    XNS_PRICING_POLICY: deployment.pricingPolicy,
    NEXT_PUBLIC_XNS_PRICING_POLICY_VERSION: "v2",
    NEXT_PUBLIC_XNS_ADMIN_PRICING_POLICY_VERSION: "v2",
    XNS_PRICING_POLICY_VERSION: "v2",
    XNS_QUOTE_CHAIN_ID: "51",
    NEXT_PUBLIC_XNS_RESOLVER: deployment.resolver,
    NEXT_PUBLIC_XNS_RESOLVER_V2: deployment.resolver,
    NEXT_PUBLIC_XNS_REVERSE_RESOLVER_V2: deployment.resolver,
    NEXT_PUBLIC_XNS_MULTICHAIN_RESOLVER: deployment.resolver,
    NEXT_PUBLIC_XNS_SUBDOMAIN_REGISTRAR: deployment.registrar,
    XNS_SUBDOMAIN_REGISTRAR: deployment.registrar,
    NEXT_PUBLIC_SIGNED_REGISTRAR_ENABLED: "true",
    NEXT_PUBLIC_SUBDOMAIN_REGISTRATION_ENABLED: "true",
  };
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className="break-all font-mono">{value}</dd>
    </div>
  );
}

function TransactionLink({ hash }: { hash: Hex }) {
  return (
    <a
      className="mt-2 block break-a [{
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
    return text.length > 320 ? `${text.slice(0, 317)}...` : text;
  }
  return "The deployment operation failed";
}
