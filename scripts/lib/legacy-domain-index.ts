export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type OrderedLog = {
  blockNumber: number;
  transactionIndex: number;
  logIndex: number;
  tokenId: string;
};

export type LegacyTransferLog = OrderedLog & {
  kind: "transfer";
  from: string;
  to: string;
};

export type LegacyNewUriLog = OrderedLog & {
  kind: "new-uri";
  name: string;
};

export type LegacyDomainLog = LegacyTransferLog | LegacyNewUriLog;

export type LegacyDomainRecord = {
  tokenId: string;
  name: string;
  canonicalName: string;
  owner: string;
  lastUpdatedBlock: number;
};

export type LegacyNameCollision = {
  canonicalName: string;
  tokenIds: string[];
  owners: string[];
};

type MutableRecord = {
  tokenId: string;
  name?: string;
  owner?: string;
  lastUpdatedBlock: number;
};

export function canonicalizeLegacyName(value: string): string {
  return value.trim().normalize("NFC").toLowerCase();
}

function compareLogs(a: OrderedLog, b: OrderedLog): number {
  return (
    a.blockNumber - b.blockNumber ||
    a.transactionIndex - b.transactionIndex ||
    a.logIndex - b.logIndex
  );
}

function compareTokenIds(a: string, b: string): number {
  const left = BigInt(a);
  const right = BigInt(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function buildLegacyDomainSnapshot(
  logs: readonly LegacyDomainLog[],
): LegacyDomainRecord[] {
  const state = new Map<string, MutableRecord>();

  for (const log of [...logs].sort(compareLogs)) {
    const current = state.get(log.tokenId) ?? {
      tokenId: log.tokenId,
      lastUpdatedBlock: log.blockNumber,
    };

    if (log.kind === "transfer") {
      current.owner = log.to.toLowerCase();
    } else {
      current.name = log.name;
    }

    current.lastUpdatedBlock = log.blockNumber;
    state.set(log.tokenId, current);
  }

  return [...state.values()]
    .filter(
      (record): record is MutableRecord & { name: string; owner: string } =>
        Boolean(record.name) &&
        Boolean(record.owner) &&
        record.owner !== ZERO_ADDRESS,
    )
    .map((record) => ({
      tokenId: record.tokenId,
      name: record.name,
      canonicalName: canonicalizeLegacyName(record.name),
      owner: record.owner,
      lastUpdatedBlock: record.lastUpdatedBlock,
    }))
    .filter((record) => record.canonicalName.endsWith(".xdc"))
    .sort((a, b) => compareTokenIds(a.tokenId, b.tokenId));
}

export function findLegacyNameCollisions(
  records: readonly LegacyDomainRecord[],
): LegacyNameCollision[] {
  const groups = new Map<string, LegacyDomainRecord[]>();

  for (const record of records) {
    const group = groups.get(record.canonicalName) ?? [];
    group.push(record);
    groups.set(record.canonicalName, group);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([canonicalName, group]) => ({
      canonicalName,
      tokenIds: group.map((record) => record.tokenId).sort(compareTokenIds),
      owners: [...new Set(group.map((record) => record.owner))].sort(),
    }))
    .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
}
