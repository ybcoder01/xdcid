"use client";

import { useCallback, useEffect, useState } from "react";

type RetentionPreview = {
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
    status: "held" | "approved";
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

export function AdminRetentionReview() {
  const [preview, setPreview] = useState<RetentionPreview>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState<"held" | "approved" | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/retention", { cache: "no-store" });
      const body = await response.json() as RetentionPreview & { error?: string };
      if (!response.ok) throw new Error(body.error || "Retention preview failed.");
      setPreview(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Retention preview failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function review(action: "held" | "approved") {
    if (!preview) return;
    if (
      action === "approved" &&
      !window.confirm(
        "Approve deletion of exactly " + preview.counts.eligible +
        " completed payment record(s) after the next authenticated retention run?\\n\\n" +
        "Manifest: " + preview.manifestHash
      )
    ) {
      return;
    }
    setUpdating(action);
    setError("");
    try {
      const response = await fetch("/api/admin/retention", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, manifestHash: preview.manifestHash })
      });
      const body = await response.json() as RetentionPreview & { error?: string };
      if (!response.ok) throw new Error(body.error || "Retention review failed.");
      setPreview(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Retention review failed.");
    } finally {
      setUpdating(null);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">
            Completed-history retention
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Review the seven-year retention boundary before any future cleanup.
            Approval is tied to an exact manifest and becomes stale if the candidate set changes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || Boolean(updating)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh preview"}
        </button>
      </div>

      <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
        <p className="font-semibold text-amber-950">Deletion is held unless you approve the exact manifest</p>
        <p className="mt-1 text-sm text-amber-900">
          The daily cleanup can delete only the records listed in a manifest whose SHA-256
          and candidate count still match your recorded approval. New or changed candidates
          make the approval stale, and the safeguard returns to hold after a successful run.
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Included access" value={preview?.counts.included} detail="0–15 months" />
        <Metric label="Archive" value={preview?.counts.archive} detail="16–84 months" />
        <Metric
          label="Approaching deletion"
          value={preview?.counts.approachingDeletion}
          detail="Final 3 months"
        />
        <Metric label="Eligible now" value={preview?.counts.eligible} detail="Older than 84 months" />
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <dl className="grid gap-4 text-sm md:grid-cols-2">
          <Data label="Current safeguard" value={preview?.control.status === "approved" ? "Approval recorded" : "Deletion hold"} />
          <Data
            label="Approval status"
            value={preview?.control.approvalMatchesCurrentManifest
              ? "Matches current manifest"
              : "No current matching approval"}
          />
          <Data label="Earliest eligible record" value={formatDate(preview?.eligibleRange.earliestCompletedAt)} />
          <Data label="Latest eligible record" value={formatDate(preview?.eligibleRange.latestCompletedAt)} />
          <Data label="Last reviewed by" value={preview?.control.reviewedBy || "Not reviewed"} mono />
          <Data label="Last reviewed" value={formatDate(preview?.control.reviewedAt)} />
          <Data label="Last cleanup execution" value={formatDate(preview?.control.lastExecutionAt)} />
          <Data
            label="Records deleted in last execution"
            value={String(preview?.control.lastExecutionCount ?? 0)}
          />
        </dl>
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Current manifest SHA-256
          </p>
          <p className="mt-1 break-all font-mono text-xs text-slate-700">
            {preview?.manifestHash || "Loading…"}
          </p>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href="/api/admin/retention?format=csv"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800"
          >
            Download candidate manifest
          </a>
          <button
            type="button"
            onClick={() => void review("held")}
            disabled={!preview || Boolean(updating)}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
          >
            {updating === "held" ? "Recording hold..." : "Place deletion hold"}
          </button>
          <button
            type="button"
            onClick={() => void review("approved")}
            disabled={!preview || preview.counts.eligible === 0 || Boolean(updating)}
            className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {updating === "approved" ? "Recording approval..." : "Record reviewed approval"}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          The manifest contains only internal payment IDs, completion times, chain IDs and
          source/destination transaction hashes. Download and review it before recording approval.
        </p>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}

function Metric({ label, value, detail }: {
  label: string;
  value: number | undefined;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value ?? "—"}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function Data({ label, value, mono = false }: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={"mt-1 break-all text-slate-900 " + (mono ? "font-mono text-xs" : "")}>
        {value}
      </dd>
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "None";
}
