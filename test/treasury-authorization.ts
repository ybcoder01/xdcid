import { expect } from "chai";
import { authorizedTreasuryAddresses } from "../frontend/lib/treasuryAuthorization";

describe("treasury administrator authorization", function () {
  const archiveTreasury = "0x1111111111111111111111111111111111111111";
  const registrationTreasury = "0x2222222222222222222222222222222222222222";

  it("recognizes the archive and active registration treasury independently", function () {
    expect(
      authorizedTreasuryAddresses({ archiveTreasury, registrationTreasury }),
    ).to.have.members([archiveTreasury, registrationTreasury]);
  });

  it("deduplicates a wallet that serves as both treasuries", function () {
    expect(
      authorizedTreasuryAddresses({
        archiveTreasury,
        registrationTreasury: archiveTreasury,
      }),
    ).to.deep.equal([archiveTreasury]);
  });

  it("ignores missing or invalid configuration values", function () {
    expect(
      authorizedTreasuryAddresses({
        archiveTreasury: "not-an-address",
        registrationTreasury: null,
      }),
    ).to.deep.equal([]);
  });
});
