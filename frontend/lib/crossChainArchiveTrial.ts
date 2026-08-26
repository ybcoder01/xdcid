import { neon } from "@neondatabase/serverless";

export type CrossChainTrial = {
  startedAt: Date;
  endsAt: Date;
};

export type CrossChainArchiveAccess = {
  mode: "enforcement_disabled" | "trial_not_started" | "trial" | "subscription" | "subscription_required";
  crossChainHistoryAllowed: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
};

export function evaluateCrossChainArchiveAccess(input: {
  paywallEnabled: boolean;
  trial: CrossChainTrial | null;
  hasEntitlement: boolean;
  now?: Date;
}): CrossChainArchiveAccess {
  const trialStartedAt = input.trial?.startedAt.toISOString() ?? null;
  const trialEndsAt = input.trial?.endsAt.toISOString() ?? null;
  if (!input.paywallEnabled) {
    return {
      mode: "enforcement_disabled",
      crossChainHistoryAllowed: true,
      trialStartedAt,
      trialEndsAt
    };
  }
  if (input.hasEntitlement) {
    return {
      mode: "subscription",
      crossChainHistoryAllowed: true,
      trialStartedAt,
      trialEndsAt
    };
  }
  if (!input.trial) {
    return {
      mode: "trial_not_started",
      crossChainHistoryAllowed: true,
      trialStartedAt: null,
      trialEndsAt: null
    };
  }
  if (input.trial.endsAt >= (input.now || new Date())) {
    return {
      mode: "trial",
      crossChainHistoryAllowed: true,
      trialStartedAt,
      trialEndsAt
    };
  }
  return {
    mode: "subscription_required",
    crossChainHistoryAllowed: false,
    trialStartedAt,
    trialEndsAt
  };
}

export async function recordCrossChainTrialStart(input: {
  walletFingerprint: string;
  completedAt: Date;
  trialMonths: number;
}): Promise<CrossChainTrial> {
  const client = await ensureSchema();
  const endsAt = addCalendarMonths(input.completedAt, input.trialMonths);
  const rows = await client`
    INSERT INTO history_cross_chain_trials (
      wallet_fingerprint, started_at, ends_at
    ) VALUES (
      ${input.walletFingerprint}, ${input.completedAt.toISOString()}, ${endsAt.toISOString()}
    )
    ON CONFLICT (wallet_fingerprint) DO UPDATE
    SET started_at = LEAST(history_cross_chain_trials.started_at, EXCLUDED.started_at),
      ends_at = CASE
        WHEN EXCLUDED.started_at < history_cross_chain_trials.started_at
          THEN EXCLUDED.ends_at
        ELSE history_cross_chain_trials.ends_at
      END,
      updated_at = now()
    RETURNING started_at, ends_at
  `;
  return fromRow(rows[0]);
}

export async function getOrCreateCrossChainTrial(input: {
  walletFingerprint: string;
  trialMonths: number;
}): Promise<CrossChainTrial | null> {
  const client = await ensureSchema();
  const existing = await client`
    SELECT started_at, ends_at
    FROM history_cross_chain_trials
    WHERE wallet_fingerprint = ${input.walletFingerprint}
    LIMIT 1
  `;
  if (existing[0]) return fromRow(existing[0]);

  const earliest = await client`
    SELECT MIN(payment.completed_at) AS started_at
    FROM payment_records payment
    INNER JOIN payment_participant_access access
      ON access.payment_record_id = payment.id
    WHERE access.participant_fingerprint = ${input.walletFingerprint}
      AND access.access_revoked_at IS NULL
      AND payment.source_chain_id <> payment.destination_chain_id
  `;
  if (!earliest[0]?.started_at) return null;
  return recordCrossChainTrialStart({
    walletFingerprint: input.walletFingerprint,
    completedAt: new Date(String(earliest[0].started_at)),
    trialMonths: input.trialMonths
  });
}

async function ensureSchema() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Cross-chain trial storage is not configured");
  const client = neon(connectionString);
  await client`
    CREATE TABLE IF NOT EXISTS history_cross_chain_trials (
      wallet_fingerprint varchar(64) PRIMARY KEY,
      started_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK (ends_at > started_at)
    )
  `;
  await client`
    CREATE INDEX IF NOT EXISTS history_cross_chain_trials_ends_at_idx
    ON history_cross_chain_trials (ends_at)
  `;
  return client;
}

function fromRow(row: Record<string, unknown>): CrossChainTrial {
  return {
    startedAt: new Date(String(row.started_at)),
    endsAt: new Date(String(row.ends_at))
  };
}

function addCalendarMonths(value: Date, months: number): Date {
  const result = new Date(value);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    0
  )).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}
