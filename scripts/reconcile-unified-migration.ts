import fs from "node:fs";
import { ethers } from "hardhat";

type SnapshotEntry = {
  name: string;
  kind: "top-level" | "subdomain";
  owner: string;
  expiry: string;
  parentName?: string;
  routes?: Record<string, string>;
};

type MigrationSnapshot = {
  chainId: string;
  snapshotBlockNumber: number;
  snapshotBlockHash: string;
  entries: SnapshotEntry[];
};

type Failure = { name: string; field: string; expected: string; actual: string };

function requiredAddress(name: string): string {
  const value = process.env[name];
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`Set ${name} to a valid address`);
  }
  return ethers.getAddress(value);
}

function canonicalName(value: string): string {
  const name = value.trim().toLowerCase();
  if (!name.endsWith(".xdc") || name.split(".").some((label) => !label)) {
    throw new Error(`Invalid snapshot name: ${value}`);
  }
  return name;
}

function nodeFor(name: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalName(name)));
}

function compare(
  failures: Failure[],
  name: string,
  field: string,
  actual: unknown,
  expected: unknown,
) {
  if (String(actual).toLowerCase() !== String(expected).toLowerCase()) {
    failures.push({
      name,
      field,
      expected: String(expected),
      actual: String(actual),
    });
  }
}

function readSnapshot(path: string): MigrationSnapshot {
  const parsed = JSON.parse(fs.readFileSync(path, "utf8")) as MigrationSnapshot;
  if (
    !parsed ||
    !Array.isArray(parsed.entries) ||
    !Number.isSafeInteger(parsed.snapshotBlockNumber) ||
    typeof parsed.snapshotBlockHash !== "string"
  ) {
    throw new Error("Migration snapshot has an invalid shape");
  }
  return parsed;
}

async function main() {
  const snapshotPath = process.env.UNIFIED_MIGRATION_SNAPSHOT;
  if (!snapshotPath) throw new Error("Set UNIFIED_MIGRATION_SNAPSHOT");
  const snapshot = readSnapshot(snapshotPath);
  const network = await ethers.provider.getNetwork();
  if (BigInt(snapshot.chainId) !== network.chainId) {
    throw new Error(
      `Snapshot chain ${snapshot.chainId} does not match provider chain ${network.chainId}`,
    );
  }

  const snapshotBlock = await ethers.provider.getBlock(
    snapshot.snapshotBlockNumber,
  );
  if (!snapshotBlock || snapshotBlock.hash !== snapshot.snapshotBlockHash) {
    throw new Error(
      "Snapshot block hash no longer matches the chain. Stop: the source chain may have reorganized or rolled back.",
    );
  }

  const registry = await ethers.getContractAt(
    "XNSRegistryV3",
    requiredAddress("UNIFIED_REGISTRY_ADDRESS"),
  );
  const resolver = await ethers.getContractAt(
    "XNSUniversalResolver",
    requiredAddress("UNIFIED_RESOLVER_ADDRESS"),
  );
  const failures: Failure[] = [];

  for (const entry of snapshot.entries) {
    const name = canonicalName(entry.name);
    const node = nodeFor(name);
    const record = await registry.records(node);
    compare(failures, name, "migrated", await registry.migrated(node), true);
    compare(
      failures,
      name,
      "owner",
      ethers.getAddress(record.owner),
      ethers.getAddress(entry.owner),
    );
    compare(failures, name, "expiry", record.expiry, BigInt(entry.expiry));
    compare(
      failures,
      name,
      "kind",
      Number(record.kind),
      entry.kind === "top-level" ? 1 : 2,
    );

    const expectedParent = entry.kind === "subdomain"
      ? nodeFor(entry.parentName ?? "")
      : ethers.ZeroHash;
    compare(failures, name, "parentNode", record.parentNode, expectedParent);

    for (const [chainId, target] of Object.entries(entry.routes ?? {})) {
      const actual = await resolver.addressOf(node, BigInt(chainId));
      compare(
        failures,
        name,
        `route:${chainId}`,
        ethers.getAddress(actual),
        ethers.getAddress(target),
      );
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(
        `FAIL ${failure.name} ${failure.field}: expected ${failure.expected}, got ${failure.actual}`,
      );
    }
    throw new Error(`Migration reconciliation failed ${failures.length} check(s)`);
  }
  console.log(
    `Migration reconciliation passed for ${snapshot.entries.length} record(s) at block ${snapshot.snapshotBlockNumber}.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
