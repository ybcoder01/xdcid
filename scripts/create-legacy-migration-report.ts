import { createHash } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { ethers } from "hardhat";
import {
  LegacySnapshot,
  XdcidRegistryRecord,
  buildMigrationReport,
  invalidLegacyNameReason,
} from "./lib/legacy-migration-report";

const CHAIN_ID = 50;
const LEGACY_CONTRACT = "0x295a7aB79368187a6CD03c464cfaAb04d799784E";
const DEFAULT_XDCID_REGISTRY = "0x05fa64a05bc205DeDF47e023d2D90c2d119cd097";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const QUERY_BATCH_SIZE = 100;

const registryInterface = new ethers.Interface([
  "function records(bytes32 node) view returns (address owner, address resolver, uint256 expiry)",
]);

function requiredPath(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required");
  return value;
}

function rpcUrls(): string[] {
  const configured = [
    process.env.XDC_MAINNET_RPC_URL,
    process.env.XDC_RPC_URL,
    ...(process.env.XDC_RPC_URLS ?? "").split(","),
  ];
  return [
    ...new Set([
      ...configured,
      "https://earpc.xinfin.network",
      "https://rpc.xinfin.network",
    ]),
  ]
    .map((value) => value?.trim())
    .filter(
      (value): value is string =>
        Boolean(value) && /^https?:\/\//i.test(value as string),
    );
}

async function usableProviders(): Promise<ethers.JsonRpcProvider[]> {
  const providers: ethers.JsonRpcProvider[] = [];

  for (const url of rpcUrls()) {
    const provider = new ethers.JsonRpcProvider(url);
    try {
      if (Number(await provider.send("eth_chainId", [])) === CHAIN_ID) {
        providers.push(provider);
      }
    } catch {
      // RPC URLs can contain credentials, so endpoint details are never logged.
    }
  }

  if (providers.length === 0) {
    throw new Error("No healthy XDC mainnet RPC endpoint is available");
  }
  return providers;
}

async function tryProviders<T>(
  providers: readonly ethers.JsonRpcProvider[],
  operation: (provider: ethers.JsonRpcProvider) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (const provider of providers) {
    try {
      return await operation(provider);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("All XDC RPC endpoints failed");
}

function verifySnapshot(value: unknown): LegacySnapshot {
  if (!value || typeof value !== "object") {
    throw new Error("Snapshot must be a JSON object");
  }

  const snapshot = value as LegacySnapshot;
  if (
    snapshot.schema !== "xdcid/legacy-domain-index/v1" ||
    snapshot.chainId !== CHAIN_ID ||
    snapshot.contract.toLowerCase() !== LEGACY_CONTRACT.toLowerCase() ||
    !Number.isSafeInteger(snapshot.toBlock) ||
    !Array.isArray(snapshot.names) ||
    !/^[0-9a-f]{64}$/.test(snapshot.snapshotSha256)
  ) {
    throw new Error("Snapshot metadata is invalid or unsupported");
  }

  const { snapshotSha256, ...payload } = snapshot;
  const calculated = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  if (calculated !== snapshotSha256) {
    throw new Error("Snapshot SHA-256 integrity check failed");
  }

  return snapshot;
}

async function readActiveXdcidRecord(
  providers: readonly ethers.JsonRpcProvider[],
  registry: string,
  canonicalName: string,
  blockTag: number,
  blockTimestamp: number,
): Promise<XdcidRegistryRecord | undefined> {
  const node = ethers.keccak256(ethers.toUtf8Bytes(canonicalName));
  const data = registryInterface.encodeFunctionData("records", [node]);
  const result = await tryProviders(providers, (provider) =>
    provider.send("eth_call", [
      { to: registry, data },
      ethers.toQuantity(blockTag),
    ]),
  );
  const decoded = registryInterface.decodeFunctionResult("records", result);
  const owner = String(decoded[0]).toLowerCase();
  const expiry = BigInt(decoded[2]);

  if (owner === ZERO_ADDRESS || expiry < BigInt(blockTimestamp)) {
    return undefined;
  }
  return {
    canonicalName,
    owner,
    expiry: expiry.toString(),
  };
}

async function main(): Promise<void> {
  const snapshotPath = requiredPath("LEGACY_SNAPSHOT_PATH");
  const reportPath = requiredPath("LEGACY_REPORT_PATH");
  const registry =
    process.env.XDCID_REGISTRY_ADDRESS?.trim() || DEFAULT_XDCID_REGISTRY;
  if (!ethers.isAddress(registry)) {
    throw new Error("XDCID_REGISTRY_ADDRESS must be a valid address");
  }

  const snapshot = verifySnapshot(
    JSON.parse(readFileSync(snapshotPath, "utf8")),
  );
  const providers = await usableProviders();
  const block = await tryProviders(providers, (provider) =>
    provider.getBlock(snapshot.toBlock),
  );
  if (!block) throw new Error("Snapshot block is unavailable from XDC RPC");

  const counts = new Map<string, number>();
  for (const record of snapshot.names) {
    counts.set(
      record.canonicalName,
      (counts.get(record.canonicalName) ?? 0) + 1,
    );
  }

  const candidates = [
    ...new Set(
      snapshot.names
        .filter(
          (record) =>
            !invalidLegacyNameReason(record.canonicalName) &&
            counts.get(record.canonicalName) === 1,
        )
        .map((record) => record.canonicalName),
    ),
  ].sort();

  const activeXdcidRecords = new Map<string, XdcidRegistryRecord>();
  for (let offset = 0; offset < candidates.length; offset += QUERY_BATCH_SIZE) {
    const batch = candidates.slice(offset, offset + QUERY_BATCH_SIZE);
    const results = await Promise.all(
      batch.map((name) =>
        readActiveXdcidRecord(
          providers,
          registry,
          name,
          snapshot.toBlock,
          block.timestamp,
        ),
      ),
    );

    for (const record of results) {
      if (record) activeXdcidRecords.set(record.canonicalName, record);
    }
    process.stderr.write(
      "Checked XDCID records " +
        Math.min(offset + batch.length, candidates.length) +
        "/" +
        candidates.length +
        "\n",
    );
  }

  const report = buildMigrationReport(
    snapshot,
    ethers.getAddress(registry),
    block.timestamp,
    activeXdcidRecords,
  );
  const reportSha256 = createHash("sha256")
    .update(JSON.stringify(report))
    .digest("hex");
  const output = { ...report, reportSha256 };

  writeFileSync(reportPath, JSON.stringify(output, null, 2) + "\n", {
    encoding: "utf8",
    flag: "wx",
  });
  process.stdout.write(
    JSON.stringify({
      reportPath,
      reportSha256,
      counts: report.counts,
    }) + "\n",
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write("Migration report failed: " + message + "\n");
  process.exitCode = 1;
});
