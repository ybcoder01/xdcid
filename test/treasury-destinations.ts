import { expect } from "chai";
import { buildTreasuryDestinationReport } from "../frontend/lib/treasuryDestinations";

describe("treasury destination reporting", function () {
  const treasury = "0xe82a4267CC310FC6Db334601671A043DFc8Ce06A";
  const other = "0x9c67d6cfE6A73497e7348b6b852495CA6236C29a";

  it("reports alignment when every revenue source uses one treasury", function () {
    const report = buildTreasuryDestinationReport({
      registrationTreasury: treasury,
      archiveTreasury: treasury.toLowerCase(),
      forwardingFeeRecipient: treasury,
    });

    expect(report.aligned).to.equal(true);
    expect(report.destinations.every((item) => item.status === "matched")).to.equal(true);
  });

  it("reports missing and mismatched destinations independently", function () {
    const report = buildTreasuryDestinationReport({
      registrationTreasury: treasury,
      archiveTreasury: "",
      forwardingFeeRecipient: other,
    });

    expect(report.aligned).to.equal(false);
    expect(report.destinations.map((item) => item.status)).to.deep.equal([
      "matched",
      "missing",
      "mismatched",
    ]);
  });
});
