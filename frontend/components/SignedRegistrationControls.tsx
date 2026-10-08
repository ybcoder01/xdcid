"use client";

import Link from "next/link";
import { useState } from "react";
import {
  formatEther,
  formatUnits,
  getAddress,
  isAddress,
  isHex,
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
  addresses,
  discountedRegistrarAbi,
  erc20ApprovalAbi,
  pricingPolicyAbi,
  signedRegistrarAbi,
  unifiedProtocolEnabled,
  unifiedRegistrarAbi,
} from "../config/contracts";
import { saveName } from "../config/localNames";
import {
  deserializeDomainDiscountAuthorization,
  type SerializedDomainDiscountAuthorization,
} from "../lib/domainDiscounts";
import { XDC_WRITE_GAS_LIMITS, xdcWriteOverrides } from "../lib/xdcWriteGas";
import { trackRegistration } from "../lib/productAnalytics";
import { walletActionErrorMessage } from "../lib/walletErrors";

type Currency = "XDC" | "USDC";
type Term = 1 | 3 | 5 | 10;

type SerializedQuote = {
  node: Hex;
  parentNode?: Hex;
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
    protocolGeneration?: "legacy" | "unified-v3";
    name: string;
    paymentCurrency: Currency;
    quote: SerializedQuote;
    signature: Hex;
    discount?: {
      authorizationContract: Address;
      authorization: SerializedDomainDiscountAuthorization;
      signature: Hex;
    };
  };
  error?: { code?: string; message?: string };
};

export function SignedRegistrationControls(props: {
  name: string;
  enabled: boolean;
  initialTermYears?: Term;
  expectedChainId?: number;
  registrarAddress?: Address;
  pricingPolicyAddress?: Address;
  nativeCurrencyLabel?: string;
}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const client = usePublicClient({ chainId: props.expectedChainId ?? 50 });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [termYears, setTermYears] = useState<Term>(props.initialTermYears ?? 1);
  const [currency, setCurrency] = useState<Currency>("XDC");
  const [status, setStatus] = useState("");
  const [registrationHash, setRegistrationHash] = useState<Hex | "">("");
  const [busy, setBusy] = useState(false);
  const expectedChainId = props.expectedChainId ?? 50;
  const registrarAddress = props.registrarAddress ?? addresses.registrar;
  const pricingPolicyAddress = props.pricingPolicyAddress ?? addresses.pricingPolicy;
  const nativeCurrencyLabel = props.nativeCurrencyLabel ?? "XDC";
  const labelLength = props.name.endsWith(".xdc")
    ? props.name.slice(0, -4).length
    : props.name.length;
  const pricingEnabled = pricingPolicyAddress !== zeroAddress;
  const annualPrice = useReadContract({
    address: pricingPolicyAddress,
    chainId: expectedChainId,
    abi: pricingPolicyAbi,
    functionName: "priceUsdMicros",
    args: [0, BigInt(labelLength), 1n],
    query: { enabled: pricingEnabled },
  });
  const discountedPrice = useReadContract({
    address: pricingPolicyAddress,
    chainId: expectedChainId,
    abi: pricingPolicyAbi,
    functionName: "priceUsdMicros",
    args: [0, BigInt(labelLength), BigInt(termYears)],
    query: { enabled: pricingEnabled },
  });
  const grossUsdMicros =
    typeof annualPrice.data === "bigint"
      ? annualPrice.data * BigInt(termYears)
      : undefined;
  const finalUsdMicros =
    typeof discountedPrice.data === "bigint"
      ? discountedPrice.data
      : undefined;
  const discountBps =
    grossUsdMicros && finalUsdMicros !== undefined
      ? ((grossUsdMicros - finalUsdMicros) * 10_000n) / grossUsdMicros
      : 0n;

  async function register() {
    if (!props.enabled || !isConnected || !address || !client) return;
    setRegistrationHash("");
    if (chainId !== expectedChainId) {
      setStatus(
        "Requesting a switch to " +
          (expectedChainId === 51 ? "XDC Apothem" : "XDC Network") +
          "…",
      );
      try {
        await switchChainAsync({ chainId: expectedChainId });
      } catch {
        setStatus(
          "Switch your wallet to " +
            (expectedChainId === 51 ? "XDC Apothem" : "XDC Network") +
            " to continue.",
        );
        return;
      }
    }

    setBusy(true);
    setStatus("Requesting a short-lived payment quote…");
    trackRegistration("started", currency, termYears);
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
        payload.data.chainId !== expectedChainId ||
        getAddress(payload.data.registrar) !== getAddress(registrarAddress) ||
        (payload.data.protocolGeneration === "unified-v3") !== unifiedProtocolEnabled
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

      const discount = payload.data.discount;
      if (
        discount &&
        (!isAddress(discount.authorizationContract) || !isHex(discount.signature))
      ) {
        throw new Error("The discount grant response is invalid");
      }
      const discountAuthorization = discount
        ? deserializeDomainDiscountAuthorization(discount.authorization)
        : undefined;
      if (
        discountAuthorization &&
        (getAddress(discountAuthorization.beneficiary) !== getAddress(address) ||
          discountAuthorization.node !== quote.node ||
          discountAuthorization.product !== quote.product ||
          discountAuthorization.termYears !== quote.termYears ||
          discountAuthorization.deadline < BigInt(Math.floor(Date.now() / 1_000)))
      ) {
        throw new Error("The discount grant does not match this registration");
      }

      if (quote.paymentToken !== zeroAddress && quote.paymentAmount > 0n) {
        if (!isAddress(quote.paymentToken)) {
          throw new Error("The quote contains an invalid payment token");
        }
        setStatus(
          "Approve exactly " +
            formatUnits(quote.paymentAmount, 6) +
            " USDC in your wallet…",
        );
        const approvalGas = await xdcWriteOverrides(
          client,
          expectedChainId,
          XDC_WRITE_GAS_LIMITS.erc20Approval,
        );
        const approvalHash = await writeContractAsync({
          address: quote.paymentToken,
          abi: erc20ApprovalAbi,
          functionName: "approve",
          args: [registrarAddress, quote.paymentAmount],
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
        quote.paymentAmount === 0n
          ? "Confirm the gas-only registration in your wallet…"
          : currency === "XDC"
          ? "Confirm payment of " +
              formatEther(quote.paymentAmount) +
              " " +
              nativeCurrencyLabel +
              "…"
          : "Confirm the registration payment…",
      );
      const registrationGas = await xdcWriteOverrides(
        client,
        expectedChainId,
        XDC_WRITE_GAS_LIMITS.registration,
      );
      const transactionHash = unifiedProtocolEnabled
        ? discountAuthorization && discount
          ? await writeContractAsync({
              address: registrarAddress,
              abi: unifiedRegistrarAbi,
              functionName: "registerWithDiscount",
              args: [
                props.name,
                quote,
                payload.data.signature,
                discountAuthorization,
                discount.signature,
              ],
              value: quote.paymentToken === zeroAddress ? quote.paymentAmount : 0n,
              ...registrationGas,
            })
          : await writeContractAsync({
              address: registrarAddress,
              abi: unifiedRegistrarAbi,
              functionName: "register",
              args: [props.name, quote, payload.data.signature],
              value: quote.paymentToken === zeroAddress ? quote.paymentAmount : 0n,
              ...registrationGas,
            })
        : discountAuthorization && discount
        ? await writeContractAsync({
            address: registrarAddress,
            abi: discountedRegistrarAbi,
            functionName: "registerWithDiscountQuote",
            args: [
              props.name,
              quote,
              payload.data.signature,
              discountAuthorization,
              discount.signature,
            ],
            value: quote.paymentToken === zeroAddress ? quote.paymentAmount : 0n,
            ...registrationGas,
          })
        : await writeContractAsync({
            address: registrarAddress,
            abi: signedRegistrarAbi,
            functionName: "registerWithQuote",
            args: [props.name, quote, payload.data.signature],
            value: quote.paymentToken === zeroAddress ? quote.paymentAmount : 0n,
            ...registrationGas,
          });
      const receipt = await client.waitForTransactionReceipt({
        hash: transactionHash,
      });
      if (receipt.status !== "success") {
        throw new Error("Registration transaction failed");
      }

      saveName(address, props.name);
      setRegistrationHash(transactionHash);
      setStatus("Registration confirmed: " + transactionHash);
      trackRegistration("confirmed", currency, termYears);
    } catch (error) {
      setStatus(walletActionErrorMessage(error, "Registration failed"));
      trackRegistration("failed", currency, termYears);
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
            <option value="XDC">{nativeCurrencyLabel}</option>
            <option value="USDC">USDC</option>
          </select>
        </label>
      </div>
      {pricingEnabled ? (
        <div className="mt-4 rounded-lg border border-black/10 bg-white p-3 text-sm text-slate-700">
  igInt(value.issuedAt),
    deadline: BigInt(value.deadline),
  };
}


function formatUsdMicros(value: bigint): string {
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return "$" + whole.toString() + (fraction ? "." + fraction : "");
}

function formatDiscount(value: bigint): string {
  const whole = value / 100n;
  const fraction = value % 100n;
  return fraction === 0n
    ? whole.toString() + "%"
    : whole.toString() + "." + fraction.toString().padStart(2, "0") + "%";
}
