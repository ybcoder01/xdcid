"use client";

import { useState } from "react";
import {
  createPublicClient, createWalletClient, custom, formatEther, getAddress,
  keccak256, toBytes, zeroAddress, type Address, type EIP1193Provider, type Hex,
} from "viem";
import { APOTHEM_PRICING, apothem } from "../../../config/apothemPricing";
import { apothemDeploymentArtifacts as artifacts } from "../../../generated/apothemDeployment";
import {
  SIGNED_QUOTE_DOMAIN_NAME, SIGNED_QUOTE_DOMAIN_VERSION, signedQuoteTypes,
  type RegistrarQuote,
} from "../../../lib/signedRegistrarQuotes";

const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }] },
] as const;

type Product = "registration" | "renewal";
type Currency = "XDC" | "USDC";
type Prepared = { name: string; quote: RegistrarQuote; signature: Hex; currency: Currency };

export default function ApothemPricingTestClient() {
  const [account, setAccount] = useState<Address>();
  const [name, setName] = useState("");
  const [product, setProduct] = useState<Product>("registration");
  const [years, setYears] = useState(1);
  const [currency, setCurrency] = useState<Currency>("XDC");
  const [prepared, setPrepared] = useState<Prepared>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Connect the designated Apothem wallet.");
  const [hash, setHash] = useState<Hex>();
  const [result, setResult] = useState<{ owner: Address; expiry: bigint }>();

  async function connect() {
    try {
      const provider = injectedProvider();
      const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
      if (!accounts[0]) throw new Error("Wallet returned no account");
      const selected = getAddress(accounts[0]);
      if (selected !== APOTHEM_PRICING.expectedWallet) throw new Error("Select the designated test wallet");
      await ensureApothem(provider);
      setAccount(selected);
      setMessage("Wallet verified on Apothem.");
    } catch (error) { setMessage(errorMessage(error)); }
  }

  async function prepareQuote() {
    if (!account || busy) return;
    setBusy(true); setPrepared(undefined); setHash(undefined); setResult(undefined);
    try {
      const provider = injectedProvider();
      await ensureApothem(provider);
      const { publicClient, walletClient } = clients(provider);
      const canonical = canonicalize(name);
      const node = keccak256(toBytes(canonical));
      const labelLength = canonical.length - 4;
      const productId: 0 | 1 = product === "registration" ? 0 : 1;

      if (product === "registration") {
        const available = await publicClient.readContract({
          address: APOTHEM_PRICING.registrar, abi: artifacts.registrar.abi,
          functionName: "available", args: [canonical],
        });
        if (!available) throw new Error("Name is not available");
      } else {
        const owner = await publicClient.readContract({
          address: APOTHEM_PRICING.registry, abi: artifacts.registry.abi,
          functionName: "ownerOf", args: [node],
        });
        if (getAddress(owner as Address) !== account) throw new Error("Connected wallet does not own this name");
      }

      const [usd, version, nonce, config] = await Promise.all([
        publicClient.readContract({
          address: APOTHEM_PRICING.pricingPolicy, abi: artifacts.pricingPolicy.abi,
          functionName: "priceUsdMicros", args: [productId, BigInt(labelLength), BigInt(years)],
        }),
        publicClient.readContract({
          address: APOTHEM_PRICING.pricingPolicy, abi: artifacts.pricingPolicy.abi,
          functionName: "version",
        }),
        publicClient.readContract({
          address: APOTHEM_PRICING.registrar, abi: artifacts.registrar.abi,
          functionName: "nonces", args: [account],
        }),
        publicClient.readContract({
          address: APOTHEM_PRICING.pricingPolicy, abi: artifacts.pricingPolicy.abi,
          functionName: "config",
        }),
      ]);
      const policy = config as unknown as { quoteSigner: Address; usdcToken: Address;
        xdcPaymentsEnabled: boolean; usdcPaymentsEnabled: boolean };
      if (getAddress(policy.quoteSigner) !== account) throw new Error("Wallet is not the active quote signer");

      const paymentToken = currency === "USDC" ? APOTHEM_PRICING.usdc : zeroAddress;
      let paymentAmount = usd as bigint;
      if (currency === "USDC") {
        if (!policy.usdcPaymentsEnabled) throw new Error("USDC payments are disabled");
        if (getAddress(policy.usdcToken) !== APOTHEM_PRICING.usdc) throw new Error("Policy USDC address mismatch");
      } else {
        if (!policy.xdcPaymentsEnabled) throw new Error("XDC payments are disabled");
        paymentAmount = await fetchXdcAmount(canonical, product, years);
      }

      const issuedAt = BigInt(Math.floor(Date.now() / 1000) - 5);
      const quote: RegistrarQuote = {
        node, payer: account, nameOwner: account, product: productId,
        termYears: BigInt(years), paymentToken, paymentAmount,
        usdMicros: usd as bigint, policyVersion: version as bigint,
        nonce: nonce as bigint, issuedAt, deadline: issuedAt + 600n,
      };
      const signature = await walletClient.signTypedData({
        account,
        domain: { name: SIGNED_QUOTE_DOMAIN_NAME, version: SIGNED_QUOTE_DOMAIN_VERSION,
          chainId: APOTHEM_PRICING.chainId, verifyingContract: APOTHEM_PRICING.registrar },
        types: signedQuoteTypes, primaryType: "Quote", message: quote,
      });
      setPrepared({ name: canonical, quote, signature, currency });
      setMessage("Quote signed. Submit it before the ten-minute deadline.");
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function submit() {
    if (!account || !prepared || busy) return;
    setBusy(true); setHash(undefined); setResult(undefined);
    try {
      const provider = injectedProvider();
      await ensureApothem(provider);
      const { publicClient, walletClient } = clients(provider);

      if (BigInt(Math.floor(Date.now() / 1000)) > prepared.quote.deadline) {
        throw new Error("This quote has expired. Prepare and sign a new quote.");
      }
      const currentNonce = await publicClient.readContract({
        address: APOTHEM_PRICING.registrar, abi: artifacts.registrar.abi,
        functionName: "nonces", args: [account],
      }) as bigint;
      if (currentNonce !== prepared.quote.nonce) {
        throw new Error("This quote has already been used. Prepare and sign a new quote.");
      }

      if (prepared.currency === "USDC") {
        const balance = await publicClient.readContract({
          address: APOTHEM_PRICING.usdc, abi: erc20Abi, functionName: "balanceOf", args: [account],
        }) as bigint;
        if (balance < prepared.quote.paymentAmount) {
          throw new Error("Insufficient Apothem USDC balance for this renewal.");
        }
        const allowance = await publicClient.readContract({
          address: APOTHEM_PRICING.usdc, abi: erc20Abi, functionName: "allowance",
          args: [account, APOTHEM_PRICING.registrar],
        }) as bigint;
        if (allowance < prepared.quote.paymentAmount) {
          setMessage("Approve the exact quoted USDC amount.");
          const approval = await walletClient.writeContract({
            account, chain: apothem, address: APOTHEM_PRICING.usdc, abi: erc20Abi,
            functionName: "approve", args: [APOTHEM_PRICING.registrar, prepared.quote.paymentAmount],
          });
          await publicClient.waitForTransactionReceipt({ hash: approval, confirmations: 2 });
        }
      }
      setMessage("Checking the transaction before opening the wallet.");
      const simulation = await publicClient.simulateContract({
        account, address: APOTHEM_PRICING.registrar, abi: artifacts.registrar.abi,
        functionName: prepared.quote.product === 0 ? "registerWithQuote" : "renewWithQuote",
        args: [prepared.name, prepared.quote, prepared.signature],
        value: prepared.currency === "XDC" ? prepared.quote.paymentAmount : 0n,
      });
      setMessage("Confirm the registrar transaction.");
      const tx = await walletClient.writeContract(simulation.request);
      setHash(tx);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx, confirmations: 2, timeout: 120_000 });
      if (receipt.status !== "success") throw new Error("Registrar transaction reverted");
      const [owner, expiry] = await Promise.all([
        publicClient.readContract({ address: APOTHEM_PRICING.registry, abi: artifacts.registry.abi,
          functionName: "ownerOf", args: [prepared.quote.node] }),
        publicClient.readContract({ address: APOTHEM_PRICING.registry, abi: artifacts.registry.abi,
          functionName: "expiryOf", args: [prepared.quote.node] }),
      ]);
      setResult({ owner: getAddress(owner as Address), expiry: expiry as bigint });
      setMessage("Confirmed. Submit this same quote again to verify replay protection.");
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-950">
    <div className="mx-auto max-w-4xl space-y-7">
      <section className="rounded-3xl border border-amber-300 bg-amber-50 p-7">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">Preview-only Apothem test</p>
        <h1 className="mt-3 text-4xl font-semibold">Test pricing, registration and renewal</h1>
        <p className="mt-3 text-slate-700">The designated test wallet signs locally. Nothing is stored.</p>
      </section>
      <section className="space-y-5 rounded-3xl border bg-white p-7 shadow-sm">
        <p className="rounded-xl bg-slate-100 p-4">{message}</p>
        <button className="rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-50"
          onClick={connect} disabled={busy}>{account ? "Wallet connected" : "Connect test wallet"}</button>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name"><input className="w-full rounded-xl border px-4 py-3" value={name}
            onChange={(e) => { setName(e.target.value); setPrepared(undefined); }} placeholder="pricingtest.xdc" /></Field>
          <Field label="Action"><select className="w-full rounded-xl border px-4 py-3" value={product}
            onChange={(e) => { setProduct(e.target.value as Product); setPrepared(undefined); }}>
            <option value="registration">Registration</option><option value="renewal">Renewal</option>
          </select></Field>
          <Field label="Term"><select className="w-full rounded-xl border px-4 py-3" value={years}
            onChange={(e) => { setYears(Number(e.target.value)); setPrepared(undefined); }}>
            {[1,3,5,10].map((value) => <option key={value} value={value}>{value} year(s)</option>)}
          </select></Field>
          <Field label="Payment"><select className="w-full rounded-xl border px-4 py-3" value={currency}
            onChange={(e) => { setCurrency(e.target.value as Currency); setPrepared(undefined); }}>
            <option value="USDC">USDC</option><option value="XDC">TXDC</option>
          </select></Field>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-50"
            onClick={prepareQuote} disabled={!account || busy || !name.trim()}>Prepare and sign quote</button>
          <button className="rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50"
            onClick={submit} disabled={!prepared || busy}>Submit prepared quote</button>
        </div>
      </section>
      {prepared && <section className="rounded-3xl border bg-white p-7 shadow-sm">
        <h2 className="text-2xl font-semibold">Prepared quote</h2>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <p>Name: {prepared.name}</p><p>USD total: {Number(prepared.quote.usdMicros) / 1_000_000}</p>
          <p>Payment: {prepared.currency === "XDC" ? formatEther(prepared.quote.paymentAmount) + " TXDC"
            : Number(prepared.quote.paymentAmount) / 1_000_000 + " USDC"}</p>
          <p>Nonce: {prepared.quote.nonce.toString()}</p>
          <p>Expires: {new Date(Number(prepared.quote.deadline) * 1000).toLocaleString()}</p>
        </div>
      </section>}
      {(hash || result) && <section className="rounded-3xl border bg-white p-7 shadow-sm">
        <h2 className="text-2xl font-semibold">On-chain result</h2>
        {hash && <a className="mt-3 block break-all text-blue-700 underline"
          href={APOTHEM_PRICING.explorerUrl + "/tx/" + hash} target="_blank" rel="noreferrer">{hash}</a>}
        {result && <div className="mt-4"><p className="break-all">Owner: {result.owner}</p>
          <p>Expiry: {new Date(Number(result.expiry) * 1000).toLocaleString()}</p></div>}
      </section>}
    </div>
  </main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-2"><span className="font-medium">{label}</span>{children}</label>;
}
async function fetchXdcAmount(name: string, product: Product, years: number) {
  const query = new URLSearchParams({ name, product, years: String(years) });
  const response = await fetch("/api/v1/pricing/quote?" + query.toString(), { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || "Unable to obtain XDC conversion");
  const data = body?.data ?? body;
  if (!data?.xdc?.wei) throw new Error("Pricing response omitted XDC amount");
  return BigInt(data.xdc.wei);
}
function canonicalize(value: string) {
  const lowered = value.trim().toLowerCase();
  const full = lowered.endsWith(".xdc") ? lowered : lowered + ".xdc";
  const label = full.slice(0, -4);
  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(label))
    throw new Error("Use 3-63 letters, numbers, or internal hyphens");
  return full;
}
function clients(provider: EIP1193Provider) {
  return { publicClient: createPublicClient({ chain: apothem, transport: custom(provider) }),
    walletClient: createWalletClient({ chain: apothem, transport: custom(provider) }) };
}
function injectedProvider(): EIP1193Provider {
  const provider = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
  if (!provider) throw new Error("No injected browser wallet detected");
  return provider;
}
async function ensureApothem(provider: EIP1193Provider) {
  const current = await provider.request({ method: "eth_chainId" }) as string;
  if (Number.parseInt(current, 16) === APOTHEM_PRICING.chainId) return;
  try { await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x33" }] }); }
  catch {
    await provider.request({ method: "wallet_addEthereumChain", params: [{
      chainId: "0x33", chainName: apothem.name, nativeCurrency: apothem.nativeCurrency,
      rpcUrls: apothem.rpcUrls.default.http, blockExplorerUrls: [apothem.blockExplorers.default.url],
    }] });
  }
}
function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("already been used") || message.includes("InvalidNonce"))
    return "This quote has already been used. Prepare and sign a new quote.";
  if (message.toLowerCase().includes("expired") || message.includes("QuoteExpired"))
    return "This quote has expired. Prepare and sign a new quote.";
  if (message.toLowerCase().includes("insufficient") && message.toLowerCase().includes("usdc"))
    return "Insufficient Apothem USDC balance for this payment.";
  if (message.includes("tx fee") && message.includes("configured cap"))
    return "The transaction could not be simulated safely. Check the selected currency and balance, then prepare a new quote.";
  if (message.length > 240)
    return "The transaction was rejected during its safety check. Prepare a new quote and verify the payment currency and balance.";
  return message || "Wallet operation failed";
}
