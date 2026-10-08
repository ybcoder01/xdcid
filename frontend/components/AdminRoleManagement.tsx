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
  activeRegistrarAddress,
  adminPricingPolicyAbi,
  adminPricingPolicyAddress,
  addresses,
  ownableAbi,
  ownable2StepAbi,
  unifiedDiscountAdminAbi,
  unifiedProtocolEnabled,
  zeroAddress as configuredZeroAddress,
} from "../config/contracts";

type PricingConfig = {
  twoCharacterAnnualUsdMicros: bigint;
  threeCharacterAnnualUsdMicros: bigint;
  fourCharacterAnnualUsdMicros: bigint;
  standardAnnualUsdMicros: bigint;
  subdomainAnnualUsdMicros: bigint;
  premiumSubdomainAnnualUsdMicros: bigint;
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
  const policyConfigured = adminPricingPolicyAddress !== configuredZeroAddress;
  const registryOwner = useReadContract({
    address: addresses.registry,
    abi: ownableAbi,
    functionName: "owner",
  });
  const registryPendingOwner = useReadContract({
    address: addresses.registry,
    abi: ownable2StepAbi,
    functionName: "pendingOwner",
    query: { enabled: unifiedProtocolEnabled },
  });
  const registrarOwner = useReadContract({
    address: activeRegistrarAddress,
    abi: ownable2StepAbi,
    functionName: "owner",
    query: { enabled: unifiedProtocolEnabled },
  });
  const registrarPendingOwner = useReadContract({
    address: activeRegistrarAddress,
    abi: ownable2StepAbi,
    functionName: "pendingOwner",
    query: { enabled: unifiedProtocolEnabled },
  });
  const discountSignerState = useReadContract({
    address: activeRegistrarAddress,
    abi: unifiedDiscountAdminAbi,
    functionName: "authorizationSigner",
    query: { enabled: unifiedProtocolEnabled },
  });
  const pendingDiscountSigner = useReadContract({
    address: activeRegistrarAddress,
    abi: unifiedDiscountAdminAbi,
    functionName: "pendingAuthorizationSigner",
    query: { enabled: unifiedProtocolEnabled },
  });
  const discountConfigurationPending = useReadContract({
    address: activeRegistrarAddress,
    abi: unifiedDiscountAdminAbi,
    functionName: "hasPendingConfiguration",
    query: { enabled: unifiedProtocolEnabled },
  });
  const discountActivationTime = useReadContract({
    address: activeRegistrarAddress,
    abi: unifiedDiscountAdminAbi,
    functionName: "pendingActivationTime",
    query: { enabled: unifiedProtocolEnabled },
  });
  const policyOwner = useReadContract({
    address: adminPricingPolicyAddress,
    abi: adminPricingPolicyAbi,
    functionName: "owner",
    query: { enabled: policyConfigured },
  });
  const config = useReadContract({
    address: adminPricingPolicyAddress,
    abi: adminPricingPolicyAbi,
    functionName: "config",
    query: { enabled: policyConfigured },
  });
  const version = useReadContract({
    address: adminPricingPolicyAddress,
    abi: adminPricingPolicyAbi,
    functionName: "version",
    query: { enabled: policyConfigured },
  });
  const pending = useReadContract({
    address: adminPricingPolicyAddress,
    abi: adminPricingPolicyAbi,
    functionName: "hasPendingConfig",
    query: { enabled: policyConfigured },
  });
  const activationTime = useReadContract({
    address: adminPricingPolicyAddress,
    abi: adminPricingPolicyAbi,
    functionName: "pendingActivationTime",
    query: { enabled: policyConfigured },
  });

  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: write.data });
  const [newRegistryOwner, setNewRegistryOwner] = useState("");
  const [confirmRegistryOwner, setConfirmRegistryOwner] = useState("");
  const [newRegistrarOwner, setNewRegistrarOwner] = useState("");
  const [confirmRegistrarOwner, setConfirmRegistrarOwner] = useState("");
  const [discountSigner, setDiscountSigner] = useState("");
  const [newPolicyOwner, setNewPolicyOwner] = useState("");
  const [confirmPolicyOwner, setConfirmPolicyOwner] = useState("");
  const [treasury, setTreasury] = useState("");
  const [quoteSigner, setQuoteSigner] = useState("");
  const [usdcToken, setUsdcToken] = useState("");
  const [xdcEnabled, setXdcEnabled] = useState(true);
  const [usdcEnabled, setUsdcEnabled] = useState(true);

  const current = config.data as unknown as PricingConfig | undefined;
  useEffect(() => {
    if (discountSignerState.data) {
      setDiscountSigner(discountSignerState.data);
    }
  }, [discountSignerState.data]);
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
    if (unifiedProtocolEnabled) {
      void registryPendingOwner.refetch();
      void registrarOwner.refetch();
      void registrarPendingOwner.refetch();
      void discountSignerState.refetch();
      void pendingDiscountSigner.refetch();
      void discountConfigurationPending.refetch();
      void discountActivationTime.refetch();
    }
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
  const isRegistrarOwner =
    !!account &&
    !!registrarOwner.data &&
    getAddress(account) === getAddress(registrarOwner.data);

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
  const discountActivationDate = useMemo(() => {
    if (!discountActivationTime.data || discountActivationTime.data === 0n) {
      return "";
    }
    return new Date(
      Number(discountActivationTime.data) * 1_000,
    ).toLocaleString();
  }, [discountActivationTime.data]);

  function proposeOperationalConfig() {
    if (!current || !policyFieldsValid || !isPolicyOwner) return;
    write.writeContract({
      address: adminPricingPolicyAddress,
      abi: adminPricingPolicyAbi,
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

  function transferOwnership(target: "registry" | "registrar" | "policy") {
    const isRegistry = target === "registry";
    const isRegistrar = target === "registrar";
    const next = isRegistry
      ? newRegistryOwner
      : isRegistrar
        ? newRegistrarOwner
        : newPolicyOwner;
    const confirmation = isRegistry
      ? confirmRegistryOwner
      : isRegistrar
        ? confirmRegistrarOwner
        : confirmPolicyOwner;
    if (
      !isAddress(next) ||
      next === zeroAddress ||
      confirmation.trim().toLowerCase() !== next.trim().toLowerCase()
    ) return;
    write.writeContract({
      address: isRegistry
        ? addresses.registry
        : isRegistrar
          ? activeRegistrarAddress
          : adminPricingPolicyAddress,
      abi: isRegistry || isRegistrar ? ownable2StepAbi : ownableAbi,
      functionName: "transferOwnership",
      args: [getAddress(next)],
    });
  }

  function acceptOwnership(target: "registry" | "registrar") {
    write.writeContract({
      address: target === "registry" ? addresses.registry : activeRegistrarAddress,
      abi: ownable2StepAbi,
      functionName: "acceptOwnership",
    });
  }

  function proposeDiscountSigner() {
    if (!isRegistrarOwner || !isAddress(discountSigner) || discountSigner === zeroAddress) {
      return;
    }
    write.writeContract({
      address: activeRegistrarAddress,
      abi: unifiedDiscountAdminAbi,
      functionName: "proposeConfiguration",
      args: [getAddress(discountSigner), activeRegistrarAddress],
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
          twoStep={unifiedProtocolEnabled}
          pendingOwner={registryPendingOwner.data}
          canAccept={
            !!account &&
            !!registryPendingOwner.data &&
            registryPendingOwner.data !== zeroAddress &&
            getAddress(account) === getAddress(registryPendingOwner.data)
          }
          onAccept={() => acceptOwnership("registry")}
          pending={write.isPending || receipt.isLoading}
        />
        {unifiedProtocolEnabled ? (
          <RoleCard
            title="Unified-registrar owner"
            value={registrarOwner.data}
            canManage={isRegistrarOwner}
            nextValue={newRegistrarOwner}
            confirmation={confirmRegistrarOwner}
            onNextValue={setNewRegistrarOwner}
            onConfirmation={setConfirmRegistrarOwner}
            onTransfer={() => transferOwnership("registrar")}
            twoStep
            pendingOwner={registrarPendingOwner.data}
            canAccept={
              !!account &&
              !!registrarPendingOwner.data &&
              registrarPendingOwner.data !== zeroAddress &&
              getAddress(account) === getAddress(registrarPendingOwner.data)
            }
            onAccept={() => acceptOwnership("registrar")}
            pending={write.isPending || receipt.isLoading}
          />
        ) : null}
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

      {unifiedProtocolEnabled ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-semibold text-slate-950">Discount authorization</h3>
          <p className="mt-1 text-sm text-slate-600">
            Rotate the wallet permitted to issue exact-name discount grants. The
            new signer becomes active only after the 48-hour delay.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <AddressField
              label="Authorization signer"
              value={discountSigner}
              onChange={setDiscountSigner}
            />
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-900">Pending signer</p>
              <p className="mt-1 break-all font-mono">
                {discountConfigurationPending.data
                  ? pendingDiscountSigner.data || "Loading…"
                  : "No pending rotation"}
              </p>
              {discountConfigurationPending.data ? (
                <p className="mt-2 text-amber-700">
                  Earliest activation: {discountActivationDate || "loading…"}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={
                !isRegistrarOwner ||
                !isAddress(discountSigner) ||
                discountSigner === zeroAddress ||
                Boolean(discountConfigurationPending.data) ||
                write.isPending
              }
              onClick={proposeDiscountSigner}
            >
              Propose signer rotation
            </button>
            <button
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
              disabled={
                !isRegistrarOwner ||
                !discountConfigurationPending.data ||
                write.isPending
              }
              onClick={() =>
                write.writeContract({
                  address: activeRegistrarAddress,
                  abi: unifiedDiscountAdminAbi,
                  functionName: "cancelPendingConfiguration",
                })
              }
            >
              Cancel signer rotation
            </button>
            <button
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
              disabled={
                !discountConfigurationPending.data ||
                !discountActivationTime.data ||
                BigInt(Math.floor(Date.now() / 1_000)) <
                  discountActivationTime.data ||
                write.isPending
              }
              onClick={() =>
                write.writeContract({
                  address: activeRegistrarAddress,
                  abi: unifiedDiscountAdminAbi,
                  functionName: "activatePendingConfiguration",
                })
              }
            >
              Activate signer rotation
            </button>
          </div>
        </div>
      ) : null}

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
                  address: adminPricingPolicyAddress,
                  abi: adminPricingPolicyAbi,
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
                  address: adminPricingPolicyAddress,
                  abi: adminPricingPolicyAbi,
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
  twoStep?: boolean;
  pendingOwner?: Address;
  canAccept?: boolean;
  onAccept?: () => void;
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
        {props.twoStep
          ? "The destination wallet must accept before ownership changes. Enter the address twice and verify it carefully."
          : "Ownership transfer is immediate. Enter the new address twice and verify it carefully."}
      </p>
      {props.twoStep && props.pendingOwner && props.pendingOwner !== zeroAddress ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-semibold">Pending owner</p>
          <p className="mt-1 break-all font-mono">{props.pendingOwner}</p>
          {props.canAccept && props.onAccept ? (
            <button
              className="mt-3 rounded-lg border border-amber-400 bg-white px-4 py-2 font-semibold disabled:opacity-50"
              disabled={props.pending}
              onClick={props.onAccept}
            >
              Accept ownership
            </button>
          ) : null}
        </div>
      ) : null}
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
