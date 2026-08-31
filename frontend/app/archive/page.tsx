"use client";

import { useEffect, useMemo, useState } from "react";
import {
  erc20Abi,
  formatUnits,
  getAddress,
  type Address,
  type Hash
} from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSignMessage,
  useSwitchChain,
  useWriteContract
} from "wagmi";
import { PAYMENT_NETWORK_ENV } from "../../config/paymentNetworks";

type Plan = {
  years: 1 | 3 | 7;
  regularPriceUsdMicros: number | null;
  discountBps: number;
  payableUsdMicros: number | null;
};

type Configuration = {
  salesEnabled: boolean;
  policySalesEnabled: boolean;
  treasuryConfigured: boolean;
  chainId: number;
  chainName: string;
  tokenAddress: Address;
  explorerUrl: string;
  treasury: Address;
  plans: Plan[];
  currency: "USDC";
  error?: string;
};

type ActiveSubscription = {
  entitlementId: string;
  startsAt: string;
  expiresAt: string;
  source: "admin" | "purchase";
  transactionHash: Hash | null;
  planYears: 1 | 3 | 7 | null;
  amountAtomic: string | null;
  chainId: number | null;
};

type Challenge = {
  challengeId: string;
  message: string;
  expiresAt: string;
  chainId: number;
  chainName: string;
  tokenAddress: Address;
  treasury: Address;
  amountAtomic: string;
  planYears: 1 | 3 | 7;
  error?: string;
};

const targetChainId = PAYMENT_NETWORK_ENV === "testnet" ? 51 : 50;

export default function ArchiveSubscriptionPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: targetChainId });
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [selectedYears, setSelectedYears] = useState<1 | 3 | 7>(1);
  const [status, setStatus] = useState("Loading archive plans…");
  const [busy, setBusy] = useState(false);
  const [paymentHash, setPaymentHash] = useState<Hash | null>(null);
  const [entitlementExpiry, setEntitlementExpiry] = useState<string | null>(null);
  const [activeSubscription, setActiveSubscription] = useState<ActiveSubscription | null>(null);
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/archive-subscriptions", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as Configuration;
        if (!response.ok) throw new Error(payload.error || "Archive plans are unavailable");
        if (active) {
          setConfiguration(payload);
          setStatus(payload.salesEnabled
            ? "Choose a plan. Renewals extend from the current expiry."
            : "Archive subscription checkout is not enabled yet.");
        }
      })
      .catch((cause) => {
        if (active) setStatus(cause instanceof Error ? cause.message : "Archive plans are unavailable");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setActiveSubscription(null);
    setSubscriptionChecked(false);
  }, [address]);

  const selectedPlan = useMemo(
    () => configuration?.plans.find((plan) => plan.years === selectedYears) || null,
    [configuration, selectedYears]
  );

  async function verifyCurrentSubscription() {
    if (!address || checkingSubscription) return;
    setCheckingSubscription(true);
    setSubscriptionChecked(false);
    try {
      const challengeResponse = await fetch("/api/archive-subscriptions/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address })
      });
      const challenge = await challengeResponse.json() as {
        challengeId?: string;
        message?: string;
        error?: string;
      };
      if (!challengeResponse.ok || !challenge.challengeId || !challenge.message) {
        throw new Error(challenge.error || "Archive access verification could not start");
      }

      const signature = await signMessageAsync({ message: challenge.message });
      const statusResponse = await fetch("/api/archive-subscriptions/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          signature
        })
      });
      const result = await statusResponse.json() as {
        entitlement?: ActiveSubscription | null;
        error?: string;
      };
      if (!statusResponse.ok) {
        throw new Error(result.error || "Archive access could not be verified");
      }
      setActiveSubscription(result.entitlement || null);
      setSubscriptionChecked(true);
      setStatus(result.entitlement
        ? "Current archive access verified."
        : "No active archive subscription was found for this wallet.");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Archive access could not be verified");
    } finally {
      setCheckingSubscription(false);
    }
  }

  async function purchase() {
    if (!address || !configuration || !selectedPlan || !publicClient) return;
    setBusy(true);
    setPaymentHash(null);
    setEntitlementExpiry(null);
    try {
      setStatus("Creating a short-lived checkout authorization…");
      const challengeResponse = await fetch("/api/archive-subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: address, planYears: selectedYears })
      });
      const challenge = await challengeResponse.json() as Challenge;
      if (!challengeResponse.ok) {
        throw new Error(challenge.error || "Unable to start archive checkout");
      }
      if (
        challenge.chainId !== configuration.chainId ||
        getAddress(challenge.tokenAddress) !== getAddress(configuration.tokenAddress) ||
        getAddress(challenge.treasury) !== getAddress(configuration.treasury)
      ) {
        throw new Error("Archive checkout does not match the displayed plan");
      }

      setStatus("Sign the gas-free checkout authorization in your wallet…");
      const signature = await signMessageAsync({ message: challenge.message });

      if (chainId !== configuration.chainId) {
        setStatus(`Switching to ${configuration.chainName}…`);
        await switchChainAsync({ chainId: configuration.chainId });
      }

      setStatus(`Confirm the ${formatUnits(BigInt(challenge.amountAtomic), 6)} USDC payment…`);
      const hash = await writeContractAsync({
        address: challenge.tokenAddress,
        abi: erc20Abi,
        functionName: "transfer",
        args: [challenge.treasury, BigInt(challenge.amountAtomic)],
        chainId: configuration.chainId
      });
      setPaymentHash(hash);
      setStatus("Waiting for the USDC payment to confirm…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("USDC payment transaction failed");

      setStatus("Verifying payment and activating archive access…");
      const activationResponse = await fetch("/api/archive-subscriptions", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          signature,
          transactionHash: hash
        })
      });
      const activation = await activationResponse.json() as {
        entitlement?: {
          entitlementId: string;
          startsAt: string;
          expiresAt: string;
          transactionHash: Hash;
        };
        error?: string;
      };
      if (!activationResponse.ok || !activation.entitlement) {
        throw new Error(activation.error || "Archive entitlement activation failed");
      }
      setEntitlementExpiry(activation.entitlement.expiresAt);
      setActiveSubscription({
        entitlementId: activation.entitlement.entitlementId,
        startsAt: activation.entitlement.startsAt,
        expiresAt: activation.entitlement.expiresAt,
        source: "purchase",
        transactionHash: activation.entitlement.transactionHash,
        planYears: selectedYears,
        amountAtomic: challenge.amountAtomic,
        chainId: configuration.chainId
      });
      setSubscriptionChecked(true);
      setStatus("Archive access activated successfully.");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Archive checkout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#0b7477]">
          XDCID archive
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          Cross-chain payment history
        </h1>
        <p className="mt-4 max-w-3xl text-lg text-slate-600">
          Purchase or renew access to your retained XDCID cross-chain records.
          Same-chain history remains outside this subscription.
        </p>

        <div className="mt-8 rounded-2xl border border-black/10 bg-slate-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Current archive access</h2>
              {activeSubscription ? (
                <div className="mt-3 space-y-1 text-sm text-slate-700">
                  <p>
                    <strong>Status:</strong> Active
                    {activeSubscription.planYears
                      ? ` · ${activeSubscription.planYears}-year plan`
                      : ""}
                  </p>
                  <p>
                    <strong>Active through:</strong>{" "}
                    {new Date(activeSubscription.expiresAt).toLocaleString()}
                  </p>
                  <p>
                    <strong>Source:</strong>{" "}
                    {activeSubscription.source === "purchase"
                      ? "Verified USDC purchase"
                      : "Administrative grant"}
                  </p>
                  {activeSubscription.transactionHash && configuration ? (
                    <a
                      className="block break-all text-[#0b7477] underline"
                      href={`${configuration.explorerUrl}/tx/${activeSubscription.transactionHash}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      View subscription payment
                    </a>
                  ) : null}
                </div>
              ) : subscriptionChecked ? (
                <p className="mt-3 text-sm text-slate-600">
                  No active archive subscription was found for this wallet.
                </p>
              ) : (
                <p className="mt-3 text-sm text-slate-600">
                  Verify the connected wallet to view its current plan and expiry.
                </p>
              )}
            </div>
            <button
              className="rounded-xl border border-[#0b7477] px-4 py-2 text-sm font-semibold text-[#0b7477] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!isConnected || checkingSubscription}
              onClick={verifyCurrentSubscription}
              type="button"
            >
              {!isConnected
                ? "Connect wallet to verify"
                : checkingSubscription
                  ? "Verifying…"
                  : activeSubscription
                    ? "Refresh access"
                    : "Verify current subscription"}
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            The verification signature is gasless, expires after five minutes, and cannot move funds.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {(configuration?.plans || []).map((plan) => {
            const selected = plan.years === selectedYears;
            return (
              <button
                key={plan.years}
                className={
                  "rounded-2xl border p-5 text-left transition " +
                  (selected
                    ? "border-[#0b7477] bg-[#effcf9] ring-2 ring-[#0b7477]/20"
                    : "border-black/10 bg-white hover:border-[#0b7477]/50")
                }
                onClick={() => setSelectedYears(plan.years)}
                type="button"
              >
                <span className="block text-xl font-semibold text-slate-950">
                  {plan.years} year{plan.years === 1 ? "" : "s"}
                </span>
                <span className="mt-2 block text-2xl font-semibold text-[#0b7477]">
                  {formatUsd(plan.payableUsdMicros)}
                </span>
                {plan.discountBps > 0 ? (
                  <span className="mt-1 block text-sm text-slate-600">
                    {formatBps(plan.discountBps)} discount
                  </span>
                ) : (
                  <span className="mt-1 block text-sm text-slate-600">Standard price</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-8 rounded-2xl border border-black/10 bg-slate-50 p-5">
          <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <p><strong>Payment network:</strong> {configuration?.chainName || "XDC"}</p>
            <p><strong>Payment asset:</strong> USDC</p>
            <p><strong>Renewal behavior:</strong> extends the current active expiry</p>
            <p><strong>Payment verification:</strong> server-verified on-chain</p>
          </div>
          <button
            className="mt-5 w-full rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white hover:bg-[#0b6670] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!configuration?.salesEnabled || !isConnected || busy}
            onClick={purchase}
            type="button"
          >
            {busy
              ? "Processing…"
              : isConnected
                ? `Purchase or renew ${selectedYears}-year access`
                : "Connect wallet to continue"}
          </button>
          <p className="mt-3 break-words text-sm text-slate-600">{status}</p>
          {paymentHash && configuration ? (
            <a
              className="mt-2 block break-all text-sm text-[#0b7477] underline"
              href={`${configuration.explorerUrl}/tx/${paymentHash}`}
              rel="noreferrer"
              target="_blank"
            >
              View USDC payment transaction
            </a>
          ) : null}
          {entitlementExpiry ? (
            <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
              Archive access is active through {new Date(entitlementExpiry).toLocaleString()}.
            </p>
          ) : null}
        </div>

        {!configuration?.salesEnabled && configuration ? (
          <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            {!configuration.policySalesEnabled
              ? "Subscription sales are switched off in the admin policy."
              : !configuration.treasuryConfigured
                ? "The server-side archive subscription treasury is not configured."
                : "Archive plan pricing is not configured."}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function formatUsd(value: number | null): string {
  if (value === null) return "Price not set";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 6
  }).format(value / 1_000_000);
}

function formatBps(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value / 100) + "%";
}
