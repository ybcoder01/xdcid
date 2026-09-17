import { expect } from "chai";
import { getCctpTimingNotice } from "../frontend/lib/cctpTiming";

describe("CCTP timing guidance", function () {
  for (const [chainId, name] of [
    [1, "Ethereum"],
    [8453, "Base"],
    [42161, "Arbitrum One"]
  ] as const) {
    it(`allows 15–20 minutes from ${name}`, function () {
      const notice = getCctpTimingNotice(chainId, name);

      expect(notice.estimate).to.equal("Allow about 15–20 minutes");
      expect(notice.detail).to.include(name);
      expect(notice.detail).to.include("hard finality");
    });
  }

  it("uses Circle's published XDC attestation average", function () {
    const notice = getCctpTimingNotice(50, "XDC Network");

    expect(notice.estimate).to.equal("Usually completes within a few minutes");
    expect(notice.detail).to.include("about 10 seconds");
  });

  it("uses Circle's published Polygon PoS attestation average", function () {
    const notice = getCctpTimingNotice(137, "Polygon");

    expect(notice.estimate).to.equal("Usually completes within a few minutes");
    expect(notice.detail).to.include("about 8 seconds");
  });

  it("does not promise an estimate for an unclassified source", function () {
    const notice = getCctpTimingNotice(84532, "Base Sepolia");

    expect(notice.estimate).to.equal("Completion time varies");
    expect(notice.detail).to.include("Base Sepolia");
  });
});
