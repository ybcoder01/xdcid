"use client";

import { useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  keccak256,
  toBytes,
  type Address,
  type EIP1193Provider,
  type Hex,
  type PublicClient,
} from "viem";
import { apothemUnifiedDeploymentArtifacts as artifacts } from "../../../generated/apothemUnifiedDeployment";

const REGISTRY = getAddress("0xbe394cA8615E5DC0284262aad962Ef72414b0270");
const RESOLVER = getAddress("0xA31f6c0323e8f5281c228b7fF2527520890D59Ab");
const REGISTRAR = getAddress("0xd24d4fFF55b5D470d5B60d801ea77b60D39F8838");

const apothem = {
  id: 51,
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
type SmokeStep = { label: string; state: "pending" | "wallet" | "confirming" | "complete" | "failed"; hash?: Hex; error?: string };

const initialSteps: SmokeStep[] = [
  { label: "Register a 10-year top-level smoke ID", state: "pending" },
  { label: "Verify automatic Primary ID and renew the parent", state: "pending" },
  { label: "Register a one-year child ID", state: "pending" },
  { label: "Select the child as Primary ID", state: "pending" },
  { label: "Renew the child and verify forward/reverse resolution", state: "pending" },
];

export default function ApothemUnifiedSmokeClient() {
  const [steps, setSteps] = useState(initialSteps);
  const [busy, setBusy] = useState(false);
  const [smokeNames, setSmokeNames] = useState<{ parent: string; child: string }>();
  const [report, setReport] = useState<Record<string, unknown>>();
  const [message, setMessage] = useState("Connect an Apothem test wallet to begin.");

  function update(index: number, patch: Partial<SmokeStep>) {
    setSteps((current) => current.map((step, position) => position === index ? { ...step, ...patch } : step));
  }

  async function runSmoke() {
    if (busy) return;
    setBusy(true);
    try {
      const provider = injectedProvider();
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts[0]) throw new Error("Connect an Apothem test wallet");
      await ensureApothem(provider);
      const publicClient = createPublicClient({ chain: apothem, transport: custom(provider) });
      const walletClient = createWalletClient({ chain: apothem, transport: custom(provider) });
      const account = getAddress(accounts[0]);
      const startedAt = new Date().toISOString();
      const smokeLabel = `smoke-${Date.now().toString(36)}`;
      const parentName = `${smokeLabel}.xdc`;
      const childLabel = "child";
      const childName = `${childLabel}.${parentName}`;
      setSmokeNames({ parent: parentName, child: childName });
      const parentNode = keccak256(toBytes(parentName));
      const childNode = keccak256(toBytes(childName));

      for (const address of [REGISTRY, RESOLVER, REGISTRAR]) {
        const code = await publicClient.getCode({ address });
        if (!code || code === "0x") throw new Error(`Missing deployed code at ${address}`);
      }

      update(0, { state: "wallet" });
      const registrationQuote = await apiQuote("/api/v1/registrar/quote", { name: parentName, product: "registration", termYears: 10, paymentCurrency: "XDC", payer: account, nameOwner: account });
      const registrationHash = await walletClient.writeContract({
        account, chain: apothem, address: REGISTRAR, abi: artifacts.registrar.abi,
        functionName: "register", args: [parentName, registrationQuote.quote, registrationQuote.signature], value: registrationQuote.quote.paymentAmount,
      });
      update(0, { state: "confirming", hash: registrationHash });
      await receipt(publicClient, registrationHash, "Parent registration");
      update(0, { state: "complete", hash: registrationHash });

      const initialPrimary = await publicClient.readContract({
        address: RESOLVER, abi: artifacts.resolver.abi, functionName: "primaryNames", args: [account],
      });
      if (initialPrimary !== parentName) throw new Error("First registration was not initialized as Primary ID");
      update(1, { state: "wallet" });
      const renewalQuote = await apiQuote("/api/v1/registrar/quote", { name: parentName, product: "renewal", termYears: 1, paymentCurrency: "XDC", payer: account, nameOwner: account });
      const renewalHash = await walletClient.writeContract({
        account, chain: apothem, address: REGISTRAR, abi: artifacts.registrar.abi,
        functionName: "renew", args: [parentName, renewalQuote.quote, renewalQuote.signature], value: renewalQuote.quote.paymentAmount,
      });
      update(1, { state: "confirming", hash: renewalHash });
      await receipt(publicClient, renewalHash, "Parent renewal");
      update(1, { state: "complete", hash: renewalHash });

      update(2, { state: "wallet" });
      const childQuote = await apiQuote("/api/v1/subdomain/quote", { parentName, label: childLabel, action: "registration", termYears: 1, paymentCurrency: "XDC", payer: account, subdomainOwner: account });
      const childHash = await walletClient.writeContract({
        account, chain: apothem, address: REGISTRAR, abi: artifacts.registrar.abi,
        functionName: "registerSubdomain", args: [parentName, childLabel, childQuote.quote, childQuote.signature], value: childQuote.quote.paymentAmount,
      });
      update(2, { state: "confirming", hash: childHash });
      await receipt(publicClient, childHash, "Child registration");
      update(2, { state: "complete", hash: childHash });

      update(3, { state: "wallet" });
      const primaryHash = await walletClient.writeContract({
        account, chain: apothem, address: RESOLVER, abi: artifacts.resolver.abi,
        functionName: "setPrimaryName", args: [childName],
      });
      update(3, { state: "confirming", hash: primaryHash });
      await receipt(publicClient, primaryHash, "Child Primary ID selection");
      update(3, { state: "complete", hash: primaryHash });

      update(4, { state: "wallet" });
      const childRenewalQuote = await apiQuote("/api/v1/subdomain/quote", { parentName, label: childLabel, action: "renewal", termYears: 1, paymentCurrency: "XDC", payer: account, subdomainOwner: account });
      const childRenewalHash = await walletClient.writeContract({
        account, chain: apothem, address: REGISTRAR, abi: artifacts.registrar.abi,
        functionName: "renewSubdomain", args: [parentName, childLabel, childRenewalQuote.quote, childRenewalQuote.signature], value: childRenewalQuote.quote.paymentAmount,
      });
      update(4, { state: "confirming", hash: childRenewalHash });
      await receipt(publicClient, childRenewalHash, "Child renewal");

      const [owner, forward, reverse] = await Promise.all([
        publicClient.readContract({ address: REGISTRY, abi: artifacts.registry.abi, functionName: "ownerOf", args: [childNode] }),
        publicClient.readContract({ address: RESOLVER, abi: artifacts.resolver.abi, functionName: "addressFor", args: [childNode, 50n] }),
        publicClient.readContract({ address: RESOLVER, abi: artifacts.resolver.abi, functionName: "reverse", args: [account, 50n] }),
      ]);
      if (getAddress(owner as Address) !== account || getAddress(forward as Address) !== account || reverse !== childName) {
        throw new Error("Final child ownership or forward/reverse resolution check failed");
      }
      update(4, { state: "complete", hash: childRenewalHash });
      setReport({ startedAt, completedAt: new Date().toISOString(), chainId: 51, wallet: account, names: { parent: parentName, child: childName }, contracts: { registry: REGISTRY, resolver: RESOLVER, registrar: REGISTRAR }, transactions: { registrationHash, renewalHash, childHash, primaryHash, childRenewalHash }, checks: { owner, forward, reverse } });
      setMessage(`Wallet-signed smoke test passed for ${parentName} and ${childName}. Dev remains inactive.`);
    } catch (cause) {
      const error = cause instanceof Error ? cause.message.split("\n")[0] : "Smoke test failed";
      setSteps((current) => current.map((step) =>
        step.state === "wallet" || step.state === "confirming" ? { ...step, state: "failed", error } : step,
      ));
      setMessage(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl space-y-7">
        <section className="rounded-3xl border border-cyan-800 bg-cyan-950/50 p-6 sm:p-7">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">Apothem only · wallet-signed release gate</p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Smoke test Unified XDCID V3</h1>
          <p className="mt-3 text-slate-300">Creates {smokeNames ? <><span className="font-mono text-white">{smokeNames.parent}</span> and <span className="font-mono text-white">{smokeNames.child}</span></> : "a uniquely named parent and child smoke record"}. Each transaction is shown in MetaMask. No dev configuration is changed.</p>
          <p className="mt-5 rounded-xl bg-slate-800 p-4 text-slate-200">{message}</p>
          <button type="button" className="mt-5 rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-40" onClick={runSmoke} disabled={busy || steps.every((step) => step.state === "complete")}>{busy ? "Smoke test in progress…" : "Connect and run wallet smoke"}</button>
          {report ? <button type="button" className="ml-3 mt-5 rounded-xl border border-cyan-500 px-5 py-3 font-semibold text-cyan-200" onClick={() => downloadReport(report)}>Download smoke report</button> : null}
        </section>
        <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 sm:p-7">
          <ol className="space-y-4">
            {steps.map((step, index) => (
              <li key={step.label} className="rounded-xl border border-slate-700 p-4">
                <div className="flex flex-wrap justify-between gap-3"><span>{index + 1}. {step.label}</span><span className="font-semibold text-cyan-300">{step.state}</span></div>
                {step.hash ? <a className="mt-2 block break-all font-mono text-sm text-cyan-300 underline" href={`https://testnet.xdcscan.com/tx/${step.hash}`} target="_blank" rel="noreferrer">{step.hash}</a> : null}
                {step.error ? <p className="mt-2 text-sm text-red-300">{step.error}</p> : null}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}

async function apiQuote(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json() as { data?: { authorizedForPayment: boolean; quote: Record<string, string | number>; signature: Hex }; error?: { message?: string } };
  if (!response.ok || !payload.data?.authorizedForPayment) throw new Error(payload.error?.message || "The quote service is not ready");
  const quote = payload.data.quote;
  return { signature: payload.data.signature, quote: { node: String(quote.node) as Hex, parentNode: String(quote.parentNode) as Hex, payer: getAddress(String(quote.payer)), nameOwner: getAddress(String(quote.nameOwner ?? quote.subdomainOwner)), product: Number(quote.product), paymentToken: getAddress(String(quote.paymentToken)), termYears: BigInt(quote.termYears), paymentAmount: BigInt(quote.paymentAmount), usdMicros: BigInt(quote.usdMicros), policyVersion: BigInt(quote.policyVersion), nonce: BigInt(quote.nonce), issuedAt: BigInt(quote.issuedAt), deadline: BigInt(quote.deadline) } };
}

function downloadReport(report: Record<string, unknown>) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = `xdcid-apothem-smoke-${Date.now()}.json`; link.click(); URL.revokeObjectURL(url);
}

async function receipt(client: PublicClient, hash: Hex, label: string) {
  const result = await client.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 180_000 });
  if (result.status !== "success") throw new Error(`${label} failed`);
}

function injectedProvider(): EIP1193Provider {
  const injected = (window as Window & { ethereum?: MetaMaskProvider }).ethereum;
  if (!injected) throw new Error("MetaMask was not detected");
  const providers = injected.providers ?? [injected];
  const metamask = providers.find(
    (provider: MetaMaskProvider) =>
      provider.isMetaMask === true && provider.isRabby !== true,
  );
  if (!metamask) throw new Error("Enable MetaMask to continue on Apothem");
  return metamask;
}

async function ensureApothem(provider: EIP1193Provider) {
  const current = (await provider.request({ method: "eth_chainId" })) as string;
  if (Number.parseInt(current, 16) === 51) return;
  await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x33" }] });
}
