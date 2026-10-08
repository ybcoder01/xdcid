"use client";

import { useMemo, useState } from "react";
import {
  formatEther,
  formatUnits,
  getAddress,
  keccak256,
  toBytes,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import {
  activeSubdomainRegistrarAddress,
  activeXnsChainId,
  addresses,
  apothemRegistration,
  erc20ApprovalAbi,
  isTestnetEnvironment,
  pricingPolicyAbi,
  subdomainRegistrarAbi,
  unifiedProtocolEnabled,
  unifiedRegistrarAbi,
  unifiedRegistryReadAbi,
  unifiedSubdomainRegistryAddress,
} from "../config/contracts";
import { XDC_WRITE_GAS_LIMITS, xdcWriteOverrides } from "../lib/xdcWriteGas";
import { walletActionErrorMessage } from "../lib/walletErrors";

type Currency = "XDC" | "USDC";
type Term = 1 | 3 | 5 | 10;
type SerializedQuote = {
  node: Hex;
  parentNode: Hex;
  payer: Address;
  subdomainOwner: Address;
  nameOwner?: Address;
  product?: number;
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
  data?: {
    authorizedForPayment: boolean;
    chainId: number;
    registrar: Address;
    protocolGeneration?: "legacy" | "unified-v3";
    action: "registration" | "renewal";
    quote: SerializedQuote;
    signature: Hex;
  };
  error?: { message?: string };
};

const TERMS: Term[] = [1, 3, 5, 10];
const YEAR_SECONDS = 365n * 24n * 60n * 60n;

export function SubdomainRenewalControls({
  expiryTimestamp,
  label,
  onRenewed,
  parentExpiryTimestamp,
  parentName,
}: {
  expiryTimestamp: string;
  label: string;
  onRenewed?: () => void | Promise<void>;
  parentExpiryTimestamp?: string;
  parentName: string;
}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const client = usePublicClient({ chainId: activeXnsChainId });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [termYears, setTermYears] = useState<Term>(1);
  const [currency, setCurrency] = useState<Currency>("XDC");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const node = keccak256(toBytes(`${label}.${parentName}`));
  const unifiedRecord = useReadContract({
    address: unifiedSubdomainRegistryAddress,
    chainId: activeXnsChainId,
    abi: unifiedRegistryReadAbi,
    functionName: "records",
    args: [node],
    query: { enabled: unifiedProtocolEnabled },
  });
  const pricingPolicy = isTestnetEnvironment
    ? apothemRegistration.pricingPolicy
    : addresses.pricingPolicy;
  const price = useReadContract({
    address: pricingPolicy,
    chainId: activeXnsChainId,
    abi: pricingPolicyAbi,
    functionName: "priceUsdMicros",
    args: [unifiedProtocolEnabled ? 3 : 2, BigInt(label.length), BigInt(termYears)],
  });
  const allowedTerms = useMemo(() => {
    if (!parentExpiryTimestamp) return TERMS;
    const remaining = BigInt(parentExpiryTimestamp) - BigInt(expiryTimestamp);
    return TERMS.filter((term) => BigInt(term) * YEAR_SECONDS <= remaining);
  }, [expiryTimestamp, parentExpiryTimestamp]);
  const selectedTermAllowed = allowedTerms.includes(termYears);

  async function renew() {
    const subdomainOwner = unifiedProtocolEnabled
      ? unifiedRecord.data?.owner
      : address;
    if (
      !address ||
      !client ||
      !selectedTermAllowed ||
      !subdomainOwner ||
      subdomainOwner === zeroAddress
    ) return;
    setBusy(true);
    setStatus("");
    try {
      if (chainId !== activeXnsChainId) {
        setStatus(
          `Switching to ${isTestnetEnvironment ? "XDC Apothem" : "XDC Network"}…`,
        );
        await switchChainAsync({ chainId: activeXnsChainId });
      }

      setStatus("Requesting a renewal quote…");
      const response = await fetch("/api/v1/subdomain/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentName,
          label,
          action: "renewal",
          termYears,
          paymentCurrency: currency,
          payer: address,
          subdomainOwner,
        }),
      });
      const body = (await response.json()) as QuoteResponse;
      if (!response.ok || !body.data?.authorizedForPayment) {
        throw new Error(body.error?.message || "Unable to create a subdomain renewal quote");
      }
      if (
        body.data.action !== "renewal" ||
        body.data.chainId !== activeXnsChainId ||
        getAddress(body.data.registrar) !== getAddress(activeSubdomainRegistrarAddress) ||
        (body.data.protocolGeneration === "unified-v3") !== unifiedProtocolEnabled
      ) {
        throw new Error("The quote does not match the active subdomain registrar");
      }

      const quote = {
        ...body.data.quote,
        payer: getAddress(body.data.quote.payer),
        subdomainOwner: getAddress(body.data.quote.subdomainOwner),
        paymentToken: getAddress(body.data.quote.paymentToken),
        termYears: BigInt(body.data.quote.termYears),
        paymentAmount: BigInt(body.data.quote.paymentAmount),
        usdMicros: BigInt(body.data.quote.usdMicros),
        policyVersion: BigInt(body.data.quote.policyVersion),
        nonce: BigInt(body.data.quote.nonce),
        issuedAt: BigInt(body.data.quote.issuedAt),
        deadline: BigInt(body.data.quote.deadline),
      };
      if (
        quote.payer !== getAddress(address) ||
        quote.subdomainOwner !== getAddress(subdomainOwner)
      ) {
        throw new Error("The quote is not bound to the connected wallet");
      }
      if (quote.deadline < BigInt(Math.floor(Date.now() / 1_000))) {
        throw new Error("The quote expired; request a new quote");
      }

      if (quote.paymentToken !== zeroAddress) {
        setStatus(`Approve exactly ${formatUnits(quote.paymentAmount, 6)} USDC…`);
        const approvalGas = await xdcWriteOverrides(
          client,
          activeXnsChainId,
          XDC_WRITE_GAS_LIMITS.erc20Approval,
        );
        const approvalHash = await writeContractAsync({
          address: quote.paymentToken,
          abi: erc20ApprovalAbi,
          functionName: "approve",
          args: [activeSubdomainRegistrarAddress, quote.paymentAmount],
          ...approvalGas,
        });
        const approvalReceipt = await client.waitForTransactionReceipt({
          hash: approvalHash,
        });
        if (approvalReceipt.status !== "success") {
          throw new Error("USDC approval failed");
        }
      }

      setStatus(
        quote.paymentToken === zeroAddress
          ? `Confirm payment of ${formatEther(quote.paymentAmount)} ${isTestnetEnvironment ? "TXDC" : "XDC"}…`
          : "Confirm the renewal payment…",
      );
      const gas = await xdcWriteOverrides(
        client,
        activeXnsChainId,
        XDC_WRITE_GAS_LIMITS.subdomainRenewal,
      );
      const hash = await writeContractAsync({
        address: activeSubdomainRegistrarAddress,
        abi: unifiedProtocolEnabled ? unifiedRegistrarAbi : subdomainRegistrarAbi,
        functionName: unifiedProtocolEnabled ? "renewSubdomain" : "renewWithQuote",
        args: [parentName, label, quote, body.data.signature],
        value: quote.paymentToken === zeroAddress ? quote.paymentAmount : 0n,
        ...gas,
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("Subdomain renewal failed");
      }
      setStatus("Renewal confirmed.");
      await onRenewed?.();
    } catch (error) {
      setStatus(walletActionErrorMessage(error, "Subdomain renewal failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-w-full gap-2 sm:min-w-0 sm:grid-cols-[10rem_10rem_auto]">
      <select
        aria-label={`Renewal term for ${label}.${parentName}`}
        className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
        value={termYears}
        onChange={(event) => setTermYears(Number(event.target.value) as Term)}
      >
        {TERMS.map((term) => (
          <option disabled={!allowedTerms.includes(term)} key={term} value={term}>
            {term} {term === 1 ? "year" : "years"}
          </option>
        ))}
      </select>
      <select
        aria-label={`Renewal payment currency for ${label}.${parentName}`}
        className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
        value={currency}
        onChange={(event) => setCurrency(event.target.value as Currency)}
      >
        <option value="XDC">{isTestnetEnvironment ? "TXDC" : "XDC"}</option>
        <option value="USDC">USDC</option>
      </select>
      <button
        className="rounded-md bg-slate-950 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
        disabled={
          busy ||
          !selectedTermAllowed ||
          (unifiedProtocolEnabled && !unifiedRecord.data?.owner)
        }
        onClick={renew}
      >
        {busy ? "Processing…" : "Renew"}
      </button>
      <p className="text-xs text-neutral-600 sm:col-span-3">
        {typeof price.data === "bigint"
          ? `Price: $${(Number(price.data) / 1_000_000).toFixed(2)}`
          : "Loading price…"}
        {parentExpiryTimestamp
          ? ` · Parent limit: ${new Date(Number(parentExpiryTimestamp) * 1_000).toLocaleDateString()}`
          : ""}
      </p>
      {status ? (
        <p className="break-all text-xs text-neutral-600 sm:col-span-3">{status}</p>
      ) : null}
    </div>
  );
}
