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
import { apothemResolverV2DeploymentArtifacts as artifacts } from "../../../generated/apothemResolverV2Deployment";

const OWNER = getAddress("0x9c67d6cfE6A73497e7348b6b852495CA6236C29a");
const REGISTRY = getAddress("0x2BeD8EB404e1BD8D690e3dD2Fd06F287e5A92Eb1");
const CREATE2_DEPLOYER = getAddress("0x4e59b44847b379578588920ca78fbf26c0b4956c");
const FORWARD_SALT = ("0x" + (22001).toString(16).padStart(64, "0")) as Hex;
const REVERSE_SALT = ("0x" + (22002).toString(16).padStart(64, "0")) as Hex;
const CHAIN_ID = 51;

const apothem = {
  id: CHAIN_ID,
  name: "XDC Apothem",
  nativeCurrency: { name: "TXDC", symbol: "TXDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://erpc.apothem.network"] } },
  blockExplorers: {
    default: { name: "XDCScan Testnet", url: "https://testnet.xdcscan.com" },
  },
} as const;

type MetaMaskProvider = EIP1193Provider & {
  isMetaMask?: boolean;
  isRabby?: boolean;
  providers?: MetaMaskProvider[];
};
type StepState = "pending" | "wallet" | "confirming" | "complete" | "failed";
type Step = { label: string; state: StepState; hash?: Hex; address?: Address; error?: string };
type DeploymentArtifact = { abi: Abi; bytecode: Hex };

const initialSteps: Step[] = [
  { label: "Validate admin wallet, registry, and deployment proxy", state: "pending" },
  { label: "Deploy owner-bound forward Resolver V2", state: "pending" },
  { label: "Deploy ownership-aware Reverse Resolver V2", state: "pending" },
  { label: "Validate both contracts and registry bindings", state: "pending" },
];

export default function ApothemResolverV2DeploymentClient() {
  const [account, setAccount] = useState<Address>();
  const [addresses, setAddresses] = useState<{ resolver?: Address; reverseResolver?: Address }>({});
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "Connect the designated Apothem admin wallet to run read-only preflight checks.",
  );

  function updateStep(index: number, patch: Partial<Step>) {
    setSteps((current) => current.map((step, position) =>
      position === index ? { ...step, ...patch } : step,
    ));
  }

  async function connect() {
    try {
      const provider = injectedProvider();
      const requested = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      if (!requested[0]) throw new Error("Wallet returned no account");
      const selected = getAddress(requested[0]);
      if (selected !== OWNER) throw new Error("Select the designated Apothem admin wallet");
      await ensureApothem(provider);
      const publicClient = clientFor(provider);
      await validateDependencies(publicClient, selected);
      setAccount(selected);
      updateStep(0, { state: "complete", error: undefined });
      setMessage("Wallet, Apothem registry, and deterministic deployment proxy validated.");
    } catch (cause) {
      const error = errorMessage(cause);
      updateStep(0, { state: "failed", error });
      setMessage(error);
    }
  }

  async function deploy() {
    if (!account || busy) return;
    setBusy(true);
    setAddresses({});
    setSteps((current) => [{ ...current[0], state: "complete", error: undefined }, ...initialSteps.slice(1)]);

    try {
      const provider = injectedProvider();
      await ensureApothem(provider);
      const publicClient = clientFor(provider);
      const walletClient = createWalletClient({ chain: apothem, transport: custom(provider) });
      await validateDependencies(publicClient, account);

      const resolver = await deployOne({
        artifact: artifacts.resolver as DeploymentArtifact,
        salt: FORWARD_SALT,
        stepIndex: 1,
        label: "forward Resolver V2",
        publicClient,
        send: (data) => walletClient.sendTransaction({ account, chain: apothem, to: CREATE2_DEPLOYER, data, value: 0n }),
        updateStep,
      });
      setAddresses((current) => ({ ...current, resolver }));

      const reverseResolver = await deployOne({
        artifact: artifacts.reverseResolver as DeploymentArtifact,
        salt: REVERSE_SALT,
        stepIndex: 2,
        label: "Reverse Resolver V2",
        publicClient,
        send: (data) => walletClient.sendTransaction({ account, chain: apothem, to: CREATE2_DEPLOYER, data, value: 0n }),
        updateStep,
      });
      setAddresses({ resolver, reverseResolver });

      updateStep(3, { state: "confirming" });
      await Promise.all([
        validateResolver(publicClient, resolver, artifacts.resolver.abi as Abi),
        validateResolver(publicClient, reverseResolver, artifacts.reverseResolver.abi as Abi),
      ]);
      updateStep(3, { state: "complete" });
      setMessage("Both Resolver V2 contracts are deployed and bound to the Apothem registry. No existing contract was modified.");
    } catch (cause) {
      const error = errorMessage(cause);
      setMessage(error);
      setSteps((current) => {
        const failing = current.findIndex((step) => step.state === "wallet" || step.state === "confirming");
        return failing < 0 ? current : current.map((step, index) =>
          index === failing ? { ...step, state: "failed", error } : step,
        );
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-950">
      <div className="mx-auto max-w-4xl space-y-8">
        <section className="rounded-3xl border border-amber-300 bg-amber-50 p-7">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-800">Preview-only · XDC Apothem</p>
          <h1 className="mt-3 text-4xl font-semibold">Deploy the XDCID Resolver V2 bundle</h1>
          <p className="mt-3 text-slate-700">This deploys two standalone testnet contracts. It does not replace the registry or activate anything on mainnet, and it never reads or stores a private key.</p>
        </section>

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <dl className="grid gap-4 text-sm md:grid-cols-2">
            <Detail label="Designated Apothem admin wallet" value={OWNER} />
            <Detail label="Existing Apothem registry" value={REGISTRY} />
            <Detail label="CREATE2 deployment proxy" value={CREATE2_DEPLOYER} />
            <Detail label="Transactions required" value="Two contract deployments" />
          </dl>
          <p className="mt-5 rounded-xl bg-slate-100 p-4">{message}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-50" onClick={connect} disabled={busy}>
              {account ? "Admin wallet verified" : "Connect admin wallet"}
            </button>
            <button className="rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-50" onClick={deploy} disabled={!account || busy}>
              {busy ? "Deployment in progress..." : "Deploy two testnet contracts"}
            </button>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <h2 className="text-2xl font-semibold">Transaction sequence</h2>
          <ol className="mt-5 space-y-4">
            {steps.map((step, index) => (
              <li key={step.label} className="rounded-xl border p-4">
                <div className="flex justify-between gap-4"><span>{index + 1}. {step.label}</span><span className="font-semibold">{step.state}</span></div>
                {step.hash ? <a className="mt-2 block break-all font-mono text-sm text-blue-700 underline" href={`https://testnet.xdcscan.com/tx/${step.hash}`} target="_blank" rel="noreferrer">{step.hash}</a> : null}
                {step.address ? <p className="mt-2 break-all font-mono text-sm">{step.address}</p> : null}
                {step.error ? <p className="mt-2 break-words text-sm text-red-700">{step.error}</p> : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <h2 className="text-2xl font-semibold">Deployment configuration</h2>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-950 p-5 text-sm text-white">{JSON.stringify({
            NEXT_PUBLIC_XNS_RESOLVER_V2: addresses.resolver,
            NEXT_PUBLIC_XNS_REVERSE_RESOLVER_V2: addresses.reverseResolver,
          }, null, 2)}</pre>
          <p className="mt-4 text-sm text-slate-600">Configure preview only after both addresses appear and every validation step is complete.</p>
        </section>
      </div>
    </main>
  );
}

async function deployOne({ artifact, salt, stepIndex, label, publicClient, send, updateStep }: {
  artifact: DeploymentArtifact;
  salt: Hex;
  stepIndex: number;
  label: string;
  publicClient: PublicClient;
  send: (data: Hex) => Promise<Hex>;
  updateStep: (index: number, patch: Partial<Step>) => void;
}) {
  updateStep(stepIndex, { state: "wallet" });
  const deployData = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args: [REGISTRY] });
  const predicted = getAddress(getContractAddress({ bytecode: deployData, from: CREATE2_DEPLOYER, opcode: "CREATE2", salt }));
  const existingCode = await publicClient.getCode({ address: predicted });
  if (!existingCode || existingCode === "0x") {
    const hash = await send(`${salt}${deployData.slice(2)}` as Hex);
    updateStep(stepIndex, { state: "confirming", hash });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 180_000 });
    if (receipt.status !== "success") throw new Error(`${label} deployment failed`);
    updateStep(stepIndex, { state: "complete", hash, address: predicted });
  } else {
    updateStep(stepIndex, { state: "complete", address: predicted });
  }
  await validateResolver(publicClient, predicted, artifact.abi);
  return predicted;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-slate-500">{label}</dt><dd className="break-all font-mono">{value}</dd></div>;
}

function clientFor(provider: EIP1193Provider) {
  return createPublicClient({ chain: apothem, transport: custom(provider) });
}

async function validateDependencies(publicClient: PublicClient, account: Address) {
  await requireCode(publicClient, REGISTRY, "registry");
  await requireCode(publicClient, CREATE2_DEPLOYER, "deployment proxy");
  const registryOwner = await publicClient.readContract({
    address: REGISTRY,
    abi: [{ type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }],
    functionName: "owner",
  });
  if (account !== OWNER || getAddress(registryOwner) !== OWNER) {
    throw new Error("The designated wallet does not own the Apothem registry");
  }
}

async function validateResolver(publicClient: PublicClient, address: Address, abi: Abi) {
  await requireCode(publicClient, address, "resolver");
  const registry = await publicClient.readContract({ address, abi, functionName: "registry" });
  if (getAddress(registry as Address) !== REGISTRY) throw new Error("Resolver registry binding validation failed");
}

async function requireCode(publicClient: PublicClient, address: Address, label: string) {
  const code = await publicClient.getCode({ address });
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
  if (!metamask) throw new Error("Enable the MetaMask extension to continue on Apothem");
  return metamask;
}

async function ensureApothem(provider: EIP1193Provider) {
  const chainId = (await provider.request({ method: "eth_chainId" })) as string;
  if (Number.parseInt(chainId, 16) === CHAIN_ID) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x33" }] });
  } catch {
    await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x33", chainName: apothem.name, nativeCurrency: apothem.nativeCurrency, rpcUrls: apothem.rpcUrls.default.http, blockExplorerUrls: [apothem.blockExplorers.default.url] }] });
  }
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    const text = cause.message.split("\n")[0];
    return text.length > 280 ? `${text.slice(0, 277)}...` : text;
  }
  return "The wallet operation failed";
}
