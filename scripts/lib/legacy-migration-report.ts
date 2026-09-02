export type LegacySnapshotRecord = {
  tokenId: string;
  name: string;
  canonicalName: string;
  owner: string;
  lastUpdatedBlock: number;
};

export type LegacySnapshot = {
  schema: string;
  chainId: number;
  contract: string;
  fromBlock: number;
  toBlock: number;
  snapshotSha256: string;
  names: LegacySnapshotRecord[];
};

export type XdcidRegistryRecord = {
  canonicalName: string;
  owner: string;
  expiry: string;
};

export type MigrationStatus =
  | "eligible"
  | "invalid"
  | "legacy-duplicate"
  | "xdcid-collision";

export type MigrationRecord = LegacySnapshotRecord & {
  status: MigrationStatus;
  reason?: string;
  duplicateTokenIds?: string[];
  xdcidOwner?: string;
  xdcidExpiry?: string;
};

export type MigrationReport = {
  schema: "xdcid/legacy-migration-report/v1";
  chainId: number;
  snapshotBlock: number;
  snapshotBlockTimestamp: number;
  legacyContract: string;
  xdcidRegistry: string;
  sourceSnapshotSha256: string;
  counts: {
    total: number;
    eligible: number;
    invalid: number;
    legacyDuplicates: number;
    xdcidCollisions: number;
  };
  eligible: MigrationRecord[];
  invalid: MigrationRecord[];
  legacyDuplicates: MigrationRecord[];
  xdcidCollisions: MigrationRecord[];
};

function compareRecords(
  left: LegacySnapshotRecord,
  right: LegacySnapshotRecord,
): number {
  const byName = left.canonicalName.localeCompare(right.canonicalName);
  if (byName !== 0) return byName;

  const leftToken = BigInt(left.tokenId);
  const rightToken = BigInt(right.tokenId);
  return leftToken < rightToken ? -1 : leftToken > rightToken ? 1 : 0;
}

export function invalidLegacyNameReason(value: string): string | undefined {
  const canonical = value.trim().normalize("NFC").toLowerCase();
  if (!canonical.endsWith(".xdc")) return "Name does not end in .xdc";

  const label = canonical.slice(0, -4);
  if (label.length < 3) return "Label is shorter than 3 characters";
  if (label.length > 63) return "Label is longer than 63 characters";
  if (!/^[a-z0-9-]+$/.test(label)) {
    return "Label contains characters outside a-z, 0-9, and hyphen";
  }
  if (label.startsWith("-") || label.endsWith("-")) {
    return "Label starts or ends with a hyphen";
  }
  return undefined;
}

export function buildMigrationReport(
  snapshot: LegacySnapshot,
  xdcidRegistry: string,
  snapshotBlockTimestamp: number,
  xdcidRecords: ReadonlyMap<string, XdcidRegistryRecord>,
): MigrationReport {
  const records = [...snapshot.names].sort(compareRecords);
  const tokenIdsByName = new Map<string, string[]>();

  for (const record of records) {
    const tokenIds = tokenIdsByName.get(record.canonicalName) ?? [];
    tokenIds.push(record.tokenId);
    tokenIdsByName.set(record.canonicalName, tokenIds);
  }

  const eligible: MigrationRecord[] = [];
  const invalid: MigrationRecord[] = [];
  const legacyDuplicates: MigrationRecord[] = [];
  const xdcidCollisions: MigrationRecord[] = [];

  for (const record of records) {
    const invalidReason = invalidLegacyNameReason(record.canonicalName);
    if (invalidReason) {
      invalid.push({ ...record, status: "invalid", reason: invalidReason });
      continue;
    }

    const duplicateTokenIds = tokenIdsByName.get(record.canonicalName) ?? [];
    if (duplicateTokenIds.length > 1) {
      legacyDuplicates.push({
        ...record,
        status: "legacy-duplicate",
        reason: "Multiple active legacy tokens share the canonical name",
        duplicateTokenIds: [...duplicateTokenIds],
      });
      continue;
    }

    const xdcid = xdcidRecords.get(record.canonicalName);
    if (xdcid) {
      xdcidCollisions.push({
        ...record,
        status: "xdcid-collision",
        reason: "Name is active in the XDCID registry at the snapshot block",
        xdcidOwner: xdcid.owner,
        xdcidExpiry: xdcid.expiry,
      });
      continue;
    }

    eligible.push({ ...record, status: "eligible" });
  }

  return {
    schema: "xdcid/legacy-migration-report/v1",
    chainId: snapshot.chainId,
    snapshotBlock: snapshot.toBlock,
    snapshotBlockTimestamp,
    legacyContract: snapshot.contract,
    xdcidRegistry,
    sourceSnapshotSha256: snapshot.snapshotSha256,
    counts: {
      total: records.length,
      eligible: eligible.length,
      invalid: invalid.length,
      legacyDuplicates: legacyDuplicates.length,
      xdcidCollisions: xdcidCollisions.length,
    },
    eligible,
    invalid,
    legacyDuplicates,
    xdcidCollisions,
  };
}
