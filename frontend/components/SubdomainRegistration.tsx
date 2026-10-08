"use client";

import { useEffect, useMemo, useState } from "react";
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
import { isNonZeroAddress } from "../lib/addressValidation";
import {
  activeSubdomainRegistrarAddress,
  activeXnsChainId,
  addresses,
  apothemRegistration,
  erc20ApprovalAbi,
  isTestnetEnvironment,
  pricingPolicyAbi,
  subdomainRegistrarAbi,
  subdomainRegistrationEnabled,
  unifiedProtocolEnabled,
  unifiedRegistrarAbi,
  unifiedRegistryReadAbi,
  unifiedSubdomainRegistryAddress,
} from "../config/contracts";
import { XDC_WRITE_GAS_LIMITS, xdcWriteOverrides } from "../lib/xdcWriteGas";
import { parseXnsName } from "../lib/names";
import { saveSubdomain } from "../config/localSubdomains";

type Currency = "XDC" | "USDC";
type Term = 1 | 3 | 5 | 10;
type Action = "registration" | "renewal";

type SubdomainRegistrationProps = {
  allowDisabledEnvironment?: boolean;
  allowRenewalsWhenDisabled?: boolean;
  initialParentName?: string;
  initialLabel?: string;
};

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
    action: Action;
    quote: SerializedQuote;
    signature: Hex;
  };
  error?: { message?: string };
};

export function SubdomainRegistration({
  allowDisabledEnvironment = false,
  allowRenewalsWhenDisabled = false,
  initialParentName = "",
  initialLabel = "",
}: SubdomainRegistrationProps = {}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const client = usePublicClient({ chainId: activeXnsChainId });
  const { writeContractAsync } = useWriteContract();
  const [parentInput, setParentInput] = useState(initialParentName);
  const [labelInput, setLabelInput] = useState(initialLabel);
  const [ownerInput, setOwnerInput] = useState("");
  const [termYears, setTermYears] = useState<Term>(1);
  const [currency, setCurrency] = useState<Currency>("XDC");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const registrationEnabled =
    subdomainRegistrationEnabled || allowDisabledEnvironment;
  const lookupEnabled = registrationEnabled || allowRenewalsWhenDisabled;

  useEffect(() => {
    if (address && !ownerInput) setOwnerInput(address);
  }, [address, ownerInput]);

  const parent = useMemo(() => parseXnsName(parentInput), [parentInput]);
  const label = labelInput.trim().toLowerCase();
  const labelValid =
    label.length >= 1 &&
    label.length <= 63 &&
    /^[a-z0-9-]+$/.test(label) &&
    !label.startsWith("-") &&
    !label.endsWith("-");
  const inputValid = parent.isValid && labelValid;
  const node = inputValid
    ? keccak256(toBytes(`${label}.${parent.name}`))
    : undefined;
  const pricingPolicy = isTestnetEnvironment
    ? apothemRegistration.pricingPolicy
    : addresses.pricingPolicy;
  const available = useReadContract({
    address: activeSubdomainRegistrarAddress,
    chainId: activeXnsChainId,
    abi: subdomainRegistrarAbi,
    functionName: "available",
    args: inputValid ? [parent.name, label] : undefined,
    query: { enabled: !unifiedProtocolEnabled && lookupEnabled && inputValid },
  });
  const owner = useReadContract({
    address: activeSubdomainRegistrarAddress,
    chainId: activeXnsChainId,
    abi: subdomainRegistrarAbi,
    functionName: "ownerOf",
    args: node ? [node] : undefined,
    query: { enabled: !unifiedProtocolEnabled && lookupEnabled && !!node },
  });
  const unifiedRecord = useReadContract({
    address: unifiedSubdomainRegistryAddress,
    chainId: activeXnsChainId,
    abi: unifiedRegistryReadAbi,
    functionName: "records",
    args: node ? [node] : undefined,
    query: { enabled: unifiedProtocolEnabled && lookupEnabled && !!node },
  });
  const currentOwner = unifiedProtocolEnabled
    ? unifiedRecord.data?.owner
    : owner.data;
  const isAvailable = unifiedProtocolEnabled
    ? unifiedRecord.data?.owner === zeroAddress
    : available.data;
  const lookupLoading = unifiedProtocolEnabled
    ? unifiedRecord.isLoading
    : available.isLoading;
  const hasActiveOwner =
    typeof currentOwner === "string" && currentOwner !== zeroAddress;
  const availabilityReady =
    isAvailable === true ||
    (isAvailable === false && typeof currentOwner === "string");
  const action: Action = isAvailable === false && hasActiveOwner
    ? "renewal"
    : "registration";
  const price = useReadContract({
    address: pricingPolicy,
    chainId: activeXnsChainId,
    abi: pricingPolicyAbi,
    functionName: "priceUsdMicros",
    args: [
      action === "registration" ? 2 : 3,
      BigInt(label.length || 1),
      BigInt(termYears),
    ],
    query: { enabled: lookupEnabled },
  });
  const actionEnabled =
    registrationEnabled || (allowRenewalsWhenDisabled && action === "renewal");

  useEffect(() => {
    if (action === "renewal" && currentOwner && currentOwner !== zeroAddress) {
      setOwnerInput(currentOwner);
    }
  }, [action, currentOwner]);

  async function submit() {
    if (
      !actionEnabled ||
      !isConnected ||
      !address ||
      !client ||
      !inputValid ||
      !isNonZeroAddress(ownerInput)
    ) return;

    setBusy(true);
    try {
      if (chainId !== activeXnsChainId) {
        setStatus(`Switching to ${isTestnetEnvironment ? "XDC Apothem" : "XDC Network"}…`);
        await switchChainAsync({ chainId: activeXnsChainId });
      }
      setStatus("Requesting a short-lived subdomain quote…");
      const response = await fetch("/api/v1/subdomain/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentName: parent.name,
          label,
          action,
          termYears,
          paymentCurrency: currency,
          payer: address,
          subdomainOwner: getAddress(ownerInput),
        }),
      });
      const payload = (await response.json()) as QuoteResponse;
      if (!response.ok || !payload.data?.authorizedForPayment) {
        throw new Error(payload.error?.message || "Unable to create a subdomain quote");
      }
      if (
        payload.data.chainId !== activeXnsChainId ||
        getAddress(payload.data.registrar) !==
          getAddress(activeSubdomainRegistrarAddress) ||
        payload.data.action !== action ||
        (payload.data.protocolGeneration === "unified-v3") !== unifiedProtocolEnabled
      ) {
        throw new Error("The quote does not match the active subdomain registrar");
      }
      const quote = deserializeQuote(payload.data.quote);
      if (
        quote.payer !== getAddress(address) ||
        quote.subdomainOwner !== getAddress(ownerInput)
      ) {
        throw new Error("The quote is not bound to the selected wallets");
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
          : `Confirm the ${action} payment…`,
      );
      const gas = await xdcWriteOverrides(
        client,
        activeXnsChainId,
        action === "registration"
          ? XDC_WRITE_GAS_LIMITS.subdomainRegistration
          : XDC_WRITE_GAS_LIMITS.subdomainRenewal,
      );
      const hash = await writeContractAsync({
        address: activeSubdomainRegistrarAddress,
        abi: unifiedProtocolEnabled ? unifiedRegistrarAbi : subdomainRegistrarAbi,
        functionName: unifiedProtocolEnabled
          ? action === "registration"
            ? "registerSubdomain"
            : "renewSubdomain"
          : action === "registration"
            ? "registerWithQuote"
            : "renewWithQuote",
        args: [parent.name, label, quote, payload.data.signature],
        value: quote.paymentToken === zeroAddress ? quote.paymentAmount : 0n,
        ...gas,
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error(`Subdomain ${action} failed`);
      }
      saveSubdomain(getAddress(ownerInput), `${label}.${parent.name}`);
      setStatus(`Subdomain ${action} confirmed: ${hash}`);
      await Promise.all(
        unifiedProtocolEnabled
          ? [unifiedRecord.refetch()]
          : [available.refetch(), owner.refetch()],
      );
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Subdomain transaction failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border bg-white p-7 shadow-sm">
      {!registrationEnabled ? (
        <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
          New subdomain registration is not public yet. Enter an existing
          subdomain below to renew it.
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Parent XDCID" value={parentInput} onChange={setParentInput} placeholder="company.xdc" />
        <Field label="Subdomain label" value={labelInput} onChange={setLabelInput} placeholder="alice" />
        <Field label="Subdomain owner" value={ownerInput} onChange={setOwnerInput} placeholder="0x…" />
        <label className="text-sm font-medium">
          Term
          <select className="mt-2 w-full rounded-xl border p-3" value={termYears} onChange={(event) => setTermYears(Number(event.target.value) as Term)}>
            <option value={1}>1 year</option>
            <option value={3}>3 years — 10% discount</option>
            <option value={5}>5 years — 15% discount</option>
            <option value={10}>10 years — 20% discount</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Payment
          <select className="mt-2 w-full rounded-xl border p-3" value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>
            <option value="XDC">{isTestnetEnvironment ? "TXDC" : "XDC"}</option>
            <option value="USDC">USDC</option>
          </select>
        </label>
        <div className="rounded-xl border bg-slate-50 p-4 text-sm">
          <p className="text-slate-500">Live policy price</p>
          <p className="mt-1 font-semibold">
            {typeof price.data === "bigint" ? formatUsdMicros(price.data) : "Loading…"}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border bg-slate-50 p-4 text-sm">
        {!inputValid
          ? "Enter a valid parent name and subdomain label."
            : lookupLoading
              ? "Checking availability…"
            : isAvailable
              ? `${label}.${parent.name} is available.`
              : currentOwner && currentOwner !== zeroAddress
                ? `${label}.${parent.name} is registered and can be renewed by an authorized controller.`
                : `${label}.${parent.name} is unavailable.`}
      </div>
      <button
        className="mt-5 w-full rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-50"
        disabled={
          !isConnected ||
          !inputValid ||
          !isNonZeroAddress(ownerInput) ||
          !availabilityReady ||
          busy ||
          !actionEnabled ||
          (isAvailable === false && !hasActiveOwner)
        }
        onClick={submit}
      >
        {busy
          ? "Processing…"
          : action === "registration"
            ? registrationEnabled
              ? "Get quote and register subdomain"
              : "New registrations are not public yet"
            : "Get quote and renew subdomain"}
      </button>
      {status ? <p className="mt-4 break-all text-sm text-slate-600">{status}</p> : null}
      <p className="mt-4 text-xs text-slate-500">
        Registration must be submitted by the parent owner or an authorized parent operator. A subdomain cannot outlive its parent name.
      </p>
    </section>
  );
}

function deserializeQuote(value: SerializedQuote) {
  return {
    node: value.node,
    parentNode: value.parentNode,
    payer: getAddress(value.payer),
    subdomainOwner: getAddress(value.subdomainOwner),
    ...(value.nameOwner ? { nameOwner: getAddress(value.nameOwner) } : {}),
    ...(typeof value.product === "number" ? { product: value.product } : {}),
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

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="text-sm font-medium">
      {props.label}
      <input
        className="mt-2 w-full rounded-xl border p-3"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
      />
    </label>
  );
}

function formatUsdMicros(value: bigint) {
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `$${whole}${fraction ? `.${fraction}` : ""}`;
}
