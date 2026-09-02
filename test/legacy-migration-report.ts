import { expect } from "chai";
import {
  LegacySnapshot,
  XdcidRegistryRecord,
  buildMigrationReport,
  invalidLegacyNameReason,
} from "../scripts/lib/legacy-migration-report";

const OWNER_A = "0x1111111111111111111111111111111111111111";
const OWNER_B = "0x2222222222222222222222222222222222222222";

function record(tokenId: string, canonicalName: string, owner = OWNER_A) {
  return {
    tokenId,
    name: canonicalName,
    canonicalName,
    owner,
    lastUpdatedBlock: 100,
  };
}

function snapshot(names: ReturnType<typeof record>[]): LegacySnapshot {
  return {
    schema: "xdcid/legacy-domain-index/v1",
    chainId: 50,
    contract: "0x295a7aB79368187a6CD03c464cfaAb04d799784E",
    fromBlock: 48_393_303,
    toBlock: 90_000_000,
    snapshotSha256: "a".repeat(64),
    names,
  };
}

describe("legacy migration report", () => {
  it("matches the registrar name rules", () => {
    expect(invalidLegacyNameReason("abc.xdc")).to.equal(undefined);
    expect(invalidLegacyNameReason("ab.xdc")).to.equal(
      "Label is shorter than 3 characters",
    );
    expect(invalidLegacyNameReason("-abc.xdc")).to.equal(
      "Label starts or ends with a hyphen",
    );
    expect(invalidLegacyNameReason("álpha.xdc")).to.equal(
      "Label contains characters outside a-z, 0-9, and hyphen",
    );
    expect(invalidLegacyNameReason("a".repeat(64) + ".xdc")).to.equal(
      "Label is longer than 63 characters",
    );
  });

  it("separates eligibility, invalid names, duplicates, and XDCID collisions", () => {
    const xdcid = new Map<string, XdcidRegistryRecord>([
      [
        "taken.xdc",
        {
          canonicalName: "taken.xdc",
          owner: OWNER_B,
          expiry: "9999999999",
        },
      ],
    ]);
    const report = buildMigrationReport(
      snapshot([
        record("1", "valid.xdc"),
        record("2", "ab.xdc"),
        record("3", "duplicate.xdc"),
        record("4", "duplicate.xdc", OWNER_B),
        record("5", "taken.xdc"),
      ]),
      "0x05fa64a05bc205DeDF47e023d2D90c2d119cd097",
      1_800_000_000,
      xdcid,
    );

    expect(report.counts).to.deep.equal({
      total: 5,
      eligible: 1,
      invalid: 1,
      legacyDuplicates: 2,
      xdcidCollisions: 1,
    });
    expect(report.eligible.map((item) => item.canonicalName)).to.deep.equal([
      "valid.xdc",
    ]);
    expect(report.legacyDuplicates[0].duplicateTokenIds).to.deep.equal([
      "3",
      "4",
    ]);
    expect(report.xdcidCollisions[0].xdcidOwner).to.equal(OWNER_B);
  });

  it("sorts output deterministically by canonical name and token ID", () => {
    const report = buildMigrationReport(
      snapshot([
        record("20", "zeta.xdc"),
        record("10", "alpha.xdc"),
        record("2", "middle.xdc"),
      ]),
      "0x05fa64a05bc205DeDF47e023d2D90c2d119cd097",
      1_800_000_000,
      new Map(),
    );

    expect(report.eligible.map((item) => item.canonicalName)).to.deep.equal([
      "alpha.xdc",
      "middle.xdc",
      "zeta.xdc",
    ]);
  });
});
