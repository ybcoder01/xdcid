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

export type LegacyIncompatibleDomainRecord = LegacyDomainRecord & {
  compatibilityIssues: string[];
};

export type LegacyNameCollision = {
  canonicalName: string;
  tokenIds: string[];
  owners: string[];
};

export type LegacyDomainInventory = {
  activeTokenCount: number;
  namedActiveTokenCount: number;
  compatibleNames: LegacyDomainRecord[];
  legacyOnlyNames: LegacyIncompatibleDomainRecord[];
  missingMetadataTokenIds: string[];
  nonXdcTokenIds: string[];
};

export type LegacyIndexIntegrity = {
  passed: boolean;
  totalSupplyRead: boolean;
  supplyMatchesActiveTokens: boolean;
  allActiveTokensHaveMetadata: boolean;
  failures: string[];
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

export function legacyNameCompatibilityIssues(value: string): string[] {
  const canonicalName = canonicalizeLegacyName(value);
  if (!canonicalName.endsWith(".xdc")) return ["unsupported-suffix"];

  const label = canonicalName.slice(0, -4);
  const issues: string[] = [];
  if (label.length < 3) issues.push("label-too-short");
  if (label.length > 63) issues.push("label-too-long");
  if (!/^[a-z0-9-]+$/.test(label)) issues.push("invalid-label-characters");
  if (label.startsWith("-") || label.endsWith("-")) {
    issues.push("leading-or-trailing-hyphen");
  }
  return issues;
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

function reconstructLegacyState(
  logs: readonly LegacyDomainLog[],
): MutableRecord[] {
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

  return [...state.values()].sort((a, b) =>
    compareTokenIds(a.tokenId, b.tokenId),
  );
}

export function inspectLegacyDomainSnapshot(
  logs: readonly LegacyDomainLog[],
): LegacyDomainInventory {
  const active = reconstructLegacyState(logs).filter(
    (record): record is MutableRecord & { owner: string } =>
      Boolean(record.owner) && record.owner !== ZERO_ADDRESS,
  );
  const missingMetadataTokenIds: string[] = [];
  const nonXdcTokenIds: string[] = [];
  const compatibleNames: LegacyDomainRecord[] = [];
  const legacyOnlyNames: LegacyIncompatibleDomainRecord[] = [];

  for (const record of active) {
    if (!record.name || canonicalizeLegacyName(record.name).length === 0) {
      missingMetadataTokenIds.push(record.tokenId);
      continue;
    }

    const canonicalName = canonicalizeLegacyName(record.name);
    const domain: LegacyDomainRecord = {
      tokenId: record.tokenId,
      name: record.name,
      canonicalName,
      owner: record.owner,
      lastUpdatedBlock: record.lastUpdatedBlock,
    };
    const compatibilityIssues = legacyNameCompatibilityIssues(record.name);

    if (compatibilityIssues.includes("unsupported-suffix")) {
      nonXdcTokenIds.push(record.tokenId);
    } else if (compatibilityIssues.length > 0) {
      legacyOnlyNames.push({ ...domain, compatibilityIssues });
    } else {
      compatibleNames.push(domain);
    }
  }

  return {
    activeTokenCount: active.length,
    namedActiveTokenCount: active.length - missingMetadataTokenIds.length,
    compatibleNames,
    legacyOnlyNames,
    missingMetadataTokenIds,
    nonXdcTokenIds,
  };
}

export function assessLegacyIndexIntegrity(
  inventory: LegacyDomainInventory,
  totalSupply: string | null,
): LegacyIndexIntegrity {
  const totalSupplyRead = totalSupply !== null;
  const supplyMatchesActiveTokens =
    totalSupplyRead && BigInt(totalSupply) === BigInt(inventory.activeTokenCount);
  const allActiveTokensHaveMetadata =
    inventory.missingMetadataTokenIds.length === 0;
  const failures: string[] = [];

  if (!totalSupplyRead) failures.push("legacy-total-supply-unavailable");
  if (totalSupplyRead && !supplyMatchesActiveTokens) {
    failures.push("active-token-count-does-not-match-total-supply");
  }
  if (!allActiveTokensHaveMetadata) {
    failures.push("active-tokens-missing-name-metadata");
  }

  return {
    passed:
      totalSupplyRead &&
      supplyMatchesActiveTokens &&
      allActiveTokensHaveMetadata,
    totalSupplyRead,
    supplyMatchesActiveTokens,
    allActiveTokensHaveMetadata,
    failures,
  };
}

export function buildLegacyDomainSnapshot(
  logs: readonly LegacyDomainLog[],
): LegacyDomainRecord[] {
  return inspectLegacyDomainSnapshot(logs).compatibleNames;
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
