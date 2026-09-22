"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  http,
  parseAbi,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { XDC_MAINNET_DEPLOYMENT } from "../../../../sdk/src/deployment/deployments";
import {
  derivePrimaryResolutionActivationStage,
  type PrimaryResolutionActivationStage,
  type PrimaryResolutionActivationState,
} from "../../../lib/mainnetPrimaryActivation";
import { walletActionErrorMessage } from "../../../lib/walletErrors";

const deployment = XDC_MAINNET_DEPLOYMENT;
const candidate = deployment.candidate;
const rollout = deployment.rollout.primaryResolution;
const OWNER = getAddress(deployment.protocolOwner);
const REGISTRY = getAddress(deployment.active.registry);
const CURRENT_REGISTRAR = getAddress(deployment.active.registrar);
const CANDIDATE_REGISTRAR = getAddress(candidate.primaryRegistrar!);
const FORWARD_RESOLVER = getAddress(candidate.ownerBoundForwardResolver!);
const REVERSE_RESOLVER = getAddress(candidate.ownerVerifiedReverseResolver!);
const MULTICHAIN_RESOLVER = getAddress(candidate.primaryAwareMultichainResolver!);
const PRICING_POLICY = getAddress(deployment.active.pricingPolicy);
const DISCOUNT_AUTHORIZATION = getAddress(deployment.active.discountAuthorization);
const SUBDOMAIN_REGISTRAR = getAddress(deployment.active.subdomainRegistrar);
const LEGACY_REGISTRY = getAddress(deployment.dependencies.legacyRegistry);
const EXPECTED_SIGNER = getAddress(deployment.operations.discountAuthorizationSigner);
const EARLIEST_ACTIVATION = BigInt(rollout.earliestActivation);

const chain = {
  id: 50,
  name: "XDC Network",
  nativeCurrency: { name: "XDC", symbol: "XDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.xdcrpc.com"] } },
  blockExplorers: { default: { name: "XDCScan", url: "https://xdcscan.com" } },
} as const;

const registryAbi = parseAbi([
  "function owner() view returns (address)",
  "function registrar() view returns (address)",
  "function setRegistrar(address newRegistrar)",
]);
const ownedAbi = parseAbi(["function owner() view returns (address)"]);
const registrarAbi = parseAbi([
  "function owner() view returns (address)",
  "function registry() view returns (address)",
  "function legacyRegistry() view returns (address)",
  "function pricingPolicy() view returns (address)",
  "function discountAuthorization() view returns (address)",
  "function primaryNameResolver() view returns (address)",
]);
const resolverAbi = parseAbi(["function registry() view returns (address)"]);
const multichainAbi = parseAbi([
  "function registry() view returns (address)",
  "function reverseResolver() view returns (address)",
]);
const discountAbi = parseAbi([
  "function owner() view returns (address)",
  "function authorizationSigner() view returns (address)",
  "function consumer() view returns (address)",
  "function pendingAuthorizationSigner() view returns (address)",
  "function pendingConsumer() view returns (address)",
  "function pendingActivationTime() view returns (uint256)",
  "function hasPendingConfiguration() view returns (bool)",
  "function activatePendingConfiguration()",
]);

const expected = {
  currentRegistrar: CURRENT_REGISTRAR,
  candidateRegistrar: CANDIDATE_REGISTRAR,
  authorizationSigner: EXPECTED_SIGNER,
  earliestActivation: EARLIEST_ACTIVATION,
};

type Snapshot = PrimaryResolutionActivationState & {
  stage: PrimaryResolutionActivationStage;
  blockNumber: bigint;
};

const stageCopy: Record<PrimaryResolutionActivationStage, { label: string; detail: string }> = {
  waiting: {
    label: "Timelock in progress",
    detail: "The reviewed proposal is on-chain. No activation action is available before the exact deadline.",
  },
  "discount-ready": {
    label: "Discount activation ready",
    detail: "Activate the reviewed discount configuration, wait for two confirmations, then activate the Registry registrar.",
  },
  "registry-ready": {
    label: "Registry activation required",
    detail: "The new registrar is the discount consumer. Complete the Registry transaction now to restore registration availability.",
  },
  active: {
    label: "Primary-resolution stack active",
    detail: "Both on-chain activation steps are complete. Production configuration and smoke tests are the next release gate.",
  },
  invalid: {
    label: "Activation blocked",
    detail: "The live state does not match the reviewed rollout. Do not submit a transaction until the mismatch is investigated.",
  },
};

export default function MainnetPrimaryResolutionActivationClient() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [account, setAccount] = useState<Address>();
  const [message, setMessage] = useState("Reading the reviewed XDC mainnet rollout state…");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [hashes, setHashes] = useState<{ discount?: Hex; registry?: Hex }>({});

  const refresh = useCallback(async () => {
    try {
      const next = await readSnapshot();
      setSnapshot(next);
      setMessage(stageCopy[next.stage].detail);
      return next;
    } catch (error) {
      setSnapshot(undefined);
      setMessage(walletActionErrorMessage(error, "Unable to read the XDC mainnet rollout state."));
      throw error;
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const countdown = useMemo(
    () => formatCountdown(Math.max(0, rollout.earliestActivation - now)),
    [now],
  );

  async function connectOwner() {
    await run(async () => {
      const provider = injectedProvider();
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts[0]) throw new Error("The wallet returned no account.");
      const selected = getAddress(accounts[0]);
      if (selected !== OWNER) throw new Error(`Select the protocol-owner wallet ${OWNER}.`);
      await ensureMainnet(provider);
      const next = await refresh();
      if (next.stage === "invalid") throw new Error("The activation state does not match the reviewed rollout.");
      setAccount(selected);
      setMessage(`Owner wallet connected. ${stageCopy[next.stage].detail}`);
    });
  }

  async function activateDiscount() {
    if (!account || snapshot?.stage !== "discount-ready") return;
    await run(async () => {
      const provider = injectedProvider();
      await validateSelectedOwner(provider, account);
      const checked = await readSnapshot();
      if (checked.stage !== "discount-ready") throw new Error("The discount activation is not currently eligible.");
      const wallet = createWalletClient({ chain, transport: custom(provider) });
      const hash = await wallet.writeContract({
        account,
        chain,
        address: DISCOUNT_AUTHORIZATION,
        abi: discountAbi,
        functionName: "activatePendingConfiguration",
      });
      setHashes((current) => ({ ...current, discount: hash }));
      setMessage("Discount activation submitted. Waiting for two confirmations…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 180_000 });
      if (receipt.status !== "success") throw new Error("The discount activation transaction reverted.");
      await refresh();
    });
  }

  async function activateRegistry() {
    if (!account || snapshot?.stage !== "registry-ready") return;
    await run(async () => {
      const provider = injectedProvider();
      await validateSelectedOwner(provider, account);
      const checked = await readSnapshot();
      if (checked.stage !== "registry-ready") throw new Error("The Registry activation is not currently eligible.");
      const wallet = createWalletClient({ chain, transport: custom(provider) });
      const hash = await wallet.writeContract({
        account,
        chain,
        address: REGISTRY,
        abi: registryAbi,
        functionName: "setRegistrar",
        args: [CANDIDATE_REGISTRAR],
      });
      setHashes((current) => ({ ...current, registry: hash }));
      setMessage("Registry activation submitted. Waiting for two confirmations…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 180_000 });
      if (receipt.status !== "success") throw new Error("The Registry activation transaction reverted.");
      await refresh();
    });
  }

  async function run(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await task();
    } catch (error) {
      setMessage(walletActionErrorMessage(error, "The wallet operation failed."));
    } finally {
      setBusy(false);
    }
  }

  const stage = snapshot?.stage;
  const copy = stage ? stageCopy[stage] : undefined;

  return (
    <main className="min-h-screen bg-[#f3f7f6] px-5 py-10 text-[#071022] sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-teal-200 bg-white shadow-sm">
          <div className="h-2 bg-gradient-to-r from-[#087d78] via-[#18b6aa] to-[#66d5df]" />
          <div className="grid gap-8 p-7 md:grid-cols-[1.4fr_0.6fr] md:p-10">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#087d78]">XDC mainnet · guarded activation</p>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Activate primary resolution without changing production early</h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">This Preview-only console reads the reviewed manifest, validates every immutable dependency, and enables only the next eligible transaction.</p>
            </div>
            <div className="rounded-3xl bg-[#071022] p-6 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300">Current gate</p>
              <p className="mt-3 text-2xl font-semibold">{copy?.label ?? "Checking mainnet"}</p>
              <p className="mt-4 text-sm leading-6 text-slate-300">Earliest activation</p>
              <p className="font-mono text-sm">24 Sep 2026 · 17:09 GST</p>
              <p className="mt-4 text-3xl font-semibold tabular-nums">{stage === "waiting" ? countdown : stage ? "Eligible now" : "—"}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_0.72fr]">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm md:p-9">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Activation sequence</p>
                <h2 className="mt-2 text-3xl font-semibold">Two transactions, fixed order</h2>
              </div>
              <button className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:border-teal-600 disabled:opacity-50" onClick={() => run(async () => { await refresh(); })} disabled={busy}>Refresh state</button>
            </div>
            <div className="mt-7 space-y-4">
              <Step number="1" title="Timelock proposal" state={stage === "waiting" ? "current" : "done"} detail="Already submitted and recorded in the deployment manifest." />
              <Step number="2" title="Activate discount consumer" state={stage === "discount-ready" ? "current" : stage === "registry-ready" || stage === "active" ? "done" : "locked"} detail="Moves authorization consumption from the current registrar to the reviewed candidate." />
              <Step number="3" title="Activate Registry registrar" state={stage === "registry-ready" ? "current" : stage === "active" ? "done" : "locked"} detail="Authorizes the primary-aware registrar for new registrations and renewals." />
              <Step number="4" title="Production release" state={stage === "active" ? "current" : "locked"} detail="Apply the prepared variables only after on-chain activation and smoke tests pass." />
            </div>
            <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-700">{message}</div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Action label={account ? `Owner ${shortAddress(account)}` : "Connect owner wallet"} onClick={connectOwner} disabled={busy} />
              <Action label="Activate discount configuration" onClick={activateDiscount} disabled={busy || !account || stage !== "discount-ready"} warning />
              <Action label="Activate new registrar" onClick={activateRegistry} disabled={busy || !account || stage !== "registry-ready"} />
            </div>
          </div>

          <aside className="space-y-6">
            <section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Reviewed addresses</p>
              <div className="mt-5 space-y-4">
                <AddressRow label="Current registrar" value={CURRENT_REGISTRAR} />
                <AddressRow label="Candidate registrar" value={CANDIDATE_REGISTRAR} accent />
                <AddressRow label="Protocol owner" value={OWNER} />
              </div>
              <a className="mt-5 inline-flex text-sm font-semibold text-[#087d78] underline underline-offset-4" href={`https://xdcscan.com/tx/${rollout.proposalTransaction}`} target="_blank" rel="noreferrer">View timelock proposal on XDCScan ↗</a>
            </section>
            <section className="rounded-[2rem] border border-amber-300 bg-amber-50 p-7">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-800">Operational warning</p>
              <h2 className="mt-3 text-xl font-semibold">Complete step 3 immediately after step 2</h2>
              <p className="mt-3 text-sm leading-6 text-amber-950">After the discount consumer changes, the previous registrar cannot consume new discounts. Do not leave the rollout between those two transactions.</p>
            </section>
          </aside>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Prepared production configuration</p>
            <h2 className="mt-2 text-2xl font-semibold">Do not apply yet</h2>
            <pre className="mt-5 overflow-x-auto rounded-2xl bg-[#071022] p-5 text-xs leading-6 text-teal-100">{productionVariables()}</pre>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Rollback reality</p>
            <h2 className="mt-2 text-2xl font-semibold">Registry rollback is immediate; discount rollback is timelocked</h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">The previous registrar is preserved as <span className="font-mono">{shortAddress(rollout.previousRegistrar)}</span>. Restoring it in the Registry alone does not restore discounted registrations after the consumer changes; returning the discount consumer requires a new 48-hour proposal.</p>
            <p className="mt-4 rounded-2xl bg-slate-100 p-4 text-sm text-slate-700">Temporary single-wallet ownership is explicitly recorded for this rollout. Move ownership to multisig in a separate, reviewed operation.</p>
          </div>
        </section>

        {hashes.discount || hashes.registry ? (
          <section className="rounded-[2rem] border border-teal-200 bg-white p-7 shadow-sm">
            <h2 className="text-2xl font-semibold">Transactions from this session</h2>
            {hashes.discount ? <Transaction label="Discount configuration" hash={hashes.discount} /> : null}
            {hashes.registry ? <Transaction label="Registry registrar" hash={hashes.registry} /> : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}

const publicClient = createPublicClient({
  chain,
  transport: http("/api/deployment/mainnet-primary-resolution-activation/rpc", {
    retryCount: 0,
    timeout: 15_000,
  }),
});

async function readSnapshot(): Promise<Snapshot> {
  const contracts: Array<[string, Address]> = [
    ["Registry", REGISTRY], ["current Registrar", CURRENT_REGISTRAR], ["Pricing Policy", PRICING_POLICY],
    ["Discount Authorization", DISCOUNT_AUTHORIZATION], ["Subdomain Registrar", SUBDOMAIN_REGISTRAR],
    ["legacy Registry", LEGACY_REGISTRY], ["candidate Registrar", CANDIDATE_REGISTRAR],
    ["forward resolver", FORWARD_RESOLVER], ["reverse resolver", REVERSE_RESOLVER],
    ["multichain resolver", MULTICHAIN_RESOLVER],
  ];
  const code = await Promise.all(contracts.map(([, address]) => publicClient.getCode({ address })));
  code.forEach((value, index) => {
    if (!value || value === "0x") throw new Error(`${contracts[index][0]} has no deployed bytecode.`);
  });

  const readAddress = async (address: Address, abi: typeof ownedAbi | typeof registryAbi | typeof registrarAbi | typeof resolverAbi | typeof multichainAbi | typeof discountAbi, functionName: string) =>
    getAddress(await publicClient.readContract({ address, abi, functionName } as never) as Address);

  const [registryOwner, activeRegistrar, currentOwner, candidateOwner, policyOwner, discountOwner, subdomainOwner] = await Promise.all([
    readAddress(REGISTRY, registryAbi, "owner"), readAddress(REGISTRY, registryAbi, "registrar"),
    readAddress(CURRENT_REGISTRAR, ownedAbi, "owner"), readAddress(CANDIDATE_REGISTRAR, registrarAbi, "owner"),
    readAddress(PRICING_POLICY, ownedAbi, "owner"), readAddress(DISCOUNT_AUTHORIZATION, discountAbi, "owner"),
    readAddress(SUBDOMAIN_REGISTRAR, ownedAbi, "owner"),
  ]);
  for (const [label, owner] of [["Registry", registryOwner], ["current Registrar", currentOwner], ["candidate Registrar", candidateOwner], ["Pricing Policy", policyOwner], ["Discount Authorization", discountOwner], ["Subdomain Registrar", subdomainOwner]] as const) {
    if (owner !== OWNER) throw new Error(`${label} owner does not match the reviewed protocol owner.`);
  }

  const [registrarRegistry, registrarLegacy, registrarPolicy, registrarDiscount, primaryResolver, forwardRegistry, reverseRegistry, multichainRegistry, linkedReverse] = await Promise.all([
    readAddress(CANDIDATE_REGISTRAR, registrarAbi, "registry"), readAddress(CANDIDATE_REGISTRAR, registrarAbi, "legacyRegistry"),
    readAddress(CANDIDATE_REGISTRAR, registrarAbi, "pricingPolicy"), readAddress(CANDIDATE_REGISTRAR, registrarAbi, "discountAuthorization"),
    readAddress(CANDIDATE_REGISTRAR, registrarAbi, "primaryNameResolver"), readAddress(FORWARD_RESOLVER, resolverAbi, "registry"),
    readAddress(REVERSE_RESOLVER, resolverAbi, "registry"), readAddress(MULTICHAIN_RESOLVER, multichainAbi, "registry"),
    readAddress(MULTICHAIN_RESOLVER, multichainAbi, "reverseResolver"),
  ]);
  const bindings: Array<[string, Address, Address]> = [
    ["candidate Registry", registrarRegistry, REGISTRY], ["candidate legacy Registry", registrarLegacy, LEGACY_REGISTRY],
    ["candidate Pricing Policy", registrarPolicy, PRICING_POLICY], ["candidate Discount Authorization", registrarDiscount, DISCOUNT_AUTHORIZATION],
    ["candidate primary resolver", primaryResolver, REVERSE_RESOLVER], ["forward resolver Registry", forwardRegistry, REGISTRY],
    ["reverse resolver Registry", reverseRegistry, REGISTRY], ["multichain resolver Registry", multichainRegistry, REGISTRY],
    ["multichain reverse resolver", linkedReverse, REVERSE_RESOLVER],
  ];
  for (const [label, actual, wanted] of bindings) {
    if (actual !== wanted) throw new Error(`${label} does not match the reviewed deployment manifest.`);
  }

  const [authorizationSigner, discountConsumer, pendingSigner, pendingConsumer, pendingActivationTime, hasPendingConfiguration, block] = await Promise.all([
    readAddress(DISCOUNT_AUTHORIZATION, discountAbi, "authorizationSigner"), readAddress(DISCOUNT_AUTHORIZATION, discountAbi, "consumer"),
    readAddress(DISCOUNT_AUTHORIZATION, discountAbi, "pendingAuthorizationSigner"), readAddress(DISCOUNT_AUTHORIZATION, discountAbi, "pendingConsumer"),
    publicClient.readContract({ address: DISCOUNT_AUTHORIZATION, abi: discountAbi, functionName: "pendingActivationTime" }),
    publicClient.readContract({ address: DISCOUNT_AUTHORIZATION, abi: discountAbi, functionName: "hasPendingConfiguration" }),
    publicClient.getBlock(),
  ]);
  const state: PrimaryResolutionActivationState = {
    activeRegistrar, discountConsumer, authorizationSigner, pendingSigner, pendingConsumer,
    pendingActivationTime: pendingActivationTime as bigint,
    hasPendingConfiguration: hasPendingConfiguration as boolean,
    blockTimestamp: block.timestamp,
  };
  return { ...state, stage: derivePrimaryResolutionActivationStage(state, expected), blockNumber: block.number };
}

function Step({ number, title, detail, state }: { number: string; title: string; detail: string; state: "current" | "done" | "locked" }) {
  const tone = state === "done" ? "bg-emerald-100 text-emerald-800" : state === "current" ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-400";
  return <div className="flex gap-4 rounded-2xl border border-slate-200 p-4"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${tone}`}>{state === "done" ? "✓" : number}</div><div><p className="font-semibold">{title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p></div></div>;
}

function AddressRow({ label, value, accent = false }: { label: string; value: Address; accent?: boolean }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><a className={`mt-1 block break-all font-mono text-xs underline underline-offset-4 ${accent ? "text-[#087d78]" : "text-slate-700"}`} href={`https://xdcscan.com/address/${value}`} target="_blank" rel="noreferrer">{value}</a></div>;
}

function Action({ label, onClick, disabled, warning = false }: { label: string; onClick: () => void; disabled: boolean; warning?: boolean }) {
  return <button className={`${warning ? "bg-amber-600" : "bg-[#071022]"} rounded-xl px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-35`} onClick={onClick} disabled={disabled}>{label}</button>;
}

function Transaction({ label, hash }: { label: string; hash: Hex }) {
  return <p className="mt-4 text-sm"><span className="font-semibold">{label}: </span><a className="break-all font-mono text-[#087d78] underline" href={`https://xdcscan.com/tx/${hash}`} target="_blank" rel="noreferrer">{hash}</a></p>;
}

function productionVariables() {
  return `NEXT_PUBLIC_XNS_REGISTRAR=${CANDIDATE_REGISTRAR}\nNEXT_PUBLIC_XNS_RESOLVER_V2=${FORWARD_RESOLVER}\nNEXT_PUBLIC_XNS_REVERSE_RESOLVER_V2=${REVERSE_RESOLVER}\nNEXT_PUBLIC_XNS_MULTICHAIN_RESOLVER=${MULTICHAIN_RESOLVER}`;
}

function formatCountdown(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function shortAddress(address: Address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function injectedProvider(): EIP1193Provider {
  const provider = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
  if (!provider) throw new Error("No injected wallet was detected. Open this Preview in a browser with Rabby or MetaMask.");
  return provider;
}

async function validateSelectedOwner(provider: EIP1193Provider, expectedOwner: Address) {
  await ensureMainnet(provider);
  const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
  if (!accounts[0] || getAddress(accounts[0]) !== expectedOwner || expectedOwner !== OWNER) {
    throw new Error("The selected wallet is no longer the reviewed protocol owner.");
  }
}

async function ensureMainnet(provider: EIP1193Provider) {
  const current = await provider.request({ method: "eth_chainId" }) as string;
  if (Number.parseInt(current, 16) === chain.id) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x32" }] });
  } catch {
    await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x32", chainName: chain.name, nativeCurrency: chain.nativeCurrency, rpcUrls: chain.rpcUrls.default.http, blockExplorerUrls: [chain.blockExplorers.default.url] }] });
  }
}
