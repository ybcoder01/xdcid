"use client";

import { useState } from "react";
import {
  formatEther,
  formatUnits,
  getAddress,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWriteContract,
} from "wagmi";
import {
  addresses,
  erc20ApprovalAbi,
  signedRegistrarAbi,
} from "../config/contracts";

type Currency = "XDC" | "USDC";
type Term = 1 | 3 | 5 | 10;
type Quote = {
  node: Hex;
  payer: Address;
  nameOwner: Address;
  product: number;
  termYears: string;
  paymentToken: Address;
  paymentAmount: string;
  usdMicros: string;
  policyVersion: string;
  nonce: string;
  issuedAt: string;
  deadline: string;
};
type ResponseBody = {
  data?: {
    authorizedForPayment: boolean;
    chainId: number;
    registrar: Address;
    quote: Quote;
    signature: Hex;
  };
  error?: { message?: string };
};

export function SignedRenewalControls({ name }: { name: string }) {
  const { address } = useAccount();
  const chainId = useChainId();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [termYears, setTermYears] = useState<Term>(1);
  const [currency, setCurrency] = useState<Currency>("XDC");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function renew() {
    if (!address || !client) return;
    if (chainId !== 50) {
      setStatus("Switch your wallet to XDC Network.");
      return;
    }
    setBusy(true);
    setStatus("Requesting a renewal quote…");
    try {
      const response = await fetch("/api/v1/registrar/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          product: "renewal",
          termYears,
          paymentCurrency: currency,
          payer: address,
          nameOwner: address,
        }),
      });
      const body = (await response.json()) as ResponseBody;
      if (!response.ok || !body.data?.authorizedForPayment) {
        throw new Error(body.error?.message || "Unable to create renewal quote");
      }
      if (
        body.data.chainId !== 50 ||
        getAddress(body.data.registrar) !== getAddress(addresses.registrar)
      ) {
        throw new Error("The quote does not match the active XDCID registrar");
      }
      const quote = {
        ...body.data.quote,
        payer: getAddress(body.data.quote.payer),
        nameOwner: getAddress(body.data.quote.nameOwner),
        paymentToken: getAddress(body.data.quote.paymentToken),
        termYears: BigInt(body.data.quote.termYears),
        paymentAmount: BigInt(body.data.quote.paymentAmount),
        usdMicros: BigInt(body.data.quote.usdMicros),
        policyVersion: BigInt(body.data.quote.policyVersion),
        nonce: BigInt(body.data.quote.nonce),
        issuedAt: BigInt(body.data.quote.issuedAt),
        deadline: BigInt(body.data.quote.deadline),
      };
      if (quote.deadline < BigInt(Math.floor(Date.now() / 1_000))) {
        throw new Error("The quote expired; request a new quote");
      }

      if (quote.paymentToken !== zeroAddress) {
        setStatus("Approve exactly " + formatUnits(quote.paymentAmount, 6) + " USDC…");
        const approval = await writeContractAsync({
          address: quote.paymentToken,
          abi: erc20ApprovalAbi,
          functionName: "approve",
          args: [addresses.registrar, quote.paymentAmount],
        });
        const approvalReceipt = await client.waitForTransactionReceipt({ hash: approval });
        if (approvalReceipt.status !== "success") throw new Error("USDC approval failed");
      }

      setStatus(
        currency === "XDC"
          ? "Confirm payment of " + formatEther(quote.paymentAmount) + " XDC…"
          : "Confirm the renewal payment…",
      );
      const hash = await writeContractAsync({
        address: addresses.registrar,
        abi: signedRegistrarAbi,
        functionName: "renewWithQuote",
        args: [name, quote, body.data.signature],
        value: quote.paymentToken === zeroAddress ? quote.paymentAmount : 0n,
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Renewal transaction failed");
      setStatus("Renewal confirmed: " + hash);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Renewal failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <select
        className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
        value={termYears}
        onChange={(event) => setTermYears(Number(event.target.value) as Term)}
      >
        <option value={1}>1 year</option>
        <option value={3}>3 years — 10% off</option>
        <option value={5}>5 years — 15% off</option>
        <option value={10}>10 years — 20% off</option>
      </select>
      <select
        className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
        value={currency}
        onChange={(event) => setCurrency(event.target.value as Currency)}
      >
        <option value="XDC">XDC</option>
        <option value="USDC">USDC</option>
      </select>
      <button
        className="rounded-md bg-slate-950 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        disabled={busy}
        onClick={renew}
      >
        {busy ? "Processing…" : "Renew"}
      </button>
      {status && <p className="break-all text-xs text-neutral-600 sm:col-span-3">{status}</p>}
    </div>
  );
}
