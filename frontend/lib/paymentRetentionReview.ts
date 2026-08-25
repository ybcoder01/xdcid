import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { and, asc, count, gt, lte } from "drizzle-orm";
import { ensurePaymentHistorySchema } from "./paymentHistory";
import { getDatabase } from "./db/client";
import { paymentRecords } from "./db/schema";
import { paymentHistoryRepository } from "./repositories/postgresPaymentHistoryRepository";

const CONTROL_ID = "completed-history";
const INCLUDED_MONTHS = 15;
const NOTICE_MONTHS = 81;
const ARCHIVE_MONTHS = 84;

export type RetentionControlStatus = "held" | "approved";

export type PaymentRetentionPreview = {
  generatedAt: string;
  policy: {
    includedMonths: number;
    archiveMonths: number;
    deletionExecutionEnabled: true;
  };
  counts: {
    included: number;
    archive: number;
    approachingDeletion: number;
    eligible: number;
  };
  eligibleRange: {
    earliestCompletedAt: string | null;
    latestCompletedAt: string | null;
  };
  manifestHash: string;
  control: {
    status: RetentionControlStatus;
    approvedManifestHash: string | null;
    approvedCandidateCount: number | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
    lastExecutionAt: string | null;
    lastExecutionCount: number;
    lastExecutionManifestHash: string | null;
    approvalMatchesCurrentManifest: boolean;
  };
};

export type RetentionManifestRow = {
  paymentId: string;
  completedAt: string;
  sourceChainId: number;
  destinationChainId: number;
  sourceTransactionHash: string;
  destinationTransactionHash: string;
};

export async function getPaymentRetentionPreview(
  now = new Date()
): Promise<PaymentRetentionPreview> {
  const snapshot = await retentionSnapshot(now);
  const control = await readControl();
  return {
    generatedAt: now.toISOString(),
    policy: {
      includedMonths: INCLUDED_MONTHS,
      archiveMonths: ARCHIVE_MONTHS,
      deletionExecutionEnabled: true
    },
    counts: snapshot.counts,
    eligibleRange: snapshot.eligibleRange,
    manifestHash: snapshot.manifestHash,
    control: {
      ...control,
      approvalMatchesCurrentManifest:
        control.status === "approved" &&
        control.approvedManifestHash === snapshot.manifestHash &&
        control.approvedCandidateCount === snapshot.counts.eligible
    }
  };
}

export async function getPaymentRetentionManifest(
  now = new Date()
): Promise<RetentionManifestRow[]> {
  return (await retentionSnapshot(now)).manifest;
}

export async function deleteApprovedPaymentRetentionCandidates(
  now = new Date()
): Promise<{
  status: "no_candidates" | "held" | "approval_stale" | "deleted";
  candidates: number;
  deleted: number;
  manifestHash: string;
}> {
  const snapshot = await retentionSnapshot(now);
  const control = await readControl();
  if (snapshot.counts.eligible === 0) {
    return {
      status: "no_candidates",
      candidates: 0,
      deleted: 0,
      manifestHash: snapshot.manifestHash
    };
  }
  if (control.status !== "approved") {
    return {
      status: "held",
      candidates: snapshot.counts.eligible,
      deleted: 0,
      manifestHash: snapshot.manifestHash
    };
  }
  if (
    control.approvedManifestHash !== snapshot.manifestHash ||
    control.approvedCandidateCount !== snapshot.counts.eligible
  ) {
    return {
      status: "approval_stale",
      candidates: snapshot.counts.eligible,
      deleted: 0,
      manifestHash: snapshot.manifestHash
    };
  }

  const deleted = await paymentHistoryRepository.deletePaymentRecordsByIds(
    snapshot.manifest.map((row) => row.paymentId)
  );
  if (deleted !== snapshot.counts.eligible) {
    throw new Error("Retention deletion count did not match approved manifest");
  }

  const client = await ensureControlSchema();
  await client`
    UPDATE payment_retention_control
    SET status = 'held',
      approved_manifest_hash = NULL,
      approved_candidate_count = NULL,
      reviewed_by = NULL,
      reviewed_at = NULL,
      last_execution_at = ${now.toISOString()},
      last_execution_count = ${deleted},
      last_execution_manifest_hash = ${snapshot.manifestHash},
      updated_at = ${now.toISOString()}
    WHERE id = ${CONTROL_ID}
  `;

  return {
    status: "deleted",
    candidates: snapshot.counts.eligible,
    deleted,
    manifestHash: snapshot.manifestHash
  };
}

export async function setPaymentRetentionControl(input: {
  action: RetentionControlStatus;
  manifestHash: string;
  reviewedBy: string;
  now?: Date;
}): Promise<PaymentRetentionPreview> {
  const now = input.now || new Date();
  const snapshot = await retentionSnapshot(now);
  if (input.manifestHash !== snapshot.manifestHash) {
    throw new Error("Retention preview changed; refresh before reviewing");
  }
  if (input.action === "approved" && snapshot.counts.eligible === 0) {
    throw new Error("There are no eligible records to approve");
  }
  const client = await ensureControlSchema();
  await client`
    INSERT INTO payment_retention_control (
      id, status, approved_manifest_hash, approved_candidate_count,
      reviewed_by, reviewed_at, updated_at
    ) VALUES (
      ${CONTROL_ID}, ${input.action}, ${snapshot.manifestHash},
      ${snapshot.counts.eligible}, ${input.reviewedBy.toLowerCase()},
      ${now.toISOString()}, ${now.toISOString()}
    )
    ON CONFLICT (id) DO UPDATE SET
      status = excluded.status,
      approved_manifest_hash = excluded.approved_manifest_hash,
      approved_candidate_count = excluded.approved_candidate_count,
      reviewed_by = excluded.reviewed_by,
      reviewed_at = excluded.reviewed_at,
      updated_at = excluded.updated_at
  `;
  return getPaymentRetentionPreview(now);
}

async function retentionSnapshot(now: Date) {
  await ensurePaymentHistorySchema();
  await ensureControlSchema();
  const includedCutoff = subtractUtcMonths(now, INCLUDED_MONTHS);
  const noticeCutoff = subtractUtcMonths(now, NOTICE_MONTHS);
  const archiveCutoff = subtractUtcMonths(now, ARCHIVE_MONTHS);
  const database = getDatabase();

  const [includedRows, archiveRows, noticeRows, manifestRecords] = await Promise.all([
    database.select({ value: count() }).from(paymentRecords)
      .where(gt(paymentRecords.completedAt, includedCutoff)),
    database.select({ value: count() }).from(paymentRecords)
      .where(and(
        lte(paymentRecords.completedAt, includedCutoff),
        gt(paymentRecords.completedAt, archiveCutoff)
      )),
    database.select({ value: count() }).from(paymentRecords)
      .where(and(
        lte(paymentRecords.completedAt, noticeCutoff),
        gt(paymentRecords.completedAt, archiveCutoff)
      )),
    database.select({
      paymentId: paymentRecords.id,
      completedAt: paymentRecords.completedAt,
      sourceChainId: paymentRecords.sourceChainId,
      destinationChainId: paymentRecords.destinationChainId,
      sourceTransactionHash: paymentRecords.sourceTransactionHash,
      destinationTransactionHash: paymentRecords.destinationTransactionHash
    }).from(paymentRecords)
      .where(lte(paymentRecords.completedAt, archiveCutoff))
      .orderBy(asc(paymentRecords.completedAt), asc(paymentRecords.id))
  ]);

  const manifest: RetentionManifestRow[] = manifestRecords.map((record) => ({
    paymentId: record.paymentId,
    completedAt: record.completedAt.toISOString(),
    sourceChainId: record.sourceChainId,
    destinationChainId: record.destinationChainId,
    sourceTransactionHash: record.sourceTransactionHash,
    destinationTransactionHash: record.destinationTransactionHash || ""
  }));
  const manifestHash = createHash("sha256")
    .update(manifest.map((row) => [
      row.paymentId,
      row.completedAt,
      row.sourceChainId,
      row.destinationChainId,
      row.sourceTransactionHash,
      row.destinationTransactionHash
    ].join("|")).join("\n"))
    .digest("hex");

  return {
    counts: {
      included: includedRows[0]?.value ?? 0,
      archive: archiveRows[0]?.value ?? 0,
      approachingDeletion: noticeRows[0]?.value ?? 0,
      eligible: manifest.length
    },
    eligibleRange: {
      earliestCompletedAt: manifest[0]?.completedAt ?? null,
      latestCompletedAt: manifest.at(-1)?.completedAt ?? null
    },
    manifest,
    manifestHash
  };
}

async function readControl() {
  const client = await ensureControlSchema();
  const rows = await client`
    SELECT status, approved_manifest_hash, approved_candidate_count,
      reviewed_by, reviewed_at, last_execution_at, last_execution_count,
      last_execution_manifest_hash
    FROM payment_retention_control
    WHERE id = ${CONTROL_ID}
    LIMIT 1
  `;
  const row = rows[0];
  return {
    status: (row?.status === "approved" ? "approved" : "held") as RetentionControlStatus,
    approvedManifestHash: row?.approved_manifest_hash
      ? String(row.approved_manifest_hash)
      : null,
    approvedCandidateCount: row?.approved_candidate_count === null ||
      row?.approved_candidate_count === undefined
      ? null
      : Number(row.approved_candidate_count),
    reviewedBy: row?.reviewed_by ? String(row.reviewed_by) : null,
    reviewedAt: row?.reviewed_at
      ? new Date(String(row.reviewed_at)).toISOString()
      : null,
    lastExecutionAt: row?.last_execution_at
      ? new Date(String(row.last_execution_at)).toISOString()
      : null,
    lastExecutionCount: row?.last_execution_count
      ? Number(row.last_execution_count)
      : 0,
    lastExecutionManifestHash: row?.last_execution_manifest_hash
      ? String(row.last_execution_manifest_hash)
      : null
  };
}

async function ensureControlSchema() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Payment retention storage is not configured");
  const client = neon(connectionString);
  await client`
    CREATE TABLE IF NOT EXISTS payment_retention_control (
      id varchar(40) PRIMARY KEY,
      status varchar(16) NOT NULL DEFAULT 'held'
        CHECK (status IN ('held', 'approved')),
      approved_manifest_hash varchar(64),
      approved_candidate_count integer,
      reviewed_by varchar(42),
      reviewed_at timestamptz,
      last_execution_at timestamptz,
      last_execution_count integer NOT NULL DEFAULT 0,
      last_execution_manifest_hash varchar(64),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await client`ALTER TABLE payment_retention_control ADD COLUMN IF NOT EXISTS last_execution_at timestamptz`;
  await client`ALTER TABLE payment_retention_control ADD COLUMN IF NOT EXISTS last_execution_count integer NOT NULL DEFAULT 0`;
  await client`ALTER TABLE payment_retention_control ADD COLUMN IF NOT EXISTS last_execution_manifest_hash varchar(64)`;
  await client`
    INSERT INTO payment_retention_control (id, status)
    VALUES (${CONTROL_ID}, 'held')
    ON CONFLICT (id) DO NOTHING
  `;
  return client;
}

function subtractUtcMonths(value: Date, months: number): Date {
  const result = new Date(value);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    0
  )).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}
