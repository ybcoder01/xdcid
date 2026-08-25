"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther, isAddress } from "viem";
import {
  useAccount,
  useBalance,
  useReadContract,
  useSignMessage,
  useWaitForTransactionReceipt,
  useWriteContract
} from "wagmi";
import { addresses, ownableAbi, registrarAbi, signedRegistrarEnabled, zeroAddress } from "../../config/contracts";
import { AdminOperations } from "../../components/AdminOperations";
import { AdminRoleManagement } from "../../components/AdminRoleManagement";
import { AdminHistoryAccessPolicy } from "../../components/AdminHistoryAccessPolicy";

type AdminSession = {
  authenticated: boolean;
  address?: string;
  expiresAt?: string;
};

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({}));
}

export default function AdminPage() {
  const { address: account, isConnected } = useAccount();
  const [recipient, setRecipient] = useState("");
  const [session, setSession] = useState<AdminSession>({ authenticated: false });
  const [sessionLoading, setSessionLoading] = useState(false);
  const [loginPending, setLoginPending] = useState(false);
  const [authError, setAuthError] = useState("");
  const signing = useSignMessage();

  const owner = useReadContract({
    address: addresses.registry,
    abi: ownableAbi,
    functionName: "owner"
  });
  const policyOwner = useReadContract({
    address: addresses.pricingPolicy,
    abi: ownableAbi,
    functionName: "owner",
    query: { enabled: addresses.pricingPolicy !== zeroAddress }
  });
  const balance = useBalance({ address: addresses.registrar });
  const refetchBalance = balance.refetch;
  const withdrawal = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: withdrawal.data });

  const ownerAddress = owner.data || "";
  const contractBalance = balance.data?.value;
  const isOwner = useMemo(
    () =>
      !!account &&
      [ownerAddress, policyOwner.data || ""]
        .filter(Boolean)
        .some((candidate) => candidate.toLowerCase() === account.toLowerCase()),
    [account, ownerAddress, policyOwner.data]
  );
  const isRegistryOwner =
    !!account && !!ownerAddress && ownerAddress.toLowerCase() === account.toLowerCase();
  const isAuthenticated =
    isOwner &&
    session.authenticated &&
    !!session.address &&
    session.address.toLowerCase() === account?.toLowerCase();
  const canWithdraw =
    isAuthenticated &&
    isRegistryOwner &&
    !signedRegistrarEnabled &&
    isAddress(recipient) &&
    !!contractBalance &&
    contractBalance > 0n &&
    !withdrawal.isPending &&
    !receipt.isLoading;
  const loading = owner.isLoading || policyOwner.isLoading || balance.isLoading;
  const error =
    owner.error?.message ||
    balance.error?.message ||
    withdrawal.error?.message ||
    receipt.error?.message ||
    "";

  const checkSession = useCallback(async () => {
    if (!isOwner || !account) {
      setSession({ authenticated: false });
      return;
    }
    setSessionLoading(true);
    try {
      const response = await fetch("/api/admin/auth/session", {
        cache: "no-store",
        credentials: "same-origin"
      });
      const data = (await responseJson(response)) as AdminSession;
      setSession(
        response.ok && data.authenticated
          ? data
          : { authenticated: false }
      );
    } catch {
      setSession({ authenticated: false });
    } finally {
      setSessionLoading(false);
    }
  }, [account, isOwner]);

  useEffect(() => {
    setRecipient(account || "");
    setAuthError("");
    void checkSession();
  }, [account, checkSession]);

  useEffect(() => {
    if (receipt.isSuccess) void refetchBalance();
  }, [receipt.isSuccess, refetchBalance]);

  async function authenticate() {
    if (!account || !isOwner || loginPending) return;
    setLoginPending(true);
    setAuthError("");

    try {
      const challengeResponse = await fetch("/api/admin/auth/challenge", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: account })
      });
      const challenge = await responseJson(challengeResponse);
      if (
        !challengeResponse.ok ||
        typeof challenge.challengeId !== "string" ||
        typeof challenge.message !== "string"
      ) {
        throw new Error(
          typeof challenge.error === "string"
            ? challenge.error
            : "Unable to start admin login"
        );
      }

      const signature = await signing.signMessageAsync({
        message: challenge.message
      });
      const verifyResponse = await fetch("/api/admin/auth/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          address: account,
          message: challenge.message,
          signature
        })
      });
      const verified = await responseJson(verifyResponse);
      if (!verifyResponse.ok || verified.authenticated !== true) {
        throw new Error(
          typeof verified.error === "string"
            ? verified.error
            : "Admin login failed"
        );
      }
      setSession(verified as AdminSession);
    } catch (cause) {
      setSession({ authenticated: false });
      setAuthError(cause instanceof Error ? cause.message : "Admin login failed");
    } finally {
      setLoginPending(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/auth/logout", {
      method: "POST",
      credentials: "same-origin"
    }).catch(() => undefined);
    setSession({ authenticated: false });
  }

  function withdraw() {
    if (!canWithdraw) return;

    withdrawal.writeContract({
      address: addresses.registrar,
      abi: registrarAbi,
      functionName: "withdraw",
      args: [recipient as `0x${string}`]
    });
  }

  if (!isOwner) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <section className="rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Owner only</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950 md:text-4xl">Owner access required</h1>
          <p className="mt-2 text-sm text-neutral-600">
            {!isConnected
              ? "Connect the registry or pricing-policy owner wallet to continue."
              : loading
                ? "Checking registrar ownership..."
                : "The connected wallet is not an authorized contract owner."}
          </p>

          <div className="mt-8">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
          </div>

          {isConnected &&
          account &&
          ownerAddress &&
          account.toLowerCase() !== ownerAddress.toLowerCase() ? (
            <p className="mt-4 text-xs text-red-600">Connected wallet is not a registry or pricing-policy owner.</p>
          ) : null}
          {error ? <p className="mt-4 break-words text-xs text-red-600">{error}</p> : null}
        </section>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <section className="rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Secure admin login</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950 md:text-4xl">Verify the owner wallet</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Sign a short login message to open a 15-minute admin session. This does not submit a transaction or cost gas.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
            <button
              className="rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              disabled={sessionLoading || loginPending || signing.isPending}
              onClick={authenticate}
            >
              {sessionLoading
                ? "Checking session..."
                : loginPending || signing.isPending
                  ? "Confirm in wallet..."
                  : "Verify owner wallet"}
            </button>
          </div>
          {authError ? <p className="mt-4 break-words text-xs text-red-600">{authError}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Owner controls</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950 md:text-4xl">Admin dashboard</h1>
          <p className="mt-2 text-sm text-neutral-600">Monitor system health and payment routes, and manage registrar revenue with the owner wallet.</p>

          <div className="mt-8 grid gap-4">
            <div className="rounded-md border border-black/10 bg-neutral-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Registrar balance</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">
                {contractBalance !== undefined
                  ? `${formatEther(contractBalance)} XDC`
                  : loading
                    ? "Loading..."
                    : "Unavailable"}
              </p>
              <p className="mt-2 break-all text-xs text-neutral-500">{addresses.registrar}</p>
            </div>

            <label className="grid gap-2 text-sm">
              <span className="font-semibold text-slate-950">Withdraw to</span>
              <input
                className="rounded-md border border-black/10 bg-white px-3 py-3"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="0x recipient address"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
              <button
                className="rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                disabled={!canWithdraw}
                onClick={withdraw}
              >
                {withdrawal.isPending
                  ? "Confirm in wallet..."
                  : receipt.isLoading
                    ? "Withdrawing..."
                    : "Withdraw all funds"}
              </button>
              <button
                className="rounded-md border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-neutral-50"
                onClick={logout}
              >
                End admin session
              </button>
            </div>

            {withdrawal.data ? (
              <p className="break-all text-xs text-neutral-500">Transaction sent: {withdrawal.data}</p>
            ) : null}
            {receipt.isSuccess ? <p className="text-xs text-teal-700">Withdrawal confirmed.</p> : null}
            {error ? <p className="break-words text-xs text-red-600">{error}</p> : null}
          </div>
        </div>

        <aside className="rounded-md border border-black/10 bg-slate-950 p-6 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">Access check</p>
          <div className="mt-6 grid gap-4 text-sm">
            <div>
              <p className="text-slate-300">Connected wallet</p>
              <p className="mt-1 break-all">{account || "Not connected"}</p>
            </div>
            <div className="border-t border-white/10 pt-4">
              <p className="text-slate-300">Registry owner</p>
              <p className="mt-1 break-all">{ownerAddress || (loading ? "Loading..." : "Unavailable")}</p>
            </div>
            <div className="border-t border-white/10 pt-4">
              <p className="text-slate-300">Server session</p>
              <p className="mt-1">Verified</p>
              {session.expiresAt ? (
                <p className="mt-1 text-xs text-slate-400">
                  Expires {new Date(session.expiresAt).toLocaleTimeString()}
                </p>
              ) : null}
            </div>
          </div>
        </aside>
      </section>

      <AdminRoleManagement />

      <AdminHistoryAccessPolicy />

      <AdminOperations />
    </main>
  );
}
