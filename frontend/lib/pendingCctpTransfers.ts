export const PENDING_CCTP_STORAGE_KEY = "xdcid:cctp:pending:v1";
export const PENDING_CCTP_CHANGED_EVENT = "xdcid:cctp:pending-changed";

const STORAGE_VERSION = 1;
const MAX_PENDING_TRANSFERS = 10;
const PENDING_TRANSFER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type PendingCctpTransfer = {
  burnHash: `0x${string}`;
  payer: `0x${string}`;
  sourceChainId: number;
  destinationChainId: number;
  amount: string;
  recipient: `0x${string}`;
  transferMode: "standard" | "forwarded";
  feeHash?: `0x${string}`;
  createdAt: number;
  updatedAt: number;
};

type PendingCctpStore = {
  version: typeof STORAGE_VERSION;
  transfers: PendingCctpTransfer[];
};

export type PendingCctpTransferInput = Omit<
  PendingCctpTransfer,
  "createdAt" | "updatedAt"
>;

export function readPendingCctpTransfers(
  storage: StorageLike,
  now = Date.now()
): PendingCctpTransfer[] {
  try {
    const value = storage.getItem(PENDING_CCTP_STORAGE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as Partial<PendingCctpStore>;
    if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.transfers)) {
      return [];
    }
    return parsed.transfers
      .filter((transfer): transfer is PendingCctpTransfer =>
        isPendingCctpTransfer(transfer, now)
      )
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_PENDING_TRANSFERS);
  } catch {
    return [];
  }
}

export function savePendingCctpTransfer(
  storage: StorageLike,
  input: PendingCctpTransferInput,
  now = Date.now()
): PendingCctpTransfer | null {
  const candidate: PendingCctpTransfer = {
    ...input,
    createdAt: now,
    updatedAt: now
  };
  if (!isPendingCctpTransfer(candidate, now)) return null;

  const existing = readPendingCctpTransfers(storage, now);
  const previous = existing.find(
    (transfer) => transfer.burnHash.toLowerCase() === input.burnHash.toLowerCase()
  );
  const saved: PendingCctpTransfer = previous
    ? {
        ...previous,
        feeHash: input.feeHash || previous.feeHash,
        updatedAt: now
      }
    : candidate;
  const transfers = [
    saved,
    ...existing.filter(
      (transfer) => transfer.burnHash.toLowerCase() !== input.burnHash.toLowerCase()
    )
  ].slice(0, MAX_PENDING_TRANSFERS);

  try {
    storage.setItem(
      PENDING_CCTP_STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, transfers } satisfies PendingCctpStore)
    );
    return saved;
  } catch {
    return null;
  }
}

export function removePendingCctpTransfer(
  storage: StorageLike,
  burnHash: string,
  now = Date.now()
): boolean {
  const transfers = readPendingCctpTransfers(storage, now);
  const remaining = transfers.filter(
    (transfer) => transfer.burnHash.toLowerCase() !== burnHash.toLowerCase()
  );
  if (remaining.length === transfers.length) return false;
  try {
    storage.setItem(
      PENDING_CCTP_STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, transfers: remaining } satisfies PendingCctpStore)
    );
    return true;
  } catch {
    return false;
  }
}

export function findMatchingPendingCctpTransfer(
  transfers: PendingCctpTransfer[],
  input: {
    payer: string;
    sourceChainId: number;
    destinationChainId: number;
    amount: string;
    recipient: string;
  }
): PendingCctpTransfer | undefined {
  return transfers.find(
    (transfer) =>
      transfer.payer.toLowerCase() === input.payer.toLowerCase() &&
      transfer.sourceChainId === input.sourceChainId &&
      transfer.destinationChainId === input.destinationChainId &&
      transfer.amount === input.amount &&
      transfer.recipient.toLowerCase() === input.recipient.toLowerCase()
  );
}

function isPendingCctpTransfer(
  value: unknown,
  now: number
): value is PendingCctpTransfer {
  if (!value || typeof value !== "object") return false;
  const transfer = value as Partial<PendingCctpTransfer>;
  return (
    typeof transfer.burnHash === "string" &&
    HASH_PATTERN.test(transfer.burnHash) &&
    typeof transfer.payer === "string" &&
    ADDRESS_PATTERN.test(transfer.payer) &&
    Number.isInteger(transfer.sourceChainId) &&
    Number.isInteger(transfer.destinationChainId) &&
    Number(transfer.sourceChainId) > 0 &&
    Number(transfer.destinationChainId) > 0 &&
    transfer.sourceChainId !== transfer.destinationChainId &&
    typeof transfer.amount === "string" &&
    transfer.amount.length > 0 &&
    typeof transfer.recipient === "string" &&
    ADDRESS_PATTERN.test(transfer.recipient) &&
    (transfer.transferMode === "standard" || transfer.transferMode === "forwarded") &&
    (transfer.feeHash === undefined ||
      (typeof transfer.feeHash === "string" && HASH_PATTERN.test(transfer.feeHash))) &&
    typeof transfer.createdAt === "number" &&
    Number.isFinite(transfer.createdAt) &&
    typeof transfer.updatedAt === "number" &&
    Number.isFinite(transfer.updatedAt) &&
    transfer.createdAt <= now &&
    transfer.updatedAt <= now &&
    now - transfer.updatedAt <= PENDING_TRANSFER_TTL_MS
  );
}
