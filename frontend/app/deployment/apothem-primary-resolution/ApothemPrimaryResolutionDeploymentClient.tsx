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
  type PublicClient
} from "viem";
import { apothemPrimaryResolutionDeploymentArtifacts as artifacts } from "../../../generated/apothemPrimaryResolutionDeployment";

const OWNER = getAddress("0x9c67d6cfE6A73497e7348b6b852495CA6236C29a");
const REGISTRY = getAddress("0x2BeD8EB404e1BD8D690e3dD2Fd06F287e5A92Eb1");
const LEGACY = getAddress("0xe7CfeC8729686CcB2FB25B8275D6bd6Bc68A4bf0");
const POLICY = getAddress("0x90a719bCAD35EB1048b30e43CA3fC804A35e5c81");
const AUTHORIZATION = getAddress("0x37A013d55393f0824eFD40C648111f39D18C5F46");
const CURRENT_REGISTRAR = getAddress("0x506B82DaD0cf55d909D9C6F0edD5A7939339256d");
const CREATE2_DEPLOYER = getAddress("0x4e59b44847b379578588920ca78fbf26c0b4956c");
const CHAIN_ID = 51;
const salt = (value: number) =>
  ("0x" + value.toString(16).padStart(64, "0")) as Hex;

const apothem = {
  id: CHAIN_ID,
  name: "XDC Apothem",
  nativeCurrency: { name: "TXDC", symbol: "TXDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.apothem.network"] } },
  blockExplorers: {
    default: { name: "XDCScan Testnet", url: "https://testnet.xdcscan.com" }
  }
} as const;

const registryAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "registrar", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }
] as const;

type MetaMaskProvider = EIP1193Provider & {
  isMetaMask?: boolean;
  isRabby?: boolean;
  providers?: MetaMaskProvider[];
};
type StepState = "pending" | "wallet" | "confirming" | "complete" | "failed";
type Step = {
  label: string;
  state: StepState;
  hash?: Hex;
  address?: Address;
  error?: string;
};
type Deployment = {
  reverseResolver?: Address;
  registrar?: Address;
  multichainResolver?: Address;
};
type Artifact = { abi: readonly unknown[]; bytecode: string };

const initialSteps: Step[] = [
  { label: "Validate the Apothem owner and existing contract stack", state: "pending" },
  { label: "Deploy Reverse Resolver V3", state: "pending" },
  { label: "Deploy the primary-aware Registrar", state: "pending" },
  { label: "Deploy Multichain Resolver V2", state: "pending" },
  { label: "Validate every immutable contract binding", state: "pending" },
  { label: "Propose the new Registrar as discount consumer", state: "pending" },
  { label: "Confirm the pending configuration and activation time", state: "pending" }
];

export default function ApothemPrimaryResolutionDeploymentClient() {
  const [account, setAccount] = useState<Address>();
  const [deployment, setDeployment] = useState<Deployment>({});
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const [activationTime, setActivationTime] = useState<bigint>(0n);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "Connect the designated Apothem owner wallet to run read-only preflight checks."
  );

  function updateStep(index: number, patch: Partial<Step>) {
    setSteps((current) =>
      current.map((step, position) =>
        position === index ? { ...step, ...patch } : step
      )
    );
  }

  async function connect() {
    try {
      const provider = injectedProvider();
      const accounts = (await provider.request({
        method: "eth_requestAccounts"
      })) as string[];
      if (!accounts[0]) throw new Error("Wallet returned no account");
      const selected = getAddress(accounts[0]);
      if (selected !== OWNER) {
        throw new Error("Select the designated Apothem owner wallet");
      }
      await ensureApothem(provider);
      const publicClient = createPublicClient({
        chain: apothem,
        transport: custom(provider)
      });
      await validateDependencies(publicClient, selected);
      setAccount(selected);
      updateStep(0, { state: "complete", error: undefined });
      setMessage(
        "Preflight passed. The page can deploy three inactive contracts and start the 48-hour consumer delay."
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
    setActivationTime(0n);
    setSteps((current) => [
      { ...current[0], state: "complete", error: undefined },
      ...initialSteps.slice(1)
    ]);

    try {
      const provider = injectedProvider();
      await ensureApothem(provider);
      const publicClient = createPublicClient({
        chain: apothem,
        transport: custom(provider)
      });
      const walletClient = createWalletClient({
        chain: apothem,
        transport: custom(provider)
      });
      const authorizationSigner = await validateDependencies(
        publicClient,
        account
      );

      const reverseResolver = await deployOne({
        artifact: artifacts.reverseResolver,
        args: [REGISTRY],
        saltValue: salt(23001),
        stepIndex: 1,
        publicClient,
        send: (data) => walletClient.sendTransaction({
          account,
          chain: apothem,
          to: CREATE2_DEPLOYER,
          data,
          value: 0n
        }),
        updateStep
      });
      setDeployment({ reverseResolver });

      const registrar = await deployOne({
        artifact: artifacts.registrar,
        args: [REGISTRY, LEGACY, POLICY, AUTHORIZATION, reverseResolver, OWNER],
        saltValue: salt(23002),
        stepIndex: 2,
        publicClient,
        send: (data) => walletClient.sendTransaction({
          account,
          chain: apothem,
          to: CREATE2_DEPLOYER,
          data,
          value: 0n
        }),
        updateStep
      });
      setDeployment({ reverseResolver, registrar });

      const multichainResolver = await deployOne({
        artifact: artifacts.multichainResolver,
        args: [REGISTRY, reverseResolver],
        saltValue: salt(23003),
        stepIndex: 3,
        publicClient,
        send: (data) => walletClient.sendTransaction({
          account,
          chain: apothem,
          to: CREATE2_DEPLOYER,
          data,
          value: 0n
        }),
        updateStep
      });
      const completed = { reverseResolver, registrar, multichainResolver };
      setDeployment(completed);

      updateStep(4, { state: "confirming" });
      await validateDeployment(publicClient, completed);
      updateStep(4, { state: "complete" });

      updateStep(5, { state: "wallet" });
      const proposalHash = await ensureConsumerProposal({
        publicClient,
        registrar,
        authorizationSigner,
        send: () => walletClient.writeContract({
          account,
          chain: apothem,
          address: AUTHORIZATION,
          abi: artifacts.discountAuthorization.abi,
          functionName: "proposeConfiguration",
          args: [authorizationSigner, registrar]
        })
      });
      if (proposalHash) {
        updateStep(5, { state: "confirming", hash: proposalHash });
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: proposalHash,
          confirmations: 2,
          timeout: 180_000
        });
        if (receipt.status !== "success") {
          throw new Error("Discount-consumer proposal failed");
        }
      }
      updateStep(5, {
        state: "complete",
        ...(proposalHash ? { hash: proposalHash } : {})
      });

      updateStep(6, { state: "confirming" });
      const pendingActivationTime = await validateProposal(
        publicClient,
        registrar,
        authorizationSigner
      );
      setActivationTime(pendingActivationTime);
      updateStep(6, { state: "complete" });
      setMessage(
        "Deployment is complete and inactive. The 48-hour delay is running; the registry still points to the previous Registrar."
      );
    } catch (cause) {
      const error = errorMessage(cause);
      setMessage(error);
      setSteps((current) => {
        const failing = current.findIndex(
          (step) => step.state === "wallet" || step.state === "confirming"
        );
        return failing < 0
          ? current
          : current.map((step, index) =>
              index === failing ? { ...step, state: "failed", error } : step
            );
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl space-y-7">
        <section className="rounded-3xl border border-amber-300 bg-amber-50 p-6 sm:p-7">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-800">
            Apothem only · deployment stage
          </p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
            Deploy primary owner resolution
          </h1>
          <p className="mt-3 text-slate-700">
            This page deploys three new testnet contracts and proposes the new
            Registrar as discount consumer. It does not activate the Registrar,
            change production, or access a private key.
          </p>
        </section>

        <section className="rounded-3xl border bg-white p-6 shadow-sm sm:p-7">
          <dl className="grid gap-4 text-sm md:grid-cols-2">
            <Detail label="Designated owner wallet" value={OWNER} />
            <Detail label="Existing Registry" value={REGISTRY} />
            <Detail label="Existing Pricing Policy" value={POLICY} />
            <Detail label="Existing Discount Authorization" value={AUTHORIZATION} />
            <Detail label="Current active Registrar" value={CURRENT_REGISTRAR} />
            <Detail label="Transactions required" value="Three deployments + one proposal" />
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
              {busy ? "Deployment in progress..." : "Deploy and start delay"}
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

        <section className="rounded-3xl border bg-white p-6 shadow-sm sm:p-7">
          <h2 className="text-2xl font-semibold">Development configuration</h2>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-950 p-5 text-sm text-white">
            {JSON.stringify({
              NEXT_PUBLIC_XNS_REGISTRAR: deployment.registrar,
              NEXT_PUBLIC_XNS_REVERSE_RESOLVER_V2: deployment.reverseResolver,
              NEXT_PUBLIC_XNS_MULTICHAIN_RESOLVER: deployment.multichainResolver
            }, null, 2)}
          </pre>
          <p className="mt-4 text-sm text-slate-600">
            Do not apply these values until the delayed consumer configuration
            and registry activation are complete.
          </p>
          {activationTime > 0n ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              Earliest activation: {new Date(Number(activationTime) * 1000).toLocaleString()}
            </p>
          ) : null}
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
    args: input.args
  });
  const predicted = getAddress(getContractAddress({
    bytecode: data,
    from: CREATE2_DEPLOYER,
    opcode: "CREATE2",
    salt: input.saltValue
  }));
  input.updateStep(input.stepIndex, { state: "wallet", address: predicted });
  const existingCode = await input.publicClient.getCode({ address: predicted });
  if (!existingCode || existingCode === "0x") {
    const hash = await input.send(
      `${input.saltValue}${data.slice(2)}` as Hex
    );
    input.updateStep(input.stepIndex, {
      state: "confirming",
      hash,
      address: predicted
    });
    const receipt = await input.publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 2,
      timeout: 180_000
    });
    if (receipt.status !== "success") throw new Error("Contract deployment failed");
  }
  await requireCode(input.publicClient, predicted, "deployed contract");
  input.updateStep(input.stepIndex, { state: "complete", address: predicted });
  return predicted;
}

async function validateDependencies(
  client: PublicClient,
  account: Address
): Promise<Address> {
  for (const [label, address] of [
    ["registry", REGISTRY],
    ["legacy registry", LEGACY],
    ["pricing policy", POLICY],
    ["discount authorization", AUTHORIZATION],
    ["current registrar", CURRENT_REGISTRAR],
    ["deployment proxy", CREATE2_DEPLOYER]
  ] as const) {
    await requireCode(client, address, label);
  }

  const [registryOwner, activeRegistrar, authorizationOwner, signer, consumer] =
    await Promise.all([
      client.readContract({ address: REGISTRY, abi: registryAbi, functionName: "owner" }),
      client.readContract({ address: REGISTRY, abi: registryAbi, functionName: "registrar" }),
      client.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "owner" }),
      client.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "authorizationSigner" }),
      client.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "consumer" })
    ]);
  if (
    account !== OWNER ||
    getAddress(registryOwner as Address) !== OWNER ||
    getAddress(authorizationOwner as Address) !== OWNER
  ) {
    throw new Error("The connected wallet does not own the Apothem control contracts");
  }
  if (
    getAddress(activeRegistrar as Address) !== CURRENT_REGISTRAR ||
    getAddress(consumer as Address) !== CURRENT_REGISTRAR
  ) {
    throw new Error("The active Apothem Registrar or discount consumer changed unexpectedly");
  }
  return getAddress(signer as Address);
}

async function validateDeployment(
  client: PublicClient,
  deployment: Required<Deployment>
) {
  const [
    reverseRegistry,
    registrarRegistry,
    registrarLegacy,
    registrarPolicy,
    registrarAuthorization,
    registrarReverse,
    registrarOwner,
    multichainRegistry,
    multichainReverse
  ] = await Promise.all([
    client.readContract({ address: deployment.reverseResolver, abi: artifacts.reverseResolver.abi, functionName: "registry" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "registry" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "legacyRegistry" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "pricingPolicy" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "discountAuthorization" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "primaryNameResolver" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "owner" }),
    client.readContract({ address: deployment.multichainResolver, abi: artifacts.multichainResolver.abi, functionName: "registry" }),
    client.readContract({ address: deployment.multichainResolver, abi: artifacts.multichainResolver.abi, functionName: "reverseResolver" })
  ]);
  if (
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
    throw new Error("A deployed contract has an unexpected immutable binding");
  }
}

async function ensureConsumerProposal(input: {
  publicClient: PublicClient;
  registrar: Address;
  authorizationSigner: Address;
  send: () => Promise<Hex>;
}): Promise<Hex | undefined> {
  const [consumer, hasPending, pendingSigner, pendingConsumer] =
    await Promise.all([
      input.publicClient.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "consumer" }),
      input.publicClient.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "hasPendingConfiguration" }),
      input.publicClient.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "pendingAuthorizationSigner" }),
      input.publicClient.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "pendingConsumer" })
    ]);
  if (getAddress(consumer as Address) === input.registrar) return undefined;
  if (Boolean(hasPending)) {
    if (
      getAddress(pendingSigner as Address) !== input.authorizationSigner ||
      getAddress(pendingConsumer as Address) !== input.registrar
    ) {
      throw new Error("A different discount configuration is already pending");
    }
    return undefined;
  }
  return input.send();
}

async function validateProposal(
  client: PublicClient,
  registrar: Address,
  signer: Address
): Promise<bigint> {
  const [hasPending, pendingSigner, pendingConsumer, pendingActivationTime] =
    await Promise.all([
      client.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "hasPendingConfiguration" }),
      client.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "pendingAuthorizationSigner" }),
      client.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "pendingConsumer" }),
      client.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "pendingActivationTime" })
    ]);
  if (
    !Boolean(hasPending) ||
    getAddress(pendingSigner as Address) !== signer ||
    getAddress(pendingConsumer as Address) !== registrar
  ) {
    throw new Error("The pending discount configuration could not be verified");
  }
  return BigInt(pendingActivationTime as bigint);
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-slate-500">{label}</dt><dd className="break-all font-mono">{value}</dd></div>;
}

function TransactionLink({ hash }: { hash: Hex }) {
  return (
    <a
      className="mt-2 block break-all font-mono text-sm text-blue-700 underline"
      href={`https://testnet.xdcscan.com/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
    >
      {hash}
    </a>
  );
}

async function requireCode(
  client: PublicClient,
  address: Address,
  label: string
) {
  const code = await client.getCode({ address });
  if (!code || code === "0x") throw new Error(`${label} has no contract code`);
}

function injectedProvider(): EIP1193Provider {
  const injected = (window as Window & { ethereum?: MetaMaskProvider }).ethereum;
  if (!injected) throw new Error("MetaMask was not detected");
  const providers = injected.providers ?? [injected];
  const metamask = providers.find(
    (provider: MetaMaskProvider) =>
      provider.isMetaMask === true && provider.isRabby !== true
  );
  if (!metamask) throw new Error("Enable the MetaMask extension to continue on Apothem");
  return metamask;
}

async function ensureApothem(provider: EIP1193Provider) {
  const current = (await provider.request({ method: "eth_chainId" })) as string;
  if (Number.parseInt(current, 16) === CHAIN_ID) return;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x33" }]
    });
  } catch {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: "0x33",
        chainName: apothem.name,
        nativeCurrency: apothem.nativeCurrency,
        rpcUrls: apothem.rpcUrls.default.http,
        blockExplorerUrls: [apothem.blockExplorers.default.url]
      }]
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
