import { eq, isNull } from "drizzle-orm";
import { getDatabase } from "./db/client";
import {
  forwardingRecoveries,
  forwardingRecoveryBurns,
} from "./db/schema";
import { checkForwardingRecoveryStore } from "./forwardingRecoveryStore";

export type ForwardingMonitorStatus =
  | "in-progress"
  | "delayed"
  | "needs-attention"
  | "recovery-expired";

export type ForwardingFailureMonitor = {
  generatedAt: string;
  thresholds: {
    delayedMinutes: number;
    needsAttentionMinutes: number;
  };
  counts: Record<ForwardingMonitorStatus, number>;
  routes: Array<{
    sourceChainId: number;
    destinationChainId: number;
    outstandingCount: number;
    warningCount: number;
  }>;
  records: Array<{
    feeTransactionHash: string;
    sourceChainId: number;
    destinationChainId: number;
    payer: string;
    recipient: string;
    recipientAmount: string;
    convenienceFeeAmount: string;
    createdAt: string;
    expiresAt: string;
    ageMinutes: number;
    status: ForwardingMonitorStatus;
    recommendation: string;
  }>;
};

const DELAYED_MINUTES = 15;
const NEEDS_ATTENTION_MINUTES = 60;
const MAX_RECORDS = 50;

export async function getForwardingFailureMonitor(): Promise<ForwardingFailureMonitor> {
  await checkForwardingRecoveryStore();
  const rows = await getDatabase()
    .select({
      feeTransactionHash: forwardingRecoveries.feeTransactionHash,
      sourceChainId: forwardingRecoveries.sourceChainId,
      destinationChainId: forwardingRecoveries.destinationChainId,
      payer: forwardingRecoveries.payer,
      recipient: forwardingRecoveries.recipient,
      recipientAmount: forwardingRecoveries.recipientAmount,
      convenienceFeeAmount: forwardingRecoveries.convenienceFeeAmount,
      createdAt: forwardingRecoveries.createdAt,
      expiresAt: forwardingRecoveries.expiresAt,
    })
    .from(forwardingRecoveries)
    .leftJoin(
      forwardingRecoveryBurns,
      eq(
        forwardingRecoveries.feeTransactionHash,
        forwardingRecoveryBurns.feeTransactionHash,
      ),
    )
    .where(isNull(forwardingRecoveryBurns.burnTransactionHash))
    .orderBy(forwardingRecoveries.createdAt);

  const now = Date.now();
  const counts: ForwardingFailureMonitor["counts"] = {
    "in-progress": 0,
    delayed: 0,
    "needs-attention": 0,
    "recovery-expired": 0,
  };
  const routeMap = new Map<string, ForwardingFailureMonitor["routes"][number]>();

  const classified = rows.map((row) => {
    const ageMinutes = Math.max(
      0,
      Math.floor((now - row.createdAt.getTime()) / 60_000),
    );
    const status = classifyStatus(ageMinutes, row.expiresAt.getTime(), now);
    counts[status] += 1;

    const routeKey = `${row.sourceChainId}:${row.destinationChainId}`;
    const route = routeMap.get(routeKey) || {
      sourceChainId: row.sourceChainId,
      destinationChainId: row.destinationChainId,
      outstandingCount: 0,
      warningCount: 0,
    };
    route.outstandingCount += 1;
    if (status !== "in-progress") route.warningCount += 1;
    routeMap.set(routeKey, route);

    return {
      feeTransactionHash: row.feeTransactionHash,
      sourceChainId: row.sourceChainId,
      destinationChainId: row.destinationChainId,
      payer: row.payer,
      recipient: row.recipient,
      recipientAmount: row.recipientAmount.toString(),
      convenienceFeeAmount: row.convenienceFeeAmount.toString(),
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      ageMinutes,
      status,
      recommendation: recommendation(status),
    };
  });

  const priority: Record<ForwardingMonitorStatus, number> = {
    "recovery-expired": 0,
    "needs-attention": 1,
    delayed: 2,
    "in-progress": 3,
  };

  return {
    generatedAt: new Date(now).toISOString(),
    thresholds: {
      delayedMinutes: DELAYED_MINUTES,
      needsAttentionMinutes: NEEDS_ATTENTION_MINUTES,
    },
    counts,
    routes: [...routeMap.values()].sort(
      (left, right) =>
        right.warningCount - left.warningCount ||
        right.outstandingCount - left.outstandingCount,
    ),
    records: classified
      .sort(
        (left, right) =>
          priority[left.status] - priority[right.status] ||
          right.ageMinutes - left.ageMinutes,
      )
      .slice(0, MAX_RECORDS),
  };
}

function classifyStatus(
  ageMinutes: number,
  expiresAt: number,
  now: number,
): ForwardingMonitorStatus {
  if (expiresAt <= now) return "recovery-expired";
  if (ageMinutes >= NEEDS_ATTENTION_MINUTES) return "needs-attention";
  if (ageMinutes >= DELAYED_MINUTES) return "delayed";
  return "in-progress";
}

function recommendation(status: ForwardingMonitorStatus): string {
  if (status === "recovery-expired") {
    return "Inspect the source-chain transactions before asking the payer to try again.";
  }
  if (status === "needs-attention") {
    return "Open recovery search and ask the payer to resume from the source wallet. Investigate the route if failures repeat.";
  }
  if (status === "delayed") {
    return "Ask the payer to keep or resume the original flow using this fee transaction hash. Do not collect another fee.";
  }
  return "Allow the payer flow time to complete before intervening.";
}
