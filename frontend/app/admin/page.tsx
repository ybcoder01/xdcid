"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { AdminArchiveAdministrator } from "../../components/AdminArchiveAdministrator";
import { AdminArchiveEntitlements } from "../../components/AdminArchiveEntitlements";
import { AdminArchiveRevenue } from "../../components/AdminArchiveRevenue";
import { AdminDomainRevenue } from "../../components/AdminDomainRevenue";
import { AdminDomainPricing } from "../../components/AdminDomainPricing";
import { AdminDomainDiscountGrants } from "../../components/AdminDomainDiscountGrants";
import { AdminHistoryAccessPolicy } from "../../components/AdminHistoryAccessPolicy";
import { AdminLegacyRegistrarRecovery } from "../../components/AdminLegacyRegistrarRecovery";
import { AdminOperations } from "../../components/AdminOperations";
import { AdminRevenueReport } from "../../components/AdminRevenueReport";
import { AdminRoleManagement } from "../../components/AdminRoleManagement";
import { AdminTreasuryDestinations } from "../../components/AdminTreasuryDestinations";

type AdminPermission =
  | "platform:manage"
  | "archive:manage"
  | "revenue:view"
  | "discount:issue";

const ADMIN_SESSION_CHANGED_EVENT = "xdcid:admin-session-changed";

type AdminSession = {
  authenticated: boolean;
  address?: string;
  expiresAt?: string;
  roles?: Array<"platform-owner" | "archive-administrator" | "treasury" | "discount-signer">;
  permissions?: AdminPermission[];
};

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({}));
}

export default function AdminPage() {
  const { address: account, isConnected } = useAccount();
  const [session, setSession] = useState<AdminSession>({
    authenticated: false,
  });
  const [sessionLoading, setSessionLoading] = useState(false);
  const [loginPending, setLoginPending] = useState(false);
  const [authError, setAuthError] = useState("");
  const signing = useSignMessage();
  const permissions = useMemo(
    () => new Set(session.permissions || []),
    [session.permissions],
  );
  const canManagePlatform = permissions.has("platform:manage");
  const canManageArchive = permissions.has("archive:manage");
  const canViewRevenue = permissions.has("revenue:view");
  const canIssueDiscounts = permissions.has("discount:issue");
  const isAuthenticated =
    session.authenticated &&
    !!session.address &&
    session.address.toLowerCase() === account?.toLowerCase();

  const checkSession = useCallback(async () => {
    if (!account) {
      setSession({ authenticated: false });
      return;
    }
    setSessionLoading(true);
    try {
      const response = await fetch("/api/admin/auth/session", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await responseJson(response)) as AdminSession;
      setSession(
        response.ok && data.authenticated
          ? data
          : { authenticated: false },
      );
    } catch {
      setSession({ authenticated: false });
    } finally {
      setSessionLoading(false);
    }
  }, [account]);

  useEffect(() => {
    setAuthError("");
    void checkSession();
  }, [account, checkSession]);

  async function authenticate(): Promise<boolean> {
    if (!account || loginPending) return false;
    setLoginPending(true);
    setAuthError("");

    try {
      const challengeResponse = await fetch("/api/admin/auth/challenge", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: account }),
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
            : "Unable to start admin login",
        );
      }

      const signature = await signing.signMessageAsync({
        message: challenge.message,
      });
      const verifyResponse = await fetch("/api/admin/auth/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          address: account,
          message: challenge.message,
          signature,
        }),
      });
      const verified = await responseJson(verifyResponse);
      if (!verifyResponse.ok || verified.authenticated !== true) {
        throw new Error(
          typeof verified.error === "string"
            ? verified.error
            : "Admin login failed",
        );
      }
      setSession(verified as AdminSession);
      window.dispatchEvent(new Event(ADMIN_SESSION_CHANGED_EVENT));
      return true;
    } catch (cause) {
      setAuthError(
        cause instanceof Error ? cause.message : "Admin login failed",
      );
      return false;
    } finally {
      setLoginPending(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => undefined);
    setSession({ authenticated: false });
    window.dispatchEvent(new Event(ADMIN_SESSION_CHANGED_EVENT));
  }

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <section className="rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
            Secure administration
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950 md:text-4xl">
            Verify an authorized wallet
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            Platform owners, the archive administrator, the configured treasury
            wallet, and the active domain-discount signer can sign in. Each role
            sees only its authorized controls.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ConnectButton
              accountStatus="address"
              chainStatus="icon"
              showBalance={false}
            />
            {isConnected ? (
              <button
                type="button"
                className="rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                disabled={sessionLoading || loginPending || signing.isPending}
                onClick={() => void authenticate()}
              >
                {sessionLoading
                  ? "Checking session…"
                  : loginPending || signing.isPending
                    ? "Confirm in wallet…"
                    : "Verify administrator wallet"}
              </button>
            ) : null}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            The signature creates a 15-minute session. It costs no gas and submits no transaction.
          </p>
          {authError ? (
            <p className="mt-4 break-words text-xs text-red-600">{authError}</p>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
            Authorized controls
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950 md:text-4xl">
            Admin dashboard
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            Your server-verified roles determine which operational and financial sections are available.
          </p>

          {canManagePlatform ? (
            <AdminLegacyRegistrarRecovery />
          ) : (
            <div className="mt-8 rounded-xl border border-teal-200 bg-teal-50 p-5 text-sm text-teal-950">
              This wallet has delegated access. Platform ownership controls remain hidden.
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ConnectButton
              accountStatus="address"
              chainStatus="icon"
              showBalance={false}
            />
            <button
              type="button"
              className="rounded-md border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-neutral-50"
              onClick={() => void logout()}
            >
              End admin session
            </button>
          </div>
        </div>

        <aside className="rounded-md border border-black/10 bg-slate-950 p-6 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">
            Server-verified access
          </p>
          <div className="mt-6 grid gap-4 text-sm">
            <div>
              <p className="text-slate-300">Connected wallet</p>
              <p className="mt-1 break-all">{account}</p>
            </div>
            <div className="border-t border-white/10 pt-4">
              <p className="text-slate-300">Roles</p>
              <ul className="mt-2 grid gap-1">
                {(session.roles || []).map((role) => (
                  <li key={role} className="capitalize">
                    {role.replaceAll("-", " ")}
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t border-white/10 pt-4">
              <p className="text-slate-300">Session</p>
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

      {canManagePlatform ? (
        <>
          <AdminRoleManagement />
          <AdminDomainPricing />
          <AdminHistoryAccessPolicy />
          <AdminArchiveAdministrator />
        </>
      ) : null}

      {canManageArchive ? <AdminArchiveEntitlements /> : null}

      {canIssueDiscounts ? (
        <AdminDomainDiscountGrants
          onReauthenticate={authenticate}
          reauthenticationPending={loginPending || signing.isPending}
        />
      ) : null}

      {canViewRevenue ? (
        <>
          <AdminTreasuryDestinations />
          <AdminDomainRevenue />
          <AdminArchiveRevenue />
          <section className="mt-8 rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
            <AdminRevenueReport />
          </section>
        </>
      ) : null}

      {canManagePlatform ? <AdminOperations /> : null}
    </main>
  );
}
