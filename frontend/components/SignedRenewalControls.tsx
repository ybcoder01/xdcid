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
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import {
  addresses,
  erc20ApprovalAbi,
  signedRegistrarAbi,
} from "../config/contracts";
import { XDC_WRITE_GAS_LIMITS, xdcWriteOverrides } from "../lib/xdcWriteGas";
import { walletActionErrorMessage } from "../lib/walletErrors";

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

export function SignedRenewalControls(props: {
  name: string;
  expectedChainId?: number;
  registrarAddress?: Address;
  nativeCurrencyLabel?: string;
  onRenewed?: () => void | Promise<void>;
}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const expectedChainId = props.expectedChainId ?? 50;
  const registrarAddress = props.registrarAddress ?? addresses.registrar;
  const nativeCurrencyLabel = props.nativeCurrencyLabel ?? "XDC";
  const client = usePublicClient({ chainId: expectedChainId });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [termYears, setTermYears] = useState<Term>(1);
  const [currency, setCurrency] = useState<Currency>("XDC");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function renew() {
    if (!address || !client) return;
    if (chainId !== expectedChainId) {
      setStatus(
        "Requesting a switch to " +
          (expectedChainId === 51 ? "XDC Apothem" : "XDC Network") +
          "…",
      );
      try {
        await switchChainAsync({ chainId: expectedChainId });
      } catch (error) {
        setStatus(walletActionErrorMessage(error, "Network switch cancelled."));
        return;
      }
    }
    setBusy(true);
    setStatus("Requesting a renewal quote…");
    try {
      const response = await fetch("/api/v1/registrar/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: props.name,
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
        body.data.chainId !== expectedChainId ||
        getAddress(body.data.registrar) !== getAddress(registrarAddress)
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
        const approvalGas = await xdcWriteOverrides(
          client,
          expectedChainId,
          XDC_WRITE_GAS_LIMITS.erc20Approval,
        );
        const approval = await writeContractAsync({
          address: quote.paymentToken,
          abi: erc20ApprovalAbi,
          functionName: "approve",
          args: [registrarAddress, quote.paymentAmount],
          ...approvalGas,
        });
        const approvalReceipt = await client.waitForTransactionReceipt({ hash: approval });
        if (approvalReceipt.status !== "success") throw new Error("USDC approval failed");
      }

      setStatus(
        currency === "XDC"
          ? "Confirm payment of " + formatEther(quote.paymentAmount) + " " + nativeCurrencyLabel + "…"
          : "Confirm the renewal payment…",
      );
      const renewalGas = await xdcWriteOverrides(
        client,
        expectedChainId,
        XDC_WRITE_GAS_LIMITS.renewal,
      );
      const hash = await writeContractAsync({
        address: registrarAddress,
        abi: signedRegistrarAbi,
        functionName: "renewWithQuote",
        args: [props.name, quote, body.data.signature],
        value: quote.paymentToken === zeroAddress ? quote.paymentAmount : 0n,
        ...renewalGas,
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Renewal transaction failed");
      setStatus("Renewal confirmed: " + hash);
      await props.onRenewed?.();
    } catch (error) {
      setStatus(walletActionErrorMessage(error, "Renewal failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <select
        aria-label="Renewal term"
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
        aria-label="Renewal payment currency"
        className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
        value={currency}
        onChange={(event) => setCurrency(event.target.value as Currency)}
      >
        <option value="XDC">{nativeCurrencyLabel}</option>
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
