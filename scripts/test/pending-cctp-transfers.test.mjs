import assert from "node:assert/strict";
import test from "node:test";
import {
  PENDING_CCTP_STORAGE_KEY,
  findMatchingPendingCctpTransfer,
  readPendingCctpTransfers,
  removePendingCctpTransfer,
  savePendingCctpTransfer,
} from "../../frontend/lib/pendingCctpTransfers.ts";

const payer = `0x${"11".repeat(20)}`;
const recipient = `0x${"22".repeat(20)}`;
const burnHash = `0x${"ab".repeat(32)}`;
const feeHash = `0x${"cd".repeat(32)}`;

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("persists and matches a public CCTP recovery checkpoint", () => {
  const storage = memoryStorage();
  const now = Date.UTC(2026, 8, 28);
  const saved = savePendingCctpTransfer(
    storage,
    {
      burnHash,
      feeHash,
      payer,
      sourceChainId: 1,
      destinationChainId: 50,
      amount: "12.5",
      recipient,
      transferMode: "forwarded",
    },
    now,
  );

  assert.ok(saved);
  const transfers = readPendingCctpTransfers(storage, now);
  assert.equal(transfers.length, 1);
  assert.equal(transfers[0].burnHash, burnHash);
  assert.equal(transfers[0].feeHash, feeHash);
  assert.equal(
    findMatchingPendingCctpTransfer(transfers, {
      payer: payer.toUpperCase().replace("0X", "0x"),
      sourceChainId: 1,
      destinationChainId: 50,
      amount: "12.5",
      recipient,
    })?.burnHash,
    burnHash,
  );
});

test("drops corrupt and expired recovery data", () => {
  const storage = memoryStorage();
  const now = Date.UTC(2026, 8, 28);
  storage.setItem(PENDING_CCTP_STORAGE_KEY, "not-json");
  assert.deepEqual(readPendingCctpTransfers(storage, now), []);

  storage.setItem(
    PENDING_CCTP_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      transfers: [
        {
          burnHash,
          payer,
          sourceChainId: 1,
          destinationChainId: 50,
          amount: "1",
          recipient,
          transferMode: "standard",
          createdAt: now - 31 * 24 * 60 * 60 * 1000,
          updatedAt: now - 31 * 24 * 60 * 60 * 1000,
        },
      ],
    }),
  );
  assert.deepEqual(readPendingCctpTransfers(storage, now), []);
});

test("removes a completed or dismissed recovery checkpoint", () => {
  const storage = memoryStorage();
  const now = Date.UTC(2026, 8, 28);
  savePendingCctpTransfer(
    storage,
    {
      burnHash,
      payer,
      sourceChainId: 1,
      destinationChainId: 50,
      amount: "1",
      recipient,
      transferMode: "standard",
    },
    now,
  );

  assert.equal(removePendingCctpTransfer(storage, burnHash, now), true);
  assert.deepEqual(readPendingCctpTransfers(storage, now), []);
  assert.equal(removePendingCctpTransfer(storage, burnHash, now), false);
});
