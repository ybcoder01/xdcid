import { neon } from "@neondatabase/serverless";

const POLICY_ID = "payment-history";

export type ArchivePaymentCurrency = "USDC";

export type HistoryAccessPolicy = {
  freeHistoryMonths: number;
  maximumRetentionMonths: number;
  archiveAccessEnabled: boolean;
  subscriptionSalesEnabled: boolean;
  archiveGraceDays: number;
  archivePaymentCurrency: ArchivePaymentCurrency;
  oneYearPriceUsdMicros: number | null;
  threeYearDiscountBps: number;
  sevenYearDiscountBps: number;
  updatedAt: string;
  updatedBy: string | null;
};

export type ArchivePlanQuote = {
  years: 1 | 3 | 7;
  regularPriceUsdMicros: number | null;
  discountBps: number;
  payableUsdMicros: number | null;
};

export async function getHistoryAccessPolicy(): Promise<HistoryAccessPolicy> {
  const client = await ensurePolicySchema();
  const rows = await client`
    SELECT free_history_months, maximum_retention_months,
      archive_access_enabled, subscription_sales_enabled, archive_grace_days,
      archive_payment_currency, one_year_price_usd_micros,
      three_year_discount_bps, seven_year_discount_bps,
      updated_at, updated_by
    FROM history_access_policy
    WHERE id = ${POLICY_ID}
    LIMIT 1
  `;
  return policyFromRow(rows[0]);
}

export async function updateHistoryAccessPolicy(input: {
  freeHistoryMonths: number;
  maximumRetentionMonths: number;
  archiveAccessEnabled: boolean;
  subscriptionSalesEnabled: boolean;
  archiveGraceDays: number;
  archivePaymentCurrency: ArchivePaymentCurrency;
  oneYearPriceUsdMicros: number | null;
  threeYearDiscountBps: number;
  sevenYearDiscountBps: number;
  updatedBy: string;
}): Promise<HistoryAccessPolicy> {
  validatePolicy(input);
  const client = await ensurePolicySchema();
  const previous = await getHistoryAccessPolicy();
  const now = new Date().toISOString();
  const nextPolicy = {
    freeHistoryMonths: input.freeHistoryMonths,
    maximumRetentionMonths: input.maximumRetentionMonths,
    archiveAccessEnabled: input.archiveAccessEnabled,
    subscriptionSalesEnabled: input.subscriptionSalesEnabled,
    archiveGraceDays: input.archiveGraceDays,
    archivePaymentCurrency: input.archivePaymentCurrency,
    oneYearPriceUsdMicros: input.oneYearPriceUsdMicros,
    threeYearDiscountBps: input.threeYearDiscountBps,
    sevenYearDiscountBps: input.sevenYearDiscountBps
  };
  await client.transaction([
    client`
      UPDATE history_access_policy
      SET free_history_months = ${input.freeHistoryMonths},
        maximum_retention_months = ${input.maximumRetentionMonths},
        archive_access_enabled = ${input.archiveAccessEnabled},
        subscription_sales_enabled = ${input.subscriptionSalesEnabled},
        archive_grace_days = ${input.archiveGraceDays},
        archive_payment_currency = ${input.archivePaymentCurrency},
        one_year_price_usd_micros = ${input.oneYearPriceUsdMicros},
        three_year_discount_bps = ${input.threeYearDiscountBps},
        seven_year_discount_bps = ${input.sevenYearDiscountBps},
        updated_at = ${now},
        updated_by = ${input.updatedBy.toLowerCase()}
      WHERE id = ${POLICY_ID}
    `,
    client`
      INSERT INTO history_access_policy_audit (
        policy_id, changed_by, previous_policy, next_policy, changed_at
      ) VALUES (
        ${POLICY_ID},
        ${input.updatedBy.toLowerCase()},
        ${JSON.stringify(previous)}::jsonb,
        ${JSON.stringify(nextPolicy)}::jsonb,
        ${now}
      )
    `
  ]);
  return getHistoryAccessPolicy();
}

export function archivePlanQuotes(policy: Pick<
  HistoryAccessPolicy,
  "oneYearPriceUsdMicros" | "threeYearDiscountBps" | "sevenYearDiscountBps"
>): ArchivePlanQuote[] {
  return ([1, 3, 7] as const).map((years) => {
    const discountBps = years === 3
      ? policy.threeYearDiscountBps
      : years === 7
        ? policy.sevenYearDiscountBps
        : 0;
    const regularPriceUsdMicros = policy.oneYearPriceUsdMicros === null
      ? null
      : policy.oneYearPriceUsdMicros * years;
    const payableUsdMicros = regularPriceUsdMicros === null
      ? null
      : Math.ceil(regularPriceUsdMicros * (10_000 - discountBps) / 10_000);
    return { years, regularPriceUsdMicros, discountBps, payableUsdMicros };
  });
}

export function includedHistoryCutoff(policy: HistoryAccessPolicy, now = new Date()): Date {
  return subtractCalendarMonths(now, policy.freeHistoryMonths);
}

export function retainedHistoryCutoff(policy: HistoryAccessPolicy, now = new Date()): Date {
  return subtractCalendarMonths(now, policy.maximumRetentionMonths);
}

async function ensurePolicySchema() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("History policy storage is not configured");
  const client = neon(connectionString);
  await client`
    CREATE TABLE IF NOT EXISTS history_access_policy (
      id varchar(40) PRIMARY KEY,
      free_history_months integer NOT NULL DEFAULT 3,
      maximum_retention_months integer NOT NULL DEFAULT 84,
      archive_access_enabled boolean NOT NULL DEFAULT false,
      archive_grace_days integer NOT NULL DEFAULT 7,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by varchar(42),
      CHECK (free_history_months BETWEEN 1 AND 120),
      CHECK (maximum_retention_months BETWEEN 12 AND 120),
      CHECK (archive_grace_days BETWEEN 0 AND 90)
    )
  `;
  await client`ALTER TABLE history_access_policy ADD COLUMN IF NOT EXISTS subscription_sales_enabled boolean NOT NULL DEFAULT false`;
  await client`ALTER TABLE history_access_policy ADD COLUMN IF NOT EXISTS archive_payment_currency varchar(12) NOT NULL DEFAULT 'USDC'`;
  await client`ALTER TABLE history_access_policy ADD COLUMN IF NOT EXISTS one_year_price_usd_micros bigint`;
  await client`ALTER TABLE history_access_policy ADD COLUMN IF NOT EXISTS three_year_discount_bps integer NOT NULL DEFAULT 0`;
  await client`ALTER TABLE history_access_policy ADD COLUMN IF NOT EXISTS seven_year_discount_bps integer NOT NULL DEFAULT 0`;
  await client`
    CREATE TABLE IF NOT EXISTS history_access_policy_audit (
      id bigserial PRIMARY KEY,
      policy_id varchar(40) NOT NULL,
      changed_by varchar(42) NOT NULL,
      previous_policy jsonb NOT NULL,
      next_policy jsonb NOT NULL,
      changed_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await client`
    INSERT INTO history_access_policy (id)
    VALUES (${POLICY_ID})
    ON CONFLICT (id) DO NOTHING
  `;
  return client;
}

function policyFromRow(row: Record<string, unknown> | undefined): HistoryAccessPolicy {
  if (!row) throw new Error("History access policy is unavailable");
  return {
    freeHistoryMonths: Number(row.free_history_months),
    maximumRetentionMonths: Number(row.maximum_retention_months),
    archiveAccessEnabled: Boolean(row.archive_access_enabled),
    subscriptionSalesEnabled: Boolean(row.subscription_sales_enabled),
    archiveGraceDays: Number(row.archive_grace_days),
    archivePaymentCurrency: String(row.archive_payment_currency) as ArchivePaymentCurrency,
    oneYearPriceUsdMicros: row.one_year_price_usd_micros === null
      ? null
      : Number(row.one_year_price_usd_micros),
    threeYearDiscountBps: Number(row.three_year_discount_bps),
    sevenYearDiscountBps: Number(row.seven_year_discount_bps),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    updatedBy: row.updated_by ? String(row.updated_by) : null
  };
}

function validatePolicy(input: {
  freeHistoryMonths: number;
  maximumRetentionMonths: number;
  archiveGraceDays: number;
  archivePaymentCurrency: ArchivePaymentCurrency;
  oneYearPriceUsdMicros: number | null;
  threeYearDiscountBps: number;
  sevenYearDiscountBps: number;
  subscriptionSalesEnabled: boolean;
}) {
  if (!Number.isInteger(input.freeHistoryMonths) || input.freeHistoryMonths < 1 || input.freeHistoryMonths > 120) {
    throw new Error("Free history must be between 1 and 120 months");
  }
  if (!Number.isInteger(input.maximumRetentionMonths) || input.maximumRetentionMonths < 12 || input.maximumRetentionMonths > 120) {
    throw new Error("Maximum retention must be between 12 and 120 months");
  }
  if (input.maximumRetentionMonths < input.freeHistoryMonths) {
    throw new Error("Maximum retention cannot be shorter than free history");
  }
  if (!Number.isInteger(input.archiveGraceDays) || input.archiveGraceDays < 0 || input.archiveGraceDays > 90) {
    throw new Error("Archive grace must be between 0 and 90 days");
  }
  if (input.archivePaymentCurrency !== "USDC") {
    throw new Error("Only USDC archive pricing is supported initially");
  }
  if (
    input.oneYearPriceUsdMicros !== null &&
    (!Number.isSafeInteger(input.oneYearPriceUsdMicros) || input.oneYearPriceUsdMicros <= 0)
  ) {
    throw new Error("The one-year price must be a positive amount");
  }
  for (const [label, value] of [
    ["Three-year", input.threeYearDiscountBps],
    ["Seven-year", input.sevenYearDiscountBps]
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > 9_000) {
      throw new Error(`${label} discount must be between 0% and 90%`);
    }
  }
  if (input.sevenYearDiscountBps < input.threeYearDiscountBps) {
    throw new Error("Seven-year discount cannot be lower than the three-year discount");
  }
  if (input.subscriptionSalesEnabled && input.oneYearPriceUsdMicros === null) {
    throw new Error("Set a one-year price before enabling subscription sales");
  }
}

function subtractCalendarMonths(value: Date, months: number): Date {
  const result = new Date(value);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}
