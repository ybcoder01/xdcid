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
import {
  deriveApothemRegistryV2ActivationStage,
  type ApothemRegistryV2ActivationStage,
  type ApothemRegistryV2ActivationState,
} from "../../../lib/apothemRegistryV2Activation";
import { walletActionErrorMessage } from "../../../lib/walletErrors";

const OWNER = getAddress("0x9c67d6cfE6A73497e7348b6b852495CA6236C29a");
const REGISTRY = getAddress("0xA601b5e9114c0DfeCea4E0ef99D6Fc020B330512");
const REGISTRAR = getAddress("0xd51EdbE27BffA0993D9CFf672613a2d6eC0a5D7b");
const FORWARD_RESOLVER = getAddress("0x5F20A2eb2E3c81b4ecc5d5bA3177225d7E3E1a94");
const REVERSE_RESOLVER = getAddress("0xD3909DC7461D06D0Eb57A3b23685cB6f11D474aD");
const MULTICHAIN_RESOLVER = getAddress("0x05Efa9641b03eEe2a4624F2974e1E1192019d363");
const SUBDOMAIN_REGISTRAR = getAddress("0x826b8599d38fcE73b246143b61955Dde0E9AfF68");
const PREVIOUS_REGISTRY = getAddress("0x2BeD8EB404e1BD8D690e3dD2Fd06F287e5A92Eb1");
const COLLISION_REGISTRY = getAddress("0xe7CfeC8729686CcB2FB25B8275D6bd6Bc68A4bf0");
const PRICING_POLICY = getAddress("0x90a719bCAD35EB1048b30e43CA3fC804A35e5c81");
const DISCOUNT_AUTHORIZATION = getAddress("0x37A013d55393f0824eFD40C648111f39D18C5F46");
const PREVIOUS_CONSUMER = getAddress("0xE35722cB7d04Ba36ed284910528A64B1dE855a20");
const EARLIEST_ACTIVATION = 1790346749n;
const PROPOSAL_TRANSACTION = "0x22f3f3aeae4b9425870ab7c154f37a4cf2b8bdc84cae0af8ddecc2af16c27c8f";

const chain = {
  id: 51,
  name: "XDC Apothem",
  nativeCurrency: { name: "TXDC", symbol: "TXDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.apothem.network"] } },
  blockExplorers: { default: { name: "XDCScan Testnet", url: "https://testnet.xdcscan.com" } },
} as const;

const registryAbi = parseAbi([
  "function owner() view returns (address)",
  "function legacyRegistry() view returns (address)",
  "function registrar() view returns (address)",
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
const subdomainAbi = parseAbi([
  "function owner() view returns (address)",
  "function registry() view returns (address)",
  "function pricingPolicy() view returns (address)",
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
  registrar: REGISTRAR,
  previousConsumer: PREVIOUS_CONSUMER,
  authorizationSigner: OWNER,
  earliestActivation: EARLIEST_ACTIVATION,
};

type Snapshot = ApothemRegistryV2ActivationState & {
  stage: ApothemRegistryV2ActivationStage;
  blockNumber: bigint;
};

const stageCopy: Record<ApothemRegistryV2ActivationStage, { label: string; detail: string }> = {
  waiting: {
    label: "Timelock in progress",
    detail: "The exact reviewed proposal is pending. Activation remains disabled until its on-chain deadline.",
  },
  ready: {
    label: "Activation ready",
    detail: "All bytecode, ownership and immutable-binding checks passed. The reviewed discount configuration can be activated.",
  },
  active: {
    label: "Registry V2 stack active",
    detail: "The new registrar is already active in both Registry V2 and Discount Authorization. Run the lifecycle tests before switching Preview variables.",
  },
  invalid: {
    label: "Activation blocked",
    detail: "Live state differs from the reviewed deployment. Do not submit a transaction until the mismatch is investigated.",
  },
};

export default function ApothemRegistryV2ActivationClient() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [account, setAccount] = useState<Address>();
  const [message, setMessage] = useState("Reading the reviewed Apothem rollout state…");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [hash, setHash] = useState<Hex>();

  const refresh = useCallback(async () => {
    try {
      const next = await readSnapshot();
      setSnapshot(next);
      setMessage(stageCopy[next.stage].detail);
      return next;
    } catch (error) {
      setSnapshot(undefined);
      setMessage(walletActionErrorMessage(error, "Unable to read the Apothem rollout state."));
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
    () => formatCountdown(Math.max(0, Number(EARLIEST_ACTIVATION) - now)),
    [now],
  );

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

  async function connectOwner() {
    await run(async () => {
      const provider = injectedProvider();
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts[0]) throw new Error("The wallet returned no account.");
      const selected = getAddress(accounts[0]);
      if (selected !== OWNER) throw new Error(`Select the protocol-owner wallet ${OWNER}.`);
      await ensureApothem(provider);
      const checked = await refresh();
      if (checked.stage === "invalid") throw new Error("The live state does not match the reviewed rollout.");
      setAccount(selected);
      setMessage(`Owner wallet connected. ${stageCopy[checked.stage].detail}`);
    });
  }

  async function activate() {
    if (!account || snapshot?.stage !== "ready") return;
    await run(async () => {
      const provider = injectedProvider();
      await validateSelectedOwner(provider, account);
      const checked = await readSnapshot();
      if (checked.stage !== "ready") throw new Error("The reviewed activation is not currently eligible.");

      const wallet = createWalletClient({ chain, transport: custom(provider) });
      const transactionHash = await wallet.writeContract({
        account,
        chain,
        address: DISCOUNT_AUTHORIZATION,
        abi: discountAbi,
        functionName: "activatePendingConfiguration",
      });
      setHash(transactionHash);
      setMessage("Activation submitted. Waiting for two confirmations…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash, confirmations: 2, timeout: 180_000 });
      if (receipt.status !== "success") throw new Error("The activation transaction reverted.");
      const next = await refresh();
      if (next.stage !== "active") throw new Error("The transaction confirmed, but post-activation validation did not pass.");
    });
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
              <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#087d78]">Apothem · guarded activation</p>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Activate the long-lived Registry V2 stack</h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">This Preview-only console validates the six verified contracts and every reviewed dependency. It exposes exactly one transaction and cannot deploy or replace contracts.</p>
            </div>
            <div className="rounded-3xl bg-[#071022] p-6 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300">Current gate</p>
              <p className="mt-3 text-2xl font-semibold">{copy?.label ?? "Checking Apothem"}</p>
              <p className="mt-4 text-sm leading-6 text-slate-300">Earliest activation</p>
              <p className="font-mono text-sm">25 Sep 2026 · 18:32 GST</p>
              <p className="mt-4 text-3xl font-semibold tabular-nums">{stageLabel(stage, countdown)}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_0.72fr]">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm md:p-9">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Activation sequence</p>
                <h2 className="mt-2 text-3xl font-semibold">One reviewed transaction</h2>
              </div>
              <button className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:border-teal-600 disabled:opacity-50" onClick={() => run(async () => { await refresh(); })} disabled={busy}>Refresh state</button>
            </div>
            <div className="mt-7 space-y-4">
              <Step number="1" title="Deploy and verify six contracts" state="done" detail="All source code is verified on XDCScan Testnet." />
              <Step number="2" title="Registry V2 registrar bootstrap" state="done" detail="Registry V2 already points to the reviewed new registrar; no Registry transaction is required." />
              <Step number="3" title="Activate discount consumer" state={stage === "active" ? "done" : stage === "ready" ? "current" : "locked"} detail="Activates only the proposal submitted in transaction 0x22f3…7c8f after its 48-hour delay." />
              <Step number="4" title="Preview release and lifecycle test" state={stage === "active" ? "current" : "locked"} detail="Apply the prepared Preview variables only after post-activation validation passes." />
            </div>
            <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-700">{message}</div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Action label={account ? `Owner ${shortAddress(account)}` : "Connect owner wallet"} onClick={connectOwner} disabled={busy} />
              <Action label="Activate reviewed configuration" onClick={activate} disabled={busy || !account || stage !== "ready"} warning />
            </div>
          </div>

          <aside className="space-y-6">
            <section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Reviewed addresses</p>
              <div className="mt-5 space-y-4">
                <AddressRow label="Registry V2" value={REGISTRY} accent />
                <AddressRow label="Primary registrar" value={REGISTRAR} accent />
                <AddressRow label="Discount authorization" value={DISCOUNT_AUTHORIZATION} />
                <AddressRow label="Protocol owner" value={OWNER} />
              </div>
              <a className="mt-5 inline-flex text-sm font-semibold text-[#087d78] underline underline-offset-4" href={`https://testnet.xdcscan.com/tx/${PROPOSAL_TRANSACTION}`} target="_blank" rel="noreferrer">View timelock proposal on XDCScan ↗</a>
            </section>
            <section className="rounded-[2rem] border border-amber-300 bg-amber-50 p-7">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-800">Release gate</p>
              <h2 className="mt-3 text-xl font-semibold">Do not switch Preview variables early</h2>
              <p className="mt-3 text-sm leading-6 text-amber-950">First confirm the page reaches “active”, then run the CLI preflight. Only then switch the six Preview variables and execute the complete lifecycle checklist.</p>
            </section>
          </aside>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Prepared Preview configuration</p>
            <h2 className="mt-2 text-2xl font-semibold">Do not apply until active</h2>
            <pre className="mt-5 overflow-x-auto rounded-2xl bg-[#071022] p-5 text-xs leading-6 text-teal-100">{previewVariables()}</pre>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Rollback snapshot</p>
            <h2 className="mt-2 text-2xl font-semibold">Restore the previous Preview values</h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">The previous app configuration remains documented. Restoring it does not restore the old discount consumer; that on-chain change requires a new 48-hour proposal.</p>
            <pre className="mt-5 overflow-x-auto rounded-2xl bg-slate-100 p-5 text-xs leading-6 text-slate-700">{rollbackVariables()}</pre>
          </div>
        </section>

        {hash ? (
          <section className="rounded-[2rem] border border-teal-200 bg-white p-7 shadow-sm">
            <h2 className="text-2xl font-semibold">Transaction from this session</h2>
            <Transaction hash={hash} />
          </section>
        ) : null}
      </div>
    </main>
  );
}

const publicClient = createPublicClient({
  chain,
  transport: http("/api/deployment/apothem-registry-v2-activation/rpc", { retryCount: 0, timeout: 15_000 }),
});

async function readSnapshot(): Promise<Snapshot> {
  const contracts: Array<[string, Address]> = [
    ["Registry V2", REGISTRY], ["primary registrar", REGISTRAR], ["forward resolver", FORWARD_RESOLVER],
    ["reverse resolver", REVERSE_RESOLVER], ["multichain resolver", MULTICHAIN_RESOLVER],
    ["subdomain registrar", SUBDOMAIN_REGISTRAR], ["previous Registry", PREVIOUS_REGISTRY],
    ["collision Registry", COLLISION_REGISTRY], ["Pricing Policy", PRICING_POLICY],
    ["Discount Authorization", DISCOUNT_AUTHORIZATION], ["previous consumer", PREVIOUS_CONSUMER],
  ];
  const code = await Promise.all(contracts.map(([, address]) => publicClient.getCode({ address })));
  code.forEach((value, index) => {
    if (!value || value === "0x") throw new Error(`${contracts[index][0]} has no deployed bytecode.`);
  });

  const readAddress = async (address: Address, abi: typeof ownedAbi | typeof registryAbi | typeof registrarAbi | typeof resolverAbi | typeof multichainAbi | typeof subdomainAbi | typeof discountAbi, functionName: string) =>
    getAddress(await publicClient.readContract({ address, abi, functionName } as never) as Address);

  const [registryOwner, registryLegacy, registryRegistrar, registrarOwner, policyOwner, discountOwner, subdomainOwner] = await Promise.all([
    readAddress(REGISTRY, registryAbi, "owner"), readAddress(REGISTRY, registryAbi, "legacyRegistry"),
    readAddress(REGISTRY, registryAbi, "registrar"), readAddress(REGISTRAR, registrarAbi, "owner"),
    readAddress(PRICING_POLICY, ownedAbi, "owner"), readAddress(DISCOUNT_AUTHORIZATION, discountAbi, "owner"),
    readAddress(SUBDOMAIN_REGISTRAR, subdomainAbi, "owner"),
  ]);
  for (const [label, owner] of [["Registry V2", registryOwner], ["primary registrar", registrarOwner], ["Pricing Policy", policyOwner], ["Discount Authorization", discountOwner], ["subdomain registrar", subdomainOwner]] as const) {
    if (owner !== OWNER) throw new Error(`${label} owner does not match the reviewed protocol owner.`);
  }
  if (registryLegacy !== PREVIOUS_REGISTRY) throw new Error("Registry V2 legacy source does not match the reviewed previous Registry.");

  const [registrarRegistry, registrarLegacy, registrarPolicy, registrarDiscount, primaryResolver, forwardRegistry, reverseRegistry, multichainRegistry, linkedReverse, subdomainRegistry, subdomainPolicy] = await Promise.all([
    readAddress(REGISTRAR, registrarAbi, "registry"), readAddress(REGISTRAR, registrarAbi, "legacyRegistry"),
    readAddress(REGISTRAR, registrarAbi, "pricingPolicy"), readAddress(REGISTRAR, registrarAbi, "discountAuthorization"),
    readAddress(REGISTRAR, registrarAbi, "primaryNameResolver"), readAddress(FORWARD_RESOLVER, resolverAbi, "registry"),
    readAddress(REVERSE_RESOLVER, resolverAbi, "registry"), readAddress(MULTICHAIN_RESOLVER, multichainAbi, "registry"),
    readAddress(MULTICHAIN_RESOLVER, multichainAbi, "reverseResolver"), readAddress(SUBDOMAIN_REGISTRAR, subdomainAbi, "registry"),
    readAddress(SUBDOMAIN_REGISTRAR, subdomainAbi, "pricingPolicy"),
  ]);
  const bindings: Array<[string, Address, Address]> = [
    ["registrar Registry", registrarRegistry, REGISTRY], ["registrar collision Registry", registrarLegacy, COLLISION_REGISTRY],
    ["registrar Pricing Policy", registrarPolicy, PRICING_POLICY], ["registrar Discount Authorization", registrarDiscount, DISCOUNT_AUTHORIZATION],
    ["registrar primary resolver", primaryResolver, REVERSE_RESOLVER], ["forward resolver Registry", forwardRegistry, REGISTRY],
    ["reverse resolver Registry", reverseRegistry, REGISTRY], ["multichain resolver Registry", multichainRegistry, REGISTRY],
    ["multichain reverse resolver", linkedReverse, REVERSE_RESOLVER], ["subdomain Registry", subdomainRegistry, REGISTRY],
    ["subdomain Pricing Policy", subdomainPolicy, PRICING_POLICY],
  ];
  for (const [label, actual, wanted] of bindings) {
    if (actual !== wanted) throw new Error(`${label} does not match the reviewed deployment.`);
  }

  const [authorizationSigner, discountConsumer, pendingSigner, pendingConsumer, pendingActivationTime, hasPendingConfiguration, block] = await Promise.all([
    readAddress(DISCOUNT_AUTHORIZATION, discountAbi, "authorizationSigner"), readAddress(DISCOUNT_AUTHORIZATION, discountAbi, "consumer"),
    readAddress(DISCOUNT_AUTHORIZATION, discountAbi, "pendingAuthorizationSigner"), readAddress(DISCOUNT_AUTHORIZATION, discountAbi, "pendingConsumer"),
    publicClient.readContract({ address: DISCOUNT_AUTHORIZATION, abi: discountAbi, functionName: "pendingActivationTime" }),
    publicClient.readContract({ address: DISCOUNT_AUTHORIZATION, abi: discountAbi, functionName: "hasPendingConfiguration" }),
    publicClient.getBlock(),
  ]);
  const state: ApothemRegistryV2ActivationState = {
    registryRegistrar, discountConsumer, authorizationSigner, pendingSigner, pendingConsumer,
    pendingActivationTime: pendingActivationTime as bigint,
    hasPendingConfiguration: hasPendingConfiguration as boolean,
    blockTimestamp: block.timestamp,
  };
  return { ...state, stage: deriveApothemRegistryV2ActivationStage(state, expected), blockNumber: block.number };
}

function Step({ number, title, detail, state }: { number: string; title: string; detail: string; state: "current" | "done" | "locked" }) {
  const tone = state === "done" ? "bg-emerald-100 text-emerald-800" : state === "current" ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-400";
  return <div className="flex gap-4 rounded-2xl border border-slate-200 p-4"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${tone}`}>{state === "done" ? "✓" : number}</div><div><p className="font-semibold">{title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p></div></div>;
}

function AddressRow({ label, value, accent = false }: { label: string; value: Address; accent?: boolean }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><a className={`mt-1 block break-all font-mono text-xs underline underline-offset-4 ${accent ? "text-[#087d78]" : "text-slate-700"}`} href={`https://testnet.xdcscan.com/address/${value}#code`} target="_blank" rel="noreferrer">{value}</a></div>;
}

function Action({ label, onClick, disabled, warning = false }: { label: string; onClick: () => void; disabled: boolean; warning?: boolean }) {
  return <button className={`${warning ? "bg-amber-600" : "bg-[#071022]"} rounded-xl px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-35`} onClick={onClick} disabled={disabled}>{label}</button>;
}

function Transaction({ hash }: { hash: Hex }) {
  return <p className="mt-4 text-sm"><span className="font-semibold">Discount configuration: </span><a className="break-all font-mono text-[#087d78] underline" href={`https://testnet.xdcscan.com/tx/${hash}`} target="_blank" rel="noreferrer">{hash}</a></p>;
}

function previewVariables() {
  return `NEXT_PUBLIC_XNS_REGISTRY=${REGISTRY}\nNEXT_PUBLIC_XNS_REGISTRAR=${REGISTRAR}\nNEXT_PUBLIC_XNS_RESOLVER_V2=${FORWARD_RESOLVER}\nNEXT_PUBLIC_XNS_REVERSE_RESOLVER_V2=${REVERSE_RESOLVER}\nNEXT_PUBLIC_XNS_MULTICHAIN_RESOLVER=${MULTICHAIN_RESOLVER}\nNEXT_PUBLIC_XNS_SUBDOMAIN_REGISTRAR=${SUBDOMAIN_REGISTRAR}`;
}

function rollbackVariables() {
  return `NEXT_PUBLIC_XNS_REGISTRY=<unset; effective ${PREVIOUS_REGISTRY}>\nNEXT_PUBLIC_XNS_REGISTRAR=${PREVIOUS_CONSUMER}\nNEXT_PUBLIC_XNS_RESOLVER_V2=0xc5897D100e811A91E398567a593BD671DE42e5d2\nNEXT_PUBLIC_XNS_REVERSE_RESOLVER_V2=0x1ff9B9c9463a2d85029bdD3AFC99a8cf51260Ee2\nNEXT_PUBLIC_XNS_MULTICHAIN_RESOLVER=0x2212Fc40Feda6e8DD7030E9B70B38c7EB79f6989\nNEXT_PUBLIC_XNS_SUBDOMAIN_REGISTRAR=<unset; effective 0xa2135729ce122ef93158FCc4C69683155e6707d3>`;
}

function stageLabel(stage: ApothemRegistryV2ActivationStage | undefined, countdown: string) {
  if (stage === "waiting") return countdown;
  if (stage === "ready") return "Eligible now";
  if (stage === "active") return "Complete";
  if (stage === "invalid") return "Blocked";
  return "—";
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
  if (!provider) throw new Error("No injected wallet was detected. Open this Preview in a browser with MetaMask.");
  return provider;
}

async function validateSelectedOwner(provider: EIP1193Provider, expectedOwner: Address) {
  await ensureApothem(provider);
  const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
  if (!accounts[0] || getAddress(accounts[0]) !== expectedOwner || expectedOwner !== OWNER) {
    throw new Error("The selected wallet is no longer the reviewed protocol owner.");
  }
}

async function ensureApothem(provider: EIP1193Provider) {
  const current = await provider.request({ method: "eth_chainId" }) as string;
  if (Number.parseInt(current, 16) === chain.id) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x33" }] });
  } catch {
    await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x33", chainName: chain.name, nativeCurrency: chain.nativeCurrency, rpcUrls: chain.rpcUrls.default.http, blockExplorerUrls: [chain.blockExplorers.default.url] }] });
  }
}
