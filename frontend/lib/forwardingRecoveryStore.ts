import {
  FORWARDING_RECOVERY_TTL_SECONDS,
  forwardingRecoveryKey,
  forwardingRecoveryUseKey,
  type ForwardingRecoveryRecord
} from "./forwardingRecovery";

type RedisResponse = {
  result?: unknown;
  error?: string;
};

export function isForwardingRecoveryStoreConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL &&
      process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

export async function getForwardingRecoveryRecord(
  feeTransactionHash: string
): Promise<ForwardingRecoveryRecord | null> {
  const result = await redisCommand([
    "GET",
    forwardingRecoveryKey(feeTransactionHash)
  ]);
  if (result === null) return null;
  if (typeof result !== "string") {
    throw new Error("Recovery store returned an invalid record");
  }
  const parsed = JSON.parse(result) as unknown;
  if (!isRecoveryRecord(parsed)) {
    throw new Error("Recovery store returned an invalid record");
  }
  return parsed;
}

export async function createForwardingRecoveryRecord(
  record: ForwardingRecoveryRecord
): Promise<boolean> {
  const result = await redisCommand([
    "SET",
    forwardingRecoveryKey(record.feeTransactionHash),
    JSON.stringify(record),
    "EX",
    FORWARDING_RECOVERY_TTL_SECONDS,
    "NX"
  ]);
  return result === "OK";
}

export async function getForwardingRecoveryUse(
  feeTransactionHash: string
): Promise<string | null> {
  const result = await redisCommand([
    "GET",
    forwardingRecoveryUseKey(feeTransactionHash)
  ]);
  if (result === null) return null;
  if (typeof result !== "string") {
    throw new Error("Recovery store returned an invalid use record");
  }
  return result;
}

export async function markForwardingRecoveryUsed(
  feeTransactionHash: string,
  burnTransactionHash: string
): Promise<"created" | "same" | "conflict"> {
  const result = await redisCommand([
    "SET",
    forwardingRecoveryUseKey(feeTransactionHash),
    burnTransactionHash.toLowerCase(),
    "EX",
    FORWARDING_RECOVERY_TTL_SECONDS,
    "NX"
  ]);
  if (result === "OK") return "created";

  const existing = await getForwardingRecoveryUse(feeTransactionHash);
  return existing?.toLowerCase() === burnTransactionHash.toLowerCase()
    ? "same"
    : "conflict";
}

async function redisCommand(command: Array<string | number>): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error("Forwarding recovery storage is not configured");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json"
    },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(4_000)
  });
  const body = (await response.json()) as RedisResponse;
  if (!response.ok || body.error) {
    throw new Error("Forwarding recovery storage is unavailable");
  }
  return body.result;
}

function isRecoveryRecord(value: unknown): value is ForwardingRecoveryRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    typeof record.feeTransactionHash === "string" &&
    typeof record.payer === "string" &&
    typeof record.recipientAmount === "string" &&
    typeof record.recipient === "string" &&
    typeof record.destinationChainId === "number" &&
    typeof record.createdAt === "string" &&
    typeof record.expiresAt === "string"
  );
}
