"use client";

import { useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeDeployData,
  getAddress,
  getContractAddress,
  isAddress,
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
const CREATE2_DEPLOYER = getAddress("0x4e59b44847b379578588920ca78fbf26c0b4956c");
const CREATE2_SALT = (suffix: number) =>
  (`0x${suffix.toString(16).padStart(64, "0")}`) as Hex;
const STORAGE_KEY = "xdcid:mainnet-v2-deployment";

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
  discountAuthorization?: Address;
  registrar?: Address;
  subdomainRegistrar?: Address;
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
  { label: "Deploy Pricing Policy V2", state: "pending" },
  { label: "Deploy Discount Authorization", state: "pending" },
  { label: "Deploy Registrar V2", state: "pending" },
  { label: "Propose Registrar V2 as discount consumer", state: "pending" },
  { label: "Deploy standalone Subdomain Registrar", state: "pending" },
  { label: "Validate deployed contracts", state: "pending" },
];

export default function MainnetPricingDeploymentClient() {
  const [account, setAccount] = useState<Address>();
  const [deployment, setDeployment] = useState<Deployment>({});
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const [busy, setBusy] = useState(false);
  const [quoteSigner, setQuoteSigner] = useState("");
  const [discountSigner, setDiscountSigner] = useState("");
  const [treasury, setTreasury] = useState("");
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
    if (![quoteSigner, discountSigner, treasury].every((value) => isAddress(value))) {
      setMessage("Enter valid quote-signer, discount-signer, and treasury addresses.");
      return;
    }
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

      const configuredQuoteSigner = getAddress(quoteSigner);
      const configuredDiscountSigner = getAddress(discountSigner);
      const configuredTreasury = getAddress(treasury);

      const pricingConfig = {
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
        quoteSigner: configuredQuoteSigner,
        usdcToken: USDC,
        treasury: configuredTreasury,
        xdcPaymentsEnabled: true,
        usdcPaymentsEnabled: true,
      };

      const pricingPolicy = await deployContract({
        index: 1,
        clients,
        artifact: mainnetPricingDeploymentArtifacts.pricingPolicy,
        args: [pricingConfig, OWNER],
        salt: CREATE2_SALT(301),
        updateStep,
      });
      setDeployment({ pricingPolicy });

      const discountAuthorization = await deployContract({
        index: 2,
        clients,
        artifact: mainnetPricingDeploymentArtifacts.discountAuthorization,
        args: [OWNER, configuredDiscountSigner, OWNER],
        salt: CREATE2_SALT(302),
        updateStep,
      });
      setDeployment({ pricingPolicy, discountAuthorization });

      const registrar = await deployContract({
        index: 3,
        clients,
        artifact: mainnetPricingDeploymentArtifacts.registrar,
        args: [
          REGISTRY,
          LEGACY_REGISTRY,
          pricingPolicy,
          discountAuthorization,
          OWNER,
        ],
        salt: CREATE2_SALT(303),
        updateStep,
      });
      setDeployment({ pricingPolicy, discountAuthorization, registrar });

      updateStep(4, { state: "wallet" });
      const proposalHash = await clients.walletClient.writeContract({
        account,
        chain: xdcMainnet,
        address: discountAuthorization,
        abi: mainnetPricingDeploymentArtifacts.discountAuthorization.abi,
        functionName: "proposeConfiguration",
        args: [configuredDiscountSigner, registrar],
      });
      updateStep(4, { state: "confirming", hash: proposalHash });
      const proposalReceipt = await clients.publicClient.waitForTransactionReceipt({
        hash: proposalHash,
        confirmations: 2,
        timeout: 180_000,
      });
      if (proposalReceipt.status !== "success") {
        throw new Error("Discount consumer proposal failed");
      }
      updateStep(4, { state: "complete", hash: proposalHash });

      const subdomainRegistrar = await deployContract({
        index: 5,
        clients,
        artifact: mainnetPricingDeploymentArtifacts.subdomainRegistrar,
        args: [REGISTRY, pricingPolicy, OWNER],
        salt: CREATE2_SALT(304),
        updateStep,
      });
      const completed = {
        pricingPolicy,
        discountAuthorization,
        registrar,
        subdomainRegistrar,
      };
      setDeployment(completed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(completed));

      updateStep(6, { state: "confirming" });
      await validateDeployment(
        clients.publicClient,
        completed,
        account,
        pricingConfig,
        configuredDiscountSigner,
      );
      updateStep(6, { state: "complete" });
      setMessage(
        "The V2 and subdomain contracts are deployed and validated. Nothing was activated. Wait 48 hours before activating the discount consumer, then run the separate registrar activation preflight.",
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
            Deploy XDCID V2 and subdomains
          </h1>
          <p className="mt-3 text-slate-700">
            This temporary page deploys four contracts and proposes the delayed
            discount-consumer update. It cannot activate the registry registrar
            and it never reads, transmits, or stores a private key.
          </p>
        </section>

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <dl className="grid gap-4 text-sm md:grid-cols-2">
            <Detail label="Allowed deployment and contract-owner wallet" value={OWNER} />
            <Detail label="Existing registry" value={REGISTRY} />
            <Detail label="Legacy collision registry" value={LEGACY_REGISTRY} />
            <Detail label="XDC USDC (6 decimals)" value={USDC} />
            <Detail label="Rabby-compatible deployment proxy" value={CREATE2_DEPLOYER} />
          </dl>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <AddressField label="Quote signer" value={quoteSigner} onChange={setQuoteSigner} />
            <AddressField label="Discount signer" value={discountSigner} onChange={setDiscountSigner} />
            <AddressField label="Treasury" value={treasury} onChange={setTreasury} />
          </div>
          <p className="mt-3 text-xs text-slate-600">
            These are public role addresses only. Never enter a private key. Review all three addresses before every wallet confirmation.
          </p>
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
              {busy ? "Deployment in progress..." : "Deploy and validate V2 stack"}
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

function AddressField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm font-medium">
      {props.label}
      <input
        className="mt-2 w-full rounded-xl border p-3 font-mono text-xs"
        placeholder="0x…"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
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

    const factoryData = `${input.salt}${data.slice(2)}` as Hex;
    const hash = await input.clients.walletClient.sendTransaction({
      account: input.clients.account,
      chain: xdcMainnet,
      to: CREATE2_DEPLOYER,
      data: factoryData,
      value: 0n,
    });
    input.updateStep(input.index, { state: "confirming", hash });
    const receipt = await input.clients.publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 2,
      timeout: 180_000,
    });
    if (receipt.status !== "success") {
      throw new Error(initialSteps[input.index].label + " failed");
    }
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
  await requireCode(publicClient, CREATE2_DEPLOYER, "deployment proxy");

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
  expectedDiscountSigner: Address,
) {
  const policyAbi = mainnetPricingDeploymentArtifacts.pricingPolicy.abi as Abi;
  const registrarAbi = mainnetPricingDeploymentArtifacts.registrar.abi as Abi;
  const discountAbi =
    mainnetPricingDeploymentArtifacts.discountAuthorization.abi as Abi;
  const subdomainAbi =
    mainnetPricingDeploymentArtifacts.subdomainRegistrar.abi as Abi;

  const [
    policyOwner,
    config,
    version,
    registry,
    legacy,
    policy,
    authorization,
    registrarOwner,
    discountOwner,
    pendingDiscountSigner,
    pendingConsumer,
    hasPendingConfiguration,
    subdomainOwner,
    subdomainRegistry,
    subdomainPolicy,
  ] =
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
      publicClient.readContract({
        address: deployment.registrar,
        abi: registrarAbi,
        functionName: "discountAuthorization",
      }),
      publicClient.readContract({
        address: deployment.registrar,
        abi: registrarAbi,
        functionName: "owner",
      }),
      publicClient.readContract({
        address: deployment.discountAuthorization,
        abi: discountAbi,
        functionName: "owner",
      }),
      publicClient.readContract({
        address: deployment.discountAuthorization,
        abi: discountAbi,
        functionName: "pendingAuthorizationSigner",
      }),
      publicClient.readContract({
        address: deployment.discountAuthorization,
        abi: discountAbi,
        functionName: "pendingConsumer",
      }),
      publicClient.readContract({
        address: deployment.discountAuthorization,
        abi: discountAbi,
        functionName: "hasPendingConfiguration",
      }),
      publicClient.readContract({
        address: deployment.subdomainRegistrar,
        abi: subdomainAbi,
        functionName: "owner",
      }),
      publicClient.readContract({
        address: deployment.subdomainRegistrar,
        abi: subdomainAbi,
        functionName: "registry",
      }),
      publicClient.readContract({
        address: deployment.subdomainRegistrar,
        abi: subdomainAbi,
        functionName: "pricingPolicy",
      }),
    ]);

  if (
    [policyOwner, registrarOwner, discountOwner, subdomainOwner].some(
      (owner) => getAddress(owner as Address) !== account,
    ) ||
    BigInt(version as bigint) !== 1n
  ) {
    throw new Error("Pricing-policy owner or version validation failed");
  }

  const values = config as {
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
  if (
    values.twoCharacterAnnualUsdMicros !== 50_000_000n ||
    values.threeCharacterAnnualUsdMicros !== 20_000_000n ||
    values.fourCharacterAnnualUsdMicros !== 10_000_000n ||
    values.standardAnnualUsdMicros !== 5_000_000n ||
    values.subdomainAnnualUsdMicros !== 1_000_000n ||
    values.premiumSubdomainAnnualUsdMicros !== 5_000_000n ||
    values.migrationUsdMicros !== 3_000_000n ||
    values.threeYearDiscountBps !== 1_000 ||
    values.fiveYearDiscountBps !== 1_500 ||
    values.tenYearDiscountBps !== 2_000 ||
    values.xdcQuoteBufferBps !== 200 ||
    getAddress(values.quoteSigner) !== expectedConfig.quoteSigner ||
    getAddress(values.usdcToken) !== expectedConfig.usdcToken ||
    getAddress(values.treasury) !== expectedConfig.treasury ||
    values.xdcPaymentsEnabled !== true ||
    values.usdcPaymentsEnabled !== true
  ) {
    throw new Error("Pricing-policy configuration validation failed");
  }

  if (
    getAddress(registry as Address) !== REGISTRY ||
    getAddress(legacy as Address) !== LEGACY_REGISTRY ||
    getAddress(policy as Address) !== deployment.pricingPolicy ||
    getAddress(authorization as Address) !== deployment.discountAuthorization ||
    getAddress(pendingDiscountSigner as Address) !== expectedDiscountSigner ||
    getAddress(pendingConsumer as Address) !== deployment.registrar ||
    hasPendingConfiguration !== true ||
    getAddress(subdomainRegistry as Address) !== REGISTRY ||
    getAddress(subdomainPolicy as Address) !== deployment.pricingPolicy
  ) {
    throw new Error("V2 deployment dependency validation failed");
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
