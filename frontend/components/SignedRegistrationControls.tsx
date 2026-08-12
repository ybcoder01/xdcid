"use client";

import { useState } from "react";
import {
  formatEther,
  formatUnits,
  getAddress,
  isAddress,
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
import { saveName } from "../config/localNames";

type Currency = "XDC" | "USDC";
type Term = 1 | 3 | 5 | 10;

type SerializedQuote = {
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

type QuoteResponse = {
  version?: string;
  data?: {
    authorizedForPayment: boolean;
    chainId: number;
    registrar: Address;
    name: string;
    paymentCurrency: Currency;
    quote: SerializedQuote;
    signature: Hex;
  };
  error?: { code?: string; message?: string };
};

export function SignedRegistrationControls(props: {
  name: string;
  enabled: boolean;
}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [termYears, setTermYears] = useState<Term>(1);
  const [currency, setCurrency] = useState<Currency>("XDC");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function register() {
    if (!props.enabled || !isConnected || !address || !client) return;
    if (chainId !== 50) {
      setStatus("Switch your wallet to XDC Network before requesting a quote.");
      return;
    }

    setBusy(true);
    setStatus("Requesting a short-lived payment quote…");
    try {
      const response = await fetch("/api/v1/registrar/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: props.name,
          product: "registration",
          termYears,
          paymentCurrency: currency,
          payer: address,
          nameOwner: address,
        }),
      });
      const payload = (await response.json()) as QuoteResponse;
      if (!response.ok || !payload.data?.authorizedForPayment) {
        throw new Error(
          payload.error?.message || "Unable to create a registration quote",
        );
      }
      if (
        payload.data.chainId !== 50 ||
        getAddress(payload.data.registrar) !== getAddress(addresses.registrar)
      ) {
        throw new Error("The quote does not match the active XDCID registrar");
      }

      const quote = deserializeQuote(payload.data.quote);
      if (
        getAddress(quote.payer) !== getAddress(address) ||
        getAddress(quote.nameOwner) !== getAddress(address)
      ) {
        throw new Error("The quote is not bound to the connected wallet");
      }
      if (quote.deadline < BigInt(Math.floor(Date.now() / 1_000))) {
        throw new Error("The quote expired; request a new quote");
      }

      if (quote.paymentToken !== zeroAddress) {
        if (!isAddress(quote.paymentToken)) {
          throw new Error("The quote contains an invalid payment token");
        }
        setStatus(
          "Approve exactly " +
            formatUnits(quote.paymentAmount, 6) +
            " USDC in your wallet…",
        );
        const approvalHash = await writeContractAsync({
          address: quote.paymentToken,
          abi: erc20ApprovalAbi,
          functionName: "approve",
          args: [addresses.registrar, quote.paymentAmount],
        });
        const approvalReceipt = await client.waitForTransactionReceipt({
          hash: approvalHash,
        });
        if (approvalReceipt.status !== "success") {
          throw new Error("USDC approval failed");
        }
      }

      setStatus(
        currency === "XDC"
          ? "Confirm payment of " + formatEther(quote.paymentAmount) + " XDC…"
          : "Confirm the registration payment…",
      );
      const transactionHash = await writeContractAsync({
        address: addresses.registrar,
        abi: signedRegistrarAbi,
        functionName: "registerWithQuote",
        args: [props.name, quote, payload.data.signature],
        value: quote.paymentToken === zeroAddress ? quote.paymentAmount : 0n,
      });
      const receipt = await client.waitForTransactionReceipt({
        hash: transactionHash,
      });
      if (receipt.status !== "success") {
        throw new Error("Registration transaction failed");
      }

      saveName(address, props.name);
      setStatus("Registration confirmed: " + transactionHash);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full rounded-xl border border-black/10 bg-neutral-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-800">
          Term
          <select
            className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2"
            value={termYears}
            onChange={(event) =>
              setTermYears(Number(event.target.value) as Term)
            }
          >
            <option value={1}>1 year</option>
            <option value={3}>3 years — 10% discount</option>
            <option value={5}>5 years — 15% discount</option>
            <option value={10}>10 years — 20% discount</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-800">
          Payment
          <select
            className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2"
            value={currency}
            onChange={(event) => setCurrency(event.target.value as Currency)}
          >
            <option value="XDC">XDC</option>
            <option value="USDC">USDC</option>
          </select>
        </label>
      </div>
      <button
        className="mt-4 w-full rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-[#0b6670] disabled:opacity-50"
        disabled={!props.enabled || !isConnected || busy}
        onClick={register}
      >
        {busy ? "Processing…" : "Get quote and register"}
      </button>
      {status && (
        <p className="mt-3 break-all text-xs text-neutral-600">{status}</p>
      )}
    </div>
  );
}

function deserializeQuote(value: SerializedQuote) {
  return {
    node: value.node,
    payer: getAddress(value.payer),
    nameOwner: getAddress(value.nameOwner),
    product: value.product,
    termYears: BigInt(value.termYears),
    paymentToken: getAddress(value.paymentToken),
    paymentAmount: BigInt(value.paymentAmount),
    usdMicros: BigInt(value.usdMicros),
    policyVersion: BigInt(value.policyVersion),
    nonce: BigInt(value.nonce),
    issuedAt: BigInt(value.issuedAt),
    deadline: BigInt(value.deadline),
  };
}
