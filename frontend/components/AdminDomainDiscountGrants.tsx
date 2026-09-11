"use client";

import { useCallback, useEffect, useState } from "react";
import { isAddress, type Address, type Hex } from "viem";
import { useAccount, useSignTypedData } from "wagmi";
import {
  buildDomainDiscountAuthorization,
  domainDiscountTypedData,
  serializeDomainDiscountAuthorization,
  type SerializedDomainDiscountAuthorization,
} from "../lib/domainDiscounts";
import {
  BETA_REGISTRATION_CAMPAIGN,
  BETA_REGISTRATION_LIMIT,
} from "../lib/betaRegistration";

type DiscountContext = {
  chainId: number;
  registrar: Address;
  authorizationContract: Address;
  authorizationSigner: Address;
};

type Grant = {
  id: string;
  name: string;
  authorizationHash: Hex;
  authorization: SerializedDomainDiscountAuthorization;
  createdAt: string;
  campaign?: string;
};

type BetaStatus = {
  campaign: string;
  issued: number;
  limit: number;
  remaining: number;
};

type GrantsResponse = {
  context?: DiscountContext;
  grants?: Grant[];
  beta?: BetaStatus;
  error?: string;
};

type AdminDomainDiscountGrantsProps = {
  onReauthenticate: () => Promise<boolean>;
  reauthenticationPending: boolean;
};

type AdminSessionResponse = {
  authenticated?: boolean;
  address?: string;
  permissions?: string[];
};

export function AdminDomainDiscountGrants({
  onReauthenticate,
  reauthenticationPending,
}: AdminDomainDiscountGrantsProps) {
  const { address } = useAccount();
  const signing = useSignTypedData();
  const [context, setContext] = useState<DiscountContext>();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [betaStatus, setBetaStatus] = useState<BetaStatus>();
  const [grantType, setGrantType] = useState<"beta" | "custom">("beta");
  const [beneficiary, setBeneficiary] = useState("");
  const [name, setName] = useState("");
  const [termYears, setTermYears] = useState(1);
  const [discountPercent, setDiscountPercent] = useState(100);
  const [maxUses, setMaxUses] = useState(1);
  const [validDays, setValidDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [reauthenticationRequired, setReauthenticationRequired] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const requireReauthentication = useCallback(() => {
    setReauthenticationRequired(true);
    setStatus("");
    setError("");
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/domain-discounts", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = (await response.json()) as GrantsResponse;
      if (!response.ok || !body.context) {
        if (response.status === 401 || response.status === 403) {
          requireReauthentication();
          return;
        }
        throw new Error(body.error || "Discount grants could not be loaded");
      }
      setReauthenticationRequired(false);
      setContext(body.context);
      setGrants(body.grants || []);
      setBetaStatus(body.beta);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Discount grants could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [requireReauthentication]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function issueGrant() {
    if (!context || !address || signing.isPending || reauthenticationRequired) return;
    setError("");
    setStatus("");
    try {
      if (address.toLowerCase() !== context.authorizationSigner.toLowerCase()) {
        throw new Error("Connect the configured discount-signer wallet");
      }
      if (!isAddress(beneficiary)) {
        throw new Error("Enter a valid beneficiary wallet address");
      }
      if (!(await hasActiveDiscountSignerSession(address))) {
        requireReauthentication();
        return;
      }
      const now = Math.floor(Date.now() / 1_000);
      const built = buildDomainDiscountAuthorization({
        name,
        beneficiary,
        product: 0,
        termYears: grantType === "beta" ? 1 : termYears,
        discountBps: grantType === "beta"
          ? 10_000
          : Math.round(discountPercent * 100),
        maxUses: grantType === "beta" ? 1 : maxUses,
        validAfter: now - 30,
        deadline: now + validDays * 24 * 60 * 60,
        nonce: randomNonce(),
      });
      if (grantType === "beta" && !/^[a-z]{5}\.xdc$/.test(built.name)) {
        throw new Error("Beta grants are limited to five-letter .xdc names");
      }
      setStatus("Confirm the exact discount grant in your wallet…");
      const signature = await signing.signTypedDataAsync(
        domainDiscountTypedData({
          chainId: context.chainId,
          authorizationContract: context.authorizationContract,
          authorization: built.authorization,
        }),
      );
      setStatus("Saving the signed grant…");
      const response = await fetch("/api/admin/domain-discounts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: built.name,
          authorization: serializeDomainDiscountAuthorization(built.authorization),
          signature,
          campaign: grantType === "beta"
            ? BETA_REGISTRATION_CAMPAIGN
            : undefined,
        }),
      });
      const body = (await response.json()) as { grant?: Grant; error?: string };
      if (!response.ok || !body.grant) {
        if (response.status === 401 || response.status === 403) {
          requireReauthentication();
          return;
        }
        throw new Error(body.error || "Discount grant could not be saved");
      }
      setGrants((current) => [body.grant as Grant, ...current.filter((grant) => grant.id !== body.grant?.id)]);
      setStatus(
        grantType === "beta"
          ? `${built.name} is approved as a gas-only five-letter beta registration.`
          : discountPercent === 100
          ? `${built.name} can now be registered by the beneficiary for gas only.`
          : `${built.name} now has a ${discountPercent.toFixed(2)}% beneficiary discount.`,
      );
      setName("");
      await refresh();
    } catch (cause) {
      setStatus("");
      setError(cause instanceof Error ? cause.message : "Discount grant failed");
    }
  }

  async function reauthenticate() {
    setError("");
    const authenticated = await onReauthenticate();
    if (!authenticated) {
      setError("Discount-signer re-verification did not complete");
      return;
    }
    setReauthenticationRequired(false);
    setStatus("Discount-signer session renewed. You can now issue the grant.");
    await refresh();
  }

  return (
    <section className="mt-8 rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
        Discount authorization
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-slate-950">
        Domain purchase grants
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        Authorize one exact wallet, name and registration term. A 100% discount
        means the beneficiary pays only network gas. This signature submits no
        transaction and cannot be reused for another name or wallet.
      </p>

      <div className="mt-5 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950">
        <p className="font-semibold">Five-letter launch beta</p>
        <p className="mt-1">
          {betaStatus
            ? `${betaStatus.issued} of ${betaStatus.limit} wallet places issued · ${betaStatus.remaining} remaining`
            : `Up to ${BETA_REGISTRATION_LIMIT} wallets · one five-letter name · one year · 100% discount`}
        </p>
      </div>

      {context ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          <p>Network: chain ID {context.chainId}</p>
          <p className="mt-1 break-all">Authorization contract: {context.authorizationContract}</p>
          <p className="mt-1 break-all">Discount signer: {context.authorizationSigner}</p>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm md:col-span-2">
          <span className="font-semibold text-slate-950">Grant type</span>
          <select
            className="rounded-md border border-black/10 bg-white px-3 py-3"
            value={grantType}
            onChange={(event) => setGrantType(event.target.value as "beta" | "custom")}
          >
            <option value="beta">Five-letter launch beta</option>
            <option value="custom">Custom discount grant</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm md:col-span-2">
          <span className="font-semibold text-slate-950">Beneficiary wallet</span>
          <input
            className="rounded-md border border-black/10 bg-white px-3 py-3 font-mono"
            value={beneficiary}
            onChange={(event) => setBeneficiary(event.target.value)}
            placeholder="0x wallet allowed to register"
          />
        </label>
        <label className="grid gap-2 text-sm md:col-span-2">
          <span className="font-semibold text-slate-950">Exact domain name</span>
          <input
            className="rounded-md border border-black/10 bg-white px-3 py-3"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="example.xdc"
          />
        </label>
        <SelectField label="Registration term" value={grantType === "beta" ? 1 : termYears} onChange={setTermYears}
          disabled={grantType === "beta"}
          options={[{ value: 1, label: "1 year" }, { value: 3, label: "3 years" }, { value: 5, label: "5 years" }, { value: 10, label: "10 years" }]} />
        <NumberField label="Discount (%)" value={grantType === "beta" ? 100 : discountPercent} min={0.01} max={100} step={0.01} onChange={setDiscountPercent} disabled={grantType === "beta"} />
        <NumberField label="Maximum uses" value={grantType === "beta" ? 1 : maxUses} min={1} max={10} step={1} onChange={setMaxUses} disabled={grantType === "beta"} />
        <NumberField label="Expires after (days)" value={validDays} min={1} max={31} step={1} onChange={setValidDays} />
      </div>

      {reauthenticationRequired ? (
        <div
          className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
          role="status"
        >
          <p className="font-semibold">Your discount-signer session has expired.</p>
          <p className="mt-1">Re-verify this wallet to continue. Your grant details will remain in the form.</p>
          <button
            type="button"
            className="mt-3 rounded-md bg-slate-950 px-5 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            disabled={reauthenticationPending}
            onClick={() => void reauthenticate()}
          >
            {reauthenticationPending ? "Confirm in wallet…" : "Re-verify discount signer"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="mt-5 rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          disabled={loading || !context || signing.isPending}
          onClick={() => void issueGrant()}
        >
          {signing.isPending ? "Confirm in wallet…" : "Sign and issue grant"}
        </button>
      )}
      {status ? <p className="mt-4 text-sm text-teal-700">{status}</p> : null}
      {error ? <p className="mt-4 break-words text-sm text-red-600">{error}</p> : null}

      <div className="mt-8 border-t border-slate-200 pt-6">
        <div className="flex items-center justify-between gap-4">
          <h3 className="font-semibold text-slate-950">Recent grants</h3>
          <button type="button" className="text-sm font-semibold text-teal-700" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
        {grants.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr><th className="pb-2">Name</th><th className="pb-2">Beneficiary</th><th className="pb-2">Type</th><th className="pb-2">Discount</th><th className="pb-2">Term</th><th className="pb-2">Uses</th><th className="pb-2">Expires</th></tr>
              </thead>
              <tbody>
                {grants.map((grant) => (
                  <tr key={grant.id} className="border-t border-slate-100">
                    <td className="py-3 font-medium">{grant.name}</td>
                    <td className="py-3 font-mono text-xs">{shortAddress(grant.authorization.beneficiary)}</td>
                    <td className="py-3">{grant.campaign === BETA_REGISTRATION_CAMPAIGN ? "Beta" : "Custom"}</td>
                    <td className="py-3">{(grant.authorization.discountBps / 100).toFixed(2)}%</td>
                    <td className="py-3">{grant.authorization.termYears} year(s)</td>
                    <td className="py-3">Up to {grant.authorization.maxUses}</td>
                    <td className="py-3">{new Date(Number(grant.authorization.deadline) * 1_000).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !loading ? (
          <p className="mt-4 text-sm text-slate-500">No grants have been issued for this environment.</p>
        ) : null}
      </div>
    </section>
  );
}

async function hasActiveDiscountSignerSession(address: Address): Promise<boolean> {
  const response = await fetch("/api/admin/auth/session", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (response.status === 401 || response.status === 403) return false;
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "Discount-signer session could not be checked");
  }
  const session = (await response.json().catch(() => ({}))) as AdminSessionResponse;
  return session.authenticated === true
    && session.address?.toLowerCase() === address.toLowerCase()
    && session.permissions?.includes("discount:issue") === true;
}

function NumberField(props: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; disabled?: boolean }) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-semibold text-slate-950">{props.label}</span>
      <input type="number" className="rounded-md border border-black/10 bg-white px-3 py-3" value={props.value}
        min={props.min} max={props.max} step={props.step} disabled={props.disabled}
        onChange={(event) => props.onChange(Number(event.target.value))} />
    </label>
  );
}

function SelectField(props: { label: string; value: number; options: Array<{ value: number; label: string }>; onChange: (value: number) => void; disabled?: boolean }) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-semibold text-slate-950">{props.label}</span>
      <select className="rounded-md border border-black/10 bg-white px-3 py-3 disabled:bg-slate-100" value={props.value} disabled={props.disabled}
        onChange={(event) => props.onChange(Number(event.target.value))}>
        {props.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function randomNonce(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return BigInt(`0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`);
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
