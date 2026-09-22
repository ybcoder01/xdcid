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
import { mainnetPrimaryResolutionDeploymentArtifacts as artifacts } from "../../../generated/mainnetPrimaryResolutionDeployment";

const OWNER = getAddress("0xe82a4267CC310FC6Db334601671A043DFc8Ce06A");
const REGISTRY = getAddress("0x05fa64a05bc205DeDF47e023d2D90c2d119cd097");
const LEGACY = getAddress("0x295a7aB79368187a6CD03c464cfaAb04d799784E");
const POLICY = getAddress("0x8aE4b7E57b6693c70FD40F5De17974CA5AB6DB94");
const AUTHORIZATION = getAddress("0x9EE907230d351264403555fA6967EA44Ba31A5d1");
const CURRENT_REGISTRAR = getAddress("0xdEaf1742614908a8d170f4c9520c3cd1e967ef36");
const CREATE2_DEPLOYER = getAddress("0x4e59b44847b379578588920ca78fbf26c0b4956c");
const CHAIN_ID = 50;
const salt = (value: number) =>
  (`0x${value.toString(16).padStart(64, "0")}`) as Hex;

const xdc = {
  id: CHAIN_ID,
  name: "XDC Network",
  nativeCurrency: { name: "XDC", symbol: "XDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://earpc.xinfin.network"] } },
  blockExplorers: { default: { name: "XDCScan", url: "https://xdcscan.com" } },
} as const;

const registryAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "registrar", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;
const ownableAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;
const authorizationAbi = [
  ...ownableAbi,
  { type: "function", name: "consumer", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

type MetaMaskProvider = EIP1193Provider & {
  isMetaMask?: boolean;
  isRabby?: boolean;
  providers?: MetaMaskProvider[];
};
type StepState = "pending" | "wallet" | "confirming" | "complete" | "failed";
type Step = { label: string; state: StepState; hash?: Hex; address?: Address; error?: string };
type Artifact = { abi: readonly unknown[]; bytecode: string };
type Deployment = {
  forwardResolver?: Address;
  reverseResolver?: Address;
  registrar?: Address;
  multichainResolver?: Address;
};

const initialSteps: Step[] = [
  { label: "Validate owner wallet and active mainnet dependencies", state: "pending" },
  { label: "Deploy owner-bound Forward Resolver V2", state: "pending" },
  { label: "Deploy owner-verified Reverse Resolver V3", state: "pending" },
  { label: "Deploy the primary-aware Registrar", state: "pending" },
  { label: "Deploy primary-aware Multichain Resolver V2", state: "pending" },
  { label: "Validate code and every immutable contract binding", state: "pending" },
];

export default function MainnetPrimaryResolutionDeploymentClient() {
  const [account, setAccount] = useState<Address>();
  const [deployment, setDeployment] = useState<Deployment>({});
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "Connect the designated XDC mainnet owner wallet to run read-only checks.",
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
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts[0]) throw new Error("Wallet returned no account");
      const selected = getAddress(accounts[0]);
      if (selected !== OWNER) throw new Error("Select the designated XDCID owner wallet");
      await ensureXdc(provider);
      const publicClient = createPublicClient({ chain: xdc, transport: custom(provider) });
      await validateDependencies(publicClient, selected);
      setAccount(selected);
      updateStep(0, { state: "complete", error: undefined });
      setMessage(
        "Preflight passed. Four inactive candidate contracts can now be deployed. No active contract or production variable will change.",
      );
    } catch (cause) {
      const error = errorMessage(cause);
      updateStep(0, { state: "failed", error });
      setMessage(error);
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
      await ensureXdc(provider);
      const currentAccounts = (await provider.request({ method: "eth_accounts" })) as string[];
      if (!currentAccounts[0] || getAddress(currentAccounts[0]) !== account) {
        throw new Error("The selected wallet changed; reconnect and run preflight again");
      }
      const publicClient = createPublicClient({ chain: xdc, transport: custom(provider) });
      const walletClient = createWalletClient({ chain: xdc, transport: custom(provider) });
      await validateDependencies(publicClient, account);

      const send = (data: Hex) =>
        walletClient.sendTransaction({ account, chain: xdc, to: CREATE2_DEPLOYER, data, value: 0n });

      const forwardResolver = await deployOne({
        artifact: artifacts.forwardResolver,
        args: [REGISTRY],
        saltValue: salt(24001),
        stepIndex: 1,
        publicClient,
        send,
        updateStep,
      });
      setDeployment({ forwardResolver });

      const reverseResolver = await deployOne({
        artifact: artifacts.reverseResolver,
        args: [REGISTRY],
        saltValue: salt(24002),
        stepIndex: 2,
        publicClient,
        send,
        updateStep,
      });
      setDeployment({ forwardResolver, reverseResolver });

      const registrar = await deployOne({
        artifact: artifacts.registrar,
        args: [REGISTRY, LEGACY, POLICY, AUTHORIZATION, reverseResolver, OWNER],
        saltValue: salt(24003),
        stepIndex: 3,
        publicClient,
        send,
        updateStep,
      });
      setDeployment({ forwardResolver, reverseResolver, registrar });

      const multichainResolver = await deployOne({
        artifact: artifacts.multichainResolver,
        args: [REGISTRY, reverseResolver],
        saltValue: salt(24004),
        stepIndex: 4,
        publicClient,
        send,
        updateStep,
      });
      const completed = { forwardResolver, reverseResolver, registrar, multichainResolver };
      setDeployment(completed);

      updateStep(5, { state: "confirming" });
      await validateDeployment(publicClient, completed);
      updateStep(5, { state: "complete" });
      setMessage(
        "Candidate deployment is complete and inactive. Record the addresses and transaction hashes; do not activate or update Production yet.",
      );
    } catch (cause) {
      const error = errorMessage(cause);
      setMessage(error);
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl space-y-7">
        <section className="rounded-3xl border border-red-300 bg-red-50 p-6 sm:p-7">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-800">
            XDC mainnet · candidate deployment
          </p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
            Deploy primary-resolution candidates
          </h1>
          <p className="mt-3 text-slate-700">
            This page creates four inactive contracts on chain ID 50. It cannot
            activate a Registrar, change Production variables, or transfer ownership.
          </p>
        </section>

        <section className="rounded-3xl border bg-white p-6 shadow-sm sm:p-7">
          <dl className="grid gap-4 text-sm md:grid-cols-2">
            <Detail label="Designated owner wallet" value={OWNER} />
            <Detail label="Existing Registry" value={REGISTRY} />
            <Detail label="Existing Pricing Policy" value={POLICY} />
            <Detail label="Existing Discount Authorization" value={AUTHORIZATION} />
            <Detail label="Current active Registrar" value={CURRENT_REGISTRAR} />
            <Detail label="Transactions required" value="Four contract deployments" />
          </dl>
          <p className="mt-5 rounded-xl bg-slate-100 p-4">{message}</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
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
              {busy ? "Deployment in progress..." : "Deploy four candidates"}
            </button>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-6 shadow-sm sm:p-7">
          <h2 className="text-2xl font-semibold">Transaction sequence</h2>
          <ol className="mt-5 space-y-4">
            {steps.map((step, index) => (
              <li key={step.label} className="rounded-xl border p-4">
                <div className="flex flex-wrap justify-between gap-3">
                  <span>{index + 1}. {step.label}</span>
                  <span className="font-semibold">{step.state}</span>
                </div>
                {step.hash ? <TransactionLink hash={step.hash} /> : null}
                {step.address ? <p className="mt-2 break-all font-mono text-sm">{step.address}</p> : null}
                {step.error ? <p className="mt-2 break-words text-sm text-red-700">{step.error}</p> : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-3xl border bg-white p-6 shadow-sm sm:p-7">
          <h2 className="text-2xl font-semibold">Candidate manifest values</h2>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-950 p-5 text-sm text-white">
            {JSON.stringify({ candidate: {
              primaryRegistrar: deployment.registrar,
              ownerBoundForwardResolver: deployment.forwardResolver,
              ownerVerifiedReverseResolver: deployment.reverseResolver,
              primaryAwareMultichainResolver: deployment.multichainResolver,
            } }, null, 2)}
          </pre>
          <p className="mt-4 text-sm text-slate-600">
            These values must be independently verified and added through a reviewed
            manifest pull request before any activation step.
          </p>
        </section>
      </div>
    </main>
  );
}

async function deployOne(input: {
  artifact: Artifact;
  args: readonly unknown[];
  saltValue: Hex;
  stepIndex: number;
  publicClient: PublicClient;
  send: (data: Hex) => Promise<Hex>;
  updateStep: (index: number, patch: Partial<Step>) => void;
}): Promise<Address> {
  const data = encodeDeployData({
    abi: input.artifact.abi as Abi,
    bytecode: input.artifact.bytecode as Hex,
    args: input.args,
  });
  const predicted = getAddress(getContractAddress({
    bytecode: data,
    from: CREATE2_DEPLOYER,
    opcode: "CREATE2",
    salt: input.saltValue,
  }));
  input.updateStep(input.stepIndex, { state: "wallet", address: predicted });
  const existingCode = await input.publicClient.getCode({ address: predicted });
  if (!existingCode || existingCode === "0x") {
    const hash = await input.send(`${input.saltValue}${data.slice(2)}` as Hex);
    input.updateStep(input.stepIndex, { state: "confirming", hash, address: predicted });
    const receipt = await input.publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 2,
      timeout: 180_000,
    });
    if (receipt.status !== "success") throw new Error("Contract deployment failed");
  }
  await requireCode(input.publicClient, predicted, "deployed contract");
  input.updateStep(input.stepIndex, { state: "complete", address: predicted });
  return predicted;
}

async function validateDependencies(client: PublicClient, account: Address) {
  for (const [label, address] of [
    ["registry", REGISTRY],
    ["legacy registry", LEGACY],
    ["pricing policy", POLICY],
    ["discount authorization", AUTHORIZATION],
    ["current registrar", CURRENT_REGISTRAR],
    ["deployment proxy", CREATE2_DEPLOYER],
  ] as const) {
    await requireCode(client, address, label);
  }
  const [registryOwner, activeRegistrar, policyOwner, authorizationOwner, consumer] = await Promise.all([
    client.readContract({ address: REGISTRY, abi: registryAbi, functionName: "owner" }),
    client.readContract({ address: REGISTRY, abi: registryAbi, functionName: "registrar" }),
    client.readContract({ address: POLICY, abi: ownableAbi, functionName: "owner" }),
    client.readContract({ address: AUTHORIZATION, abi: authorizationAbi, functionName: "owner" }),
    client.readContract({ address: AUTHORIZATION, abi: authorizationAbi, functionName: "consumer" }),
  ]);
  if (
    account !== OWNER ||
    getAddress(registryOwner as Address) !== OWNER ||
    getAddress(policyOwner as Address) !== OWNER ||
    getAddress(authorizationOwner as Address) !== OWNER
  ) {
    throw new Error("The connected wallet does not own every required XDCID control contract");
  }
  if (
    getAddress(activeRegistrar as Address) !== CURRENT_REGISTRAR ||
    getAddress(consumer as Address) !== CURRENT_REGISTRAR
  ) {
    throw new Error("The active Registrar or discount consumer changed; stop and update the manifest first");
  }
}

async function validateDeployment(client: PublicClient, deployment: Required<Deployment>) {
  const [
    forwardRegistry,
    reverseRegistry,
    registrarRegistry,
    registrarLegacy,
    registrarPolicy,
    registrarAuthorization,
    registrarReverse,
    registrarOwner,
    multichainRegistry,
    multichainReverse,
  ] = await Promise.all([
    client.readContract({ address: deployment.forwardResolver, abi: artifacts.forwardResolver.abi, functionName: "registry" }),
    client.readContract({ address: deployment.reverseResolver, abi: artifacts.reverseResolver.abi, functionName: "registry" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "registry" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "legacyRegistry" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "pricingPolicy" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "discountAuthorization" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "primaryNameResolver" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "owner" }),
    client.readContract({ address: deployment.multichainResolver, abi: artifacts.multichainResolver.abi, functionName: "registry" }),
    client.readContract({ address: deployment.multichainResolver, abi: artifacts.multichainResolver.abi, functionName: "reverseResolver" }),
  ]);
  if (
    getAddress(forwardRegistry as Address) !== REGISTRY ||
    getAddress(reverseRegistry as Address) !== REGISTRY ||
    getAddress(registrarRegistry as Address) !== REGISTRY ||
    getAddress(registrarLegacy as Address) !== LEGACY ||
    getAddress(registrarPolicy as Address) !== POLICY ||
    getAddress(registrarAuthorization as Address) !== AUTHORIZATION ||
    getAddress(registrarReverse as Address) !== deployment.reverseResolver ||
    getAddress(registrarOwner as Address) !== OWNER ||
    getAddress(multichainRegistry as Address) !== REGISTRY ||
    getAddress(multichainReverse as Address) !== deployment.reverseResolver
  ) {
    throw new Error("A candidate contract has an unexpected immutable binding");
  }
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-slate-500">{label}</dt><dd className="break-all font-mono">{value}</dd></div>;
}

function TransactionLink({ hash }: { hash: Hex }) {
  return (
    <a className="mt-2 block break-all font-mono text-sm text-blue-700 underline" href={`https://xdcscan.com/tx/${hash}`} target="_blank" rel="noreferrer">
      {hash}
    </a>
  );
}

async function requireCode(client: PublicClient, address: Address, label: string) {
  const code = await client.getCode({ address });
  if (!code || code === "0x") throw new Error(`${label} has no contract code`);
}

function injectedProvider(): EIP1193Provider {
  const injected = (window as Window & { ethereum?: MetaMaskProvider }).ethereum;
  if (!injected) throw new Error("MetaMask was not detected");
  const providers = injected.providers ?? [injected];
  const metamask = providers.find(
    (provider: MetaMaskProvider) =>
      provider.isMetaMask === true && provider.isRabby !== true,
  );
  if (!metamask) throw new Error("Enable the MetaMask extension to continue on XDC mainnet");
  return metamask;
}

async function ensureXdc(provider: EIP1193Provider) {
  const current = (await provider.request({ method: "eth_chainId" })) as string;
  if (Number.parseInt(current, 16) === CHAIN_ID) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x32" }] });
  } catch {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: "0x32",
        chainName: xdc.name,
        nativeCurrency: xdc.nativeCurrency,
        rpcUrls: xdc.rpcUrls.default.http,
        blockExplorerUrls: [xdc.blockExplorers.default.url],
      }],
    });
  }
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    const text = cause.message.split("\n")[0];
    return text.length > 280 ? `${text.slice(0, 277)}...` : text;
  }
  return "The deployment operation failed";
}
