"use client";

import { useEffect, useMemo, useState } from "react";
import { getAddress, type Address } from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  addresses,
  pricingPolicyAbi,
  zeroAddress,
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

type FormState = {
  twoCharacter: string;
  threeCharacter: string;
  fourCharacter: string;
  standard: string;
  subdomain: string;
  premiumSubdomain: string;
  migration: string;
  threeYearDiscount: string;
  fiveYearDiscount: string;
  tenYearDiscount: string;
  xdcQuoteBuffer: string;
};

const emptyForm: FormState = {
  twoCharacter: "",
  threeCharacter: "",
  fourCharacter: "",
  standard: "",
  subdomain: "",
  premiumSubdomain: "",
  migration: "",
  threeYearDiscount: "",
  fiveYearDiscount: "",
  tenYearDiscount: "",
  xdcQuoteBuffer: "",
};

function microsToUsd(value: bigint) {
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function usdToMicros(value: string) {
  const normalized = value.trim();
  if (!/^\d+(\.\d{0,6})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const micros =
    BigInt(whole) * 1_000_000n +
    BigInt(fraction.padEnd(6, "0"));
  return micros > 0n ? micros : null;
}

function percentToBps(value: string) {
  const normalized = value.trim();
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(bps) ? bps : null;
}

export function AdminDomainPricing() {
  const { address: account } = useAccount();
  const policyConfigured = addresses.pricingPolicy !== zeroAddress;
  const config = useReadContract({
    address: addresses.pricingPolicy,
    abi: pricingPolicyAbi,
    functionName: "config",
    query: { enabled: policyConfigured },
  });
  const owner = useReadContract({
    address: addresses.pricingPolicy,
    abi: pricingPolicyAbi,
    functionName: "owner",
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
  const [form, setForm] = useState<FormState>(emptyForm);

  const current = config.data as unknown as PricingConfig | undefined;
  const isPolicyOwner =
    !!account &&
    !!owner.data &&
    getAddress(account) === getAddress(owner.data);

  useEffect(() => {
    if (!current) return;
    setForm({
      twoCharacter: microsToUsd(current.twoCharacterAnnualUsdMicros),
      threeCharacter: microsToUsd(current.threeCharacterAnnualUsdMicros),
      fourCharacter: microsToUsd(current.fourCharacterAnnualUsdMicros),
      standard: microsToUsd(current.standardAnnualUsdMicros),
      subdomain: microsToUsd(current.subdomainAnnualUsdMicros),
      premiumSubdomain: microsToUsd(current.premiumSubdomainAnnualUsdMicros),
      migration: microsToUsd(current.migrationUsdMicros),
      threeYearDiscount: (current.threeYearDiscountBps / 100).toString(),
      fiveYearDiscount: (current.fiveYearDiscountBps / 100).toString(),
      tenYearDiscount: (current.tenYearDiscountBps / 100).toString(),
      xdcQuoteBuffer: (current.xdcQuoteBufferBps / 100).toString(),
    });
  }, [current]);

  useEffect(() => {
    if (!receipt.isSuccess) return;
    void config.refetch();
    void version.refetch();
    void pending.refetch();
    void activationTime.refetch();
  }, [receipt.isSuccess]);

  const parsed = useMemo(() => {
    const prices = {
      twoCharacter: usdToMicros(form.twoCharacter),
      threeCharacter: usdToMicros(form.threeCharacter),
      fourCharacter: usdToMicros(form.fourCharacter),
      standard: usdToMicros(form.standard),
      subdomain: usdToMicros(form.subdomain),
      premiumSubdomain: usdToMicros(form.premiumSubdomain),
      migration: usdToMicros(form.migration),
    };
    const discounts = {
      threeYear: percentToBps(form.threeYearDiscount),
      fiveYear: percentToBps(form.fiveYearDiscount),
      tenYear: percentToBps(form.tenYearDiscount),
      buffer: percentToBps(form.xdcQuoteBuffer),
    };
    const validPrices = Object.values(prices).every((value) => value !== null);
    const validDiscounts =
      discounts.threeYear !== null &&
      discounts.fiveYear !== null &&
      discounts.tenYear !== null &&
      discounts.buffer !== null &&
      discounts.threeYear <= discounts.fiveYear &&
      discounts.fiveYear <= discounts.tenYear &&
      discounts.tenYear < 10_000 &&
      discounts.buffer <= 2_000;
    return { prices, discounts, valid: validPrices && validDiscounts };
  }, [form]);

  const activationDate = useMemo(() => {
    if (!activationTime.data || activationTime.data === 0n) return "";
    return new Date(Number(activationTime.data) * 1_000).toLocaleString();
  }, [activationTime.data]);

  function update(key: keyof FormState, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function proposePricing() {
    if (!current || !parsed.valid || !isPolicyOwner) return;
    const prices = parsed.prices;
    const discounts = parsed.discounts;
    write.writeContract({
      address: addresses.pricingPolicy,
      abi: pricingPolicyAbi,
      functionName: "proposeConfig",
      args: [{
        ...current,
        twoCharacterAnnualUsdMicros: prices.twoCharacter!,
        threeCharacterAnnualUsdMicros: prices.threeCharacter!,
        fourCharacterAnnualUsdMicros: prices.fourCharacter!,
        standardAnnualUsdMicros: prices.standard!,
        subdomainAnnualUsdMicros: prices.subdomain!,
        premiumSubdomainAnnualUsdMicros: prices.premiumSubdomain!,
        migrationUsdMicros: prices.migration!,
        threeYearDiscountBps: discounts.threeYear!,
        fiveYearDiscountBps: discounts.fiveYear!,
        tenYearDiscountBps: discounts.tenYear!,
        xdcQuoteBufferBps: discounts.buffer!,
      }],
    });
  }

  if (!policyConfigured) {
    return (
      <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-xl font-semibold text-amber-950">Domain pricing</h2>
        <p className="mt-2 text-sm text-amber-800">
          The pricing-policy contract is not configured for this environment.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Pricing policy
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">
            Domain registration pricing
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Prices are in USD. A proposal preserves operational addresses and payment settings,
            and becomes eligible for activation only after 48 hours.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          Policy version {version.data?.toString() || "—"}
        </span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MoneyField label="2-character / year" value={form.twoCharacter} onChange={(value) => update("twoCharacter", value)} />
        <MoneyField label="3-character / year" value={form.threeCharacter} onChange={(value) => update("threeCharacter", value)} />
        <MoneyField label="4-character / year" value={form.fourCharacter} onChange={(value) => update("fourCharacter", value)} />
        <MoneyField label="5+ character / year" value={form.standard} onChange={(value) => update("standard", value)} />
        <MoneyField label="Subdomain / year" value={form.subdomain} onChange={(value) => update("subdomain", value)} />
        <MoneyField label="Premium subdomain / year" value={form.premiumSubdomain} onChange={(value) => update("premiumSubdomain", value)} />
        <MoneyField label="Migration (one-time)" value={form.migration} onChange={(value) => update("migration", value)} />
      </div>

      <h3 className="mt-7 font-semibold text-slate-950">Term discounts and quote buffer</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PercentField label="3-year discount" value={form.threeYearDiscount} onChange={(value) => update("threeYearDiscount", value)} />
        <PercentField label="5-year discount" value={form.fiveYearDiscount} onChange={(value) => update("fiveYearDiscount", value)} />
        <PercentField label="10-year discount" value={form.tenYearDiscount} onChange={(value) => update("tenYearDiscount", value)} />
        <PercentField label="XDC quote buffer" value={form.xdcQuoteBuffer} onChange={(value) => update("xdcQuoteBuffer", value)} />
      </div>

      {!parsed.valid ? (
        <p className="mt-4 text-sm text-red-600">
          Enter positive prices. Discounts must increase from 3 to 5 to 10 years,
          remain below 100%, and the XDC buffer cannot exceed 20%.
        </p>
      ) : null}

      {pending.data ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          A policy update is already pending. Earliest activation: {activationDate || "loading…"}.
          Cancel or activate it in Ownership and payment configuration before proposing another.
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
          disabled={!isPolicyOwner || !current || !parsed.valid || Boolean(pending.data) || write.isPending || receipt.isLoading}
          onClick={proposePricing}
        >
          {write.isPending ? "Confirm in wallet…" : receipt.isLoading ? "Submitting…" : "Propose pricing update"}
        </button>
        {!isPolicyOwner ? (
          <p className="text-xs text-slate-500">Connect the pricing-policy owner wallet to edit pricing.</p>
        ) : null}
      </div>

      {write.data ? <p className="mt-4 break-all text-xs text-slate-500">Transaction: {write.data}</p> : null}
      {receipt.isSuccess ? <p className="mt-2 text-sm text-teal-700">Pricing proposal confirmed. The 48-hour delay has started.</p> : null}
      {write.error || receipt.error ? (
        <p className="mt-2 break-words text-xs text-red-600">{write.error?.message || receipt.error?.message}</p>
      ) : null}
    </section>
  );
}

function MoneyField(props: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-slate-900">
      {props.label}
      <div className="flex rounded-lg border border-slate-300 bg-white">
        <span className="px-3 py-2 text-slate-500">$</span>
        <input
          className="min-w-0 flex-1 rounded-r-lg px-1 py-2 font-normal outline-none"
          inputMode="decimal"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      </div>
    </label>
  );
}

function PercentField(props: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-slate-900">
      {props.label}
      <div className="flex rounded-lg border border-slate-300 bg-white">
        <input
          className="min-w-0 flex-1 rounded-l-lg px-3 py-2 font-normal outline-none"
          inputMode="decimal"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
        <span className="px-3 py-2 text-slate-500">%</span>
      </div>
    </label>
  );
}
