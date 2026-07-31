import { expect } from "chai";
import {
  ZERO_ADDRESS,
  LegacyDomainLog,
  assessLegacyIndexIntegrity,
  buildLegacyDomainSnapshot,
  canonicalizeLegacyName,
  findLegacyNameCollisions,
  inspectLegacyDomainSnapshot,
  legacyNameCompatibilityIssues,
} from "../scripts/lib/legacy-domain-index";

const OWNER_A = "0x1111111111111111111111111111111111111111";
const OWNER_B = "0x2222222222222222222222222222222222222222";

function transfer(
  tokenId: string,
  to: string,
  blockNumber: number,
  logIndex = 0,
  from = ZERO_ADDRESS,
): LegacyDomainLog {
  return {
    kind: "transfer",
    tokenId,
    from,
    to,
    blockNumber,
    transactionIndex: 0,
    logIndex,
  };
}

function newUri(
  tokenId: string,
  name: string,
  blockNumber: number,
  logIndex = 0,
): LegacyDomainLog {
  return {
    kind: "new-uri",
    tokenId,
    name,
    blockNumber,
    transactionIndex: 0,
    logIndex,
  };
}

describe("legacy domain index", () => {
  it("reconstructs the latest owner from unordered logs", () => {
    const snapshot = buildLegacyDomainSnapshot([
      transfer("7", OWNER_B, 3, 0, OWNER_A),
      newUri("7", "Alice.XDC", 2),
      transfer("7", OWNER_A, 1),
    ]);

    expect(snapshot).to.deep.equal([
      {
        tokenId: "7",
        name: "Alice.XDC",
        canonicalName: "alice.xdc",
        owner: OWNER_B,
        lastUpdatedBlock: 3,
      },
    ]);
  });

  it("excludes burned tokens", () => {
    const inventory = inspectLegacyDomainSnapshot([
      transfer("8", OWNER_A, 1),
      newUri("8", "burned.xdc", 2),
      transfer("8", ZERO_ADDRESS, 3, 0, OWNER_A),
    ]);

    expect(inventory.activeTokenCount).to.equal(0);
    expect(inventory.compatibleNames).to.deep.equal([]);
  });

  it("treats a token reminted after a burn as active", () => {
    const snapshot = buildLegacyDomainSnapshot([
      transfer("9", OWNER_A, 1),
      newUri("9", "reborn.xdc", 2),
      transfer("9", ZERO_ADDRESS, 3, 0, OWNER_A),
      transfer("9", OWNER_B, 4),
    ]);

    expect(snapshot[0].owner).to.equal(OWNER_B);
    expect(snapshot[0].canonicalName).to.equal("reborn.xdc");
  });

  it("canonicalizes names and reports canonical duplicates", () => {
    expect(canonicalizeLegacyName(" ALICE.XDC ")).to.equal("alice.xdc");

    const snapshot = buildLegacyDomainSnapshot([
      transfer("10", OWNER_A, 1),
      newUri("10", " ALICE.XDC ", 2),
      transfer("11", OWNER_B, 3),
      newUri("11", "alice.xdc", 4),
    ]);

    expect(findLegacyNameCollisions(snapshot)).to.deep.equal([
      {
        canonicalName: "alice.xdc",
        tokenIds: ["10", "11"],
        owners: [OWNER_A, OWNER_B],
      },
    ]);
  });

  it("separates incompatible, non-.xdc, and missing metadata", () => {
    const inventory = inspectLegacyDomainSnapshot([
      transfer("12", OWNER_A, 1),
      newUri("12", "not-a-domain", 2),
      transfer("13", OWNER_A, 3),
      newUri("13", "a.xdc", 4),
      transfer("14", OWNER_B, 5),
    ]);

    expect(inventory.activeTokenCount).to.equal(3);
    expect(inventory.namedActiveTokenCount).to.equal(2);
    expect(inventory.compatibleNames).to.deep.equal([]);
    expect(inventory.nonXdcTokenIds).to.deep.equal(["12"]);
    expect(inventory.missingMetadataTokenIds).to.deep.equal(["14"]);
    expect(inventory.legacyOnlyNames).to.deep.equal([
      {
        tokenId: "13",
        name: "a.xdc",
        canonicalName: "a.xdc",
        owner: OWNER_A,
        lastUpdatedBlock: 4,
        compatibilityIssues: ["label-too-short"],
      },
    ]);
  });

  it("uses the same label restrictions as XDCID", () => {
    expect(legacyNameCompatibilityIssues("valid-name.xdc")).to.deep.equal([]);
    expect(legacyNameCompatibilityIssues("-invalid.xdc")).to.include(
      "leading-or-trailing-hyphen",
    );
    expect(legacyNameCompatibilityIssues("naïve.xdc")).to.include(
      "invalid-label-characters",
    );
  });

  it("fails integrity when supply or metadata is incomplete", () => {
    const complete = inspectLegacyDomainSnapshot([
      transfer("15", OWNER_A, 1),
      newUri("15", "complete.xdc", 2),
    ]);
    expect(assessLegacyIndexIntegrity(complete, "1")).to.deep.equal({
      passed: true,
      totalSupplyRead: true,
      supplyMatchesActiveTokens: true,
      allActiveTokensHaveMetadata: true,
      failures: [],
    });

    expect(assessLegacyIndexIntegrity(complete, "2").failures).to.deep.equal([
      "active-token-count-does-not-match-total-supply",
    ]);

    const incomplete = inspectLegacyDomainSnapshot([
      transfer("16", OWNER_A, 1),
    ]);
    expect(assessLegacyIndexIntegrity(incomplete, null).failures).to.deep.equal([
      "legacy-total-supply-unavailable",
      "active-tokens-missing-name-metadata",
    ]);
  });
});
