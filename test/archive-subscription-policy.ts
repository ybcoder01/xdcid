import { expect } from "chai";
import { archivePlanQuotes } from "../frontend/lib/historyAccessPolicy";

describe("archive subscription pricing policy", function () {
  it("keeps prices unset until the admin configures an annual price", function () {
    expect(archivePlanQuotes({
      oneYearPriceUsdMicros: null,
      threeYearDiscountBps: 0,
      sevenYearDiscountBps: 0
    })).to.deep.equal([
      { years: 1, regularPriceUsdMicros: null, discountBps: 0, payableUsdMicros: null },
      { years: 3, regularPriceUsdMicros: null, discountBps: 0, payableUsdMicros: null },
      { years: 7, regularPriceUsdMicros: null, discountBps: 0, payableUsdMicros: null }
    ]);
  });

  it("derives three and seven year totals from the configurable annual price and discounts", function () {
    expect(archivePlanQuotes({
      oneYearPriceUsdMicros: 5_000_000,
      threeYearDiscountBps: 1_000,
      sevenYearDiscountBps: 2_000
    })).to.deep.equal([
      { years: 1, regularPriceUsdMicros: 5_000_000, discountBps: 0, payableUsdMicros: 5_000_000 },
      { years: 3, regularPriceUsdMicros: 15_000_000, discountBps: 1_000, payableUsdMicros: 13_500_000 },
      { years: 7, regularPriceUsdMicros: 35_000_000, discountBps: 2_000, payableUsdMicros: 28_000_000 }
    ]);
  });

  it("rounds fractional micro-USDC totals upward", function () {
    const quote = archivePlanQuotes({
      oneYearPriceUsdMicros: 1,
      threeYearDiscountBps: 3_333,
      sevenYearDiscountBps: 3_333
    })[1];
    expect(quote.payableUsdMicros).to.equal(3);
  });
});
