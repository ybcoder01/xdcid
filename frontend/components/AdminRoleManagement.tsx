"use client";

import { useEffect, useMemo, useState } from "react";
import { getAddress, isAddress, zeroAddress, type Address } from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  addresses,
  ownableAbi,
  pricingPolicyAbi,
  zeroAddress as configuredZeroAddress,
} from "../config/contracts";

type PricingConfig = {
  threeCharacterAnnualUsdMicros: bigint;
  fourCharacterAnnualUsdMicros: bigint;
  standardAnnualUsdMicros: bigint;
  subdomainAnnualUsdMicros: bigint;
  migrationUsdMicros: bigint;
  threeYearDiscountBps: number;
  fiveYearDiscountBps: number;
  tenYearDiscountBps: number;
  xdcQuoteBufferBps: number;
  quoteSigner: Address;
  usdcToken: Address;
  treasury: Address;
  xdcPaymentsEnabled: boolean;
  usdcPaymentsEnabled: boolean;
};

export function AdminRoleManagement() {
  const { address: account } = useAccount();
  const policyConfigured = addresses.pricingPolicy !== configuredZeroAddress;
  const registryOwner = useReadContract({
    address: addresses.registry,
    abi: ownableAbi,
    functionName: "owner",
  });
  const policyOwner = useReadContract({
    address: addresses.pricingPolicy,
    abi: pricingPolicyAbi,
    functionName: "owner",
    query: { enabled: policyConfigured },
  });
  const config = useReadContract({
    address: addresses.pricingPolicy,
    abi: pricingPolicyAbi,
    functionName: "config",
    query: { enabled: policyConfigured },
  });
  const version = useReadContract({
    address: addresses.pricingPolicy,
    abi: pricingPolicyAbi,
    functionName: "version",
    query: { enabled: policyConfigured },
  });
  const pending = useReadContract({
    address: addresses.pricingPolicy,
    abi: pricingPolicyAbi,
    functionName: "hasPendingConfig",
    query: { enabled: policyConfigured },
  });
  const activationTime = useReadContract({
    address: addresses.pricingPolicy,
    abi: pricingPolicyAbi,
    functionName: "pendingActivationTime",
    query: { enabled: policyConfigured },
  });

  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: write.data });
  const [newRegistryOwner, setNewRegistryOwner] = useState("");
  const [confirmRegistryOwner, setConfirmRegistryOwner] = useState("");
  const [newPolicyOwner, setNewPolicyOwner] = useState("");
  const [confirmPolicyOwner, setConfirmPolicyOwner] = useState("");
  const [treasury, setTreasury] = useState("");
  const [quoteSigner, setQuoteSigner] = useState("");
  const [usdcToken, setUsdcToken] = useState("");
  const [xdcEnabled, setXdcEnabled] = useState(true);
  const [usdcEnabled, setUsdcEnabled] = useState(true);

  const current = config.data as unknown as PricingConfig | undefined;
  useEffect(() => {
    if (!current) return;
    setTreasury(current.treasury);
    setQuoteSigner(current.quoteSigner);
    setUsdcToken(current.usdcToken);
    setXdcEnabled(current.xdcPaymentsEnabled);
    setUsdcEnabled(current.usdcPaymentsEnabled);
  }, [
    current?.treasury,
    current?.quoteSigner,
    current?.usdcToken,
    current?.xdcPaymentsEnabled,
    current?.usdcPaymentsEnabled,
  ]);

  useEffect(() => {
    if (!receipt.isSuccess) return;
    void registryOwner.refetch();
    void policyOwner.refetch();
    void config.refetch();
    void version.refetch();
    void pending.refetch();
    void activationTime.refetch();
  }, [receipt.isSuccess]);

  const isRegistryOwner =
    !!account &&
    !!registryOwner.data &&
    getAddress(account) === getAddress(registryOwner.data);
  const isPolicyOwner =
    !!account &&
    !!policyOwner.data &&
    getAddress(account) === getAddress(policyOwner.data);

  const policyFieldsValid =
    !!current &&
    isAddress(treasury) &&
    isAddress(quoteSigner) &&
    isAddress(usdcToken) &&
    treasury !== zeroAddress &&
    quoteSigner !== zeroAddress &&
    usdcToken !== zeroAddress;

  const pendingDate = useMemo(() => {
    if (!activationTime.data || activationTime.data === 0n) return "";
    return new Date(Number(activationTime.data) * 1_000).toLocaleString();
  }, [activationTime.data]);

  function proposeOperationalConfig() {
    if (!current || !policyFieldsValid || !isPolicyOwner) return;
    write.writeContract({
      address: addresses.pricingPolicy,
      abi: pricingPolicyAbi,
      functionName: "proposeConfig",
      args: [{
        ...current,
        quoteSigner: getAddress(quoteSigner),
        usdcToken: getAddress(usdcToken),
        treasury: getAddress(treasury),
        xdcPaymentsEnabled: xdcEnabled,
        usdcPaymentsEnabled: usdcEnabled,
      }],
    });
  }

  function transferOwnership(target: "registry" | "policy") {
    const isRegistry = target === "registry";
    const next = isRegistry ? newRegistryOwner : newPolicyOwner;
    const confirmation = isRegistry ? confirmRegistryOwner : confirmPolicyOwner;
    if (
      !isAddress(next) ||
      next === zeroAddress ||
      confirmation.trim().toLowerCase() !== next.trim().toLowerCase()
    ) return;
    write.writeContract({
      address: isRegistry ? addresses.registry : addresses.pricingPolicy,
      abi: ownableAbi,
      functionName: "transferOwnership",
      args: [getAddress(next)],
    });
  }

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
          Contract roles
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">
          Ownership and payment configuration
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          These controls submit wallet transactions directly to XDC Network.
          XDCID never asks for or stores a private key.
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <RoleCard
          title="Registry owner"
          value={registryOwner.data}
          canManage={isRegistryOwner}
          nextValue={newRegistryOwner}
          confirmation={confirmRegistryOwner}
          onNextValue={setNewRegistryOwner}
          onConfirmation={setConfirmRegistryOwner}
          onTransfer={() => transferOwnership("registry")}
          pending={write.isPending || receipt.isLoading}
        />
        {policyConfigured ? (
          <RoleCard
            title="Pricing-policy owner"
            value={policyOwner.data}
            canManage={isPolicyOwner}
            nextValue={newPolicyOwner}
            confirmation={confirmPolicyOwner}
            onNextValue={setNewPolicyOwner}
            onConfirmation={setConfirmPolicyOwner}
            onTransfer={() => transferOwnership("policy")}
            pending={write.isPending || receipt.isLoading}
          />
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="font-semibold text-amber-950">Pricing policy not configured</p>
            <p className="mt-2 text-sm text-amber-800">
              Add NEXT_PUBLIC_XNS_PRICING_POLICY after the mainnet deployment.
              No role transaction is available before that.
            </p>
          </div>
        )}
      </div>

      {policyConfigured && current ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-950">Operational roles</h3>
              <p className="mt-1 text-sm text-slate-600">
                Treasury, quote signer, USDC and payment switches change together
                after the policy’s 48-hour delay.
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              Policy version {version.data?.toString() || "—"}
            </span>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <AddressField label="Treasury wallet" value={treasury} onChange={setTreasury} />
            <AddressField label="Quote signer address" value={quoteSigner} onChange={setQuoteSigner} />
            <AddressField label="USDC contract" value={usdcToken} onChange={setUsdcToken} />
          </div>

          <div className="mt-4 flex flex-wrap gap-5 text-sm text-slate-800">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={xdcEnabled} onChange={(event) => setXdcEnabled(event.target.checked)} />
              Accept XDC
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={usdcEnabled} onChange={(event) => setUsdcEnabled(event.target.checked)} />
              Accept USDC
            </label>
          </div>

          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            Changing the quote signer authorizes only its public address on-chain.
            After activation, update the server-side Vercel signing secret separately.
            Never enter a private key in this page.
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={!isPolicyOwner || !policyFieldsValid || write.isPending || Boolean(pending.data)}
              onClick={proposeOperationalConfig}
            >
              Propose 48-hour update
            </button>
            <button
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
              disabled={!isPolicyOwner || !pending.data || write.isPending}
              onClick={() =>
                write.writeContract({
                  address: addresses.pricingPolicy,
                  abi: pricingPolicyAbi,
                  functionName: "cancelPendingConfig",
                })
              }
            >
              Cancel pending update
            </button>
            <button
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
              disabled={!pending.data || !activationTime.data || BigInt(Math.floor(Date.now() / 1_000)) < activationTime.data || write.isPending}
              onClick={() =>
                write.writeContract({
                  address: addresses.pricingPolicy,
                  abi: pricingPolicyAbi,
                  functionName: "activatePendingConfig",
                })
              }
            >
              Activate eligible update
            </button>
          </div>
          {pending.data ? (
            <p className="mt-3 text-xs text-amber-700">
              Update pending. Earliest activation: {pendingDate || "loading…"}
            </p>
          ) : null}
        </div>
      ) : null}

      {write.data ? (
        <p className="mt-4 break-all text-xs text-slate-500">
          Transaction: {write.data}
        </p>
      ) : null}
      {receipt.isSuccess ? (
        <p className="mt-2 text-xs text-teal-700">Transaction confirmed.</p>
      ) : null}
      {write.error || receipt.error ? (
        <p className="mt-2 break-words text-xs text-red-600">
          {write.error?.message || receipt.error?.message}
        </p>
      ) : null}
    </section>
  );
}

function AddressField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-slate-900">
      {props.label}
      <input
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-normal"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder="0x…"
      />
    </label>
  );
}

function RoleCard(props: {
  title: string;
  value?: Address;
  canManage: boolean;
  nextValue: string;
  confirmation: string;
  onNextValue: (value: string) => void;
  onConfirmation: (value: string) => void;
  onTransfer: () => void;
  pending: boolean;
}) {
  const valid =
    isAddress(props.nextValue) &&
    props.nextValue !== zeroAddress &&
    props.confirmation.trim().toLowerCase() ===
      props.nextValue.trim().toLowerCase();
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="font-semibold text-slate-950">{props.title}</p>
      <p className="mt-1 break-all font-mono text-xs text-slate-600">
        {props.value || "Loading…"}
      </p>
      <p className="mt-3 text-xs text-red-700">
        Ownership transfer is immediate. Enter the new address twice and verify it carefully.
      </p>
      <div className="mt-3 grid gap-2">
        <input
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs"
          value={props.nextValue}
          onChange={(event) => props.onNextValue(event.target.value)}
          placeholder="New owner address"
        />
        <input
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs"
          value={props.confirmation}
          onChange={(event) => props.onConfirmation(event.target.value)}
          placeholder="Repeat new owner address"
        />
        <button
          className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
          disabled={!props.canManage || !valid || props.pending}
          onClick={props.onTransfer}
        >
          Transfer ownership
        </button>
      </div>
    </div>
  );
}
