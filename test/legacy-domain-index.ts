import { expect } from "chai";
import {
  ZERO_ADDRESS,
  LegacyDomainLog,
  buildLegacyDomainSnapshot,
  canonicalizeLegacyName,
  findLegacyNameCollisions,
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
    const snapshot = buildLegacyDomainSnapshot([
      transfer("8", OWNER_A, 1),
      newUri("8", "burned.xdc", 2),
      transfer("8", ZERO_ADDRESS, 3, 0, OWNER_A),
    ]);

    expect(snapshot).to.deep.equal([]);
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

  it("filters non-.xdc metadata from the active-name view", () => {
    const snapshot = buildLegacyDomainSnapshot([
      transfer("12", OWNER_A, 1),
      newUri("12", "not-a-domain", 2),
    ]);

    expect(snapshot).to.deep.equal([]);
  });
});
