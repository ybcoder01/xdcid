import { expect } from "chai";
import {
  PRICING_POLICY,
  annualNamePriceUsdMicros,
  calculateBufferedXdcWei,
  calculateUsdPrice,
} from "../frontend/lib/pricingPolicy";

describe("pricing policy foundation", function () {
  it("prices names by canonical label length", function () {
    expect(annualNamePriceUsdMicros(3)).to.equal(20_000_000n);
    expect(annualNamePriceUsdMicros(4)).to.equal(10_000_000n);
    expect(annualNamePriceUsdMicros(5)).to.equal(5_000_000n);
    expect(annualNamePriceUsdMicros(63)).to.equal(5_000_000n);
  });

  it("applies the agreed multi-year discounts", function () {
    expect(
      calculateUsdPrice({
        product: "registration",
        labelLength: 5,
        years: 1,
      }).totalUsdMicros,
    ).to.equal(5_000_000n);
    expect(
      calculateUsdPrice({
        product: "registration",
        labelLength: 5,
        years: 3,
      }).totalUsdMicros,
    ).to.equal(13_500_000n);
    expect(
      calculateUsdPrice({
        product: "registration",
        labelLength: 5,
        years: 5,
      }).totalUsdMicros,
    ).to.equal(21_250_000n);
    expect(
      calculateUsdPrice({
        product: "registration",
        labelLength: 5,
        years: 10,
      }).totalUsdMicros,
    ).to.equal(40_000_000n);
  });

  it("uses the same rules for purchase and renewal", function () {
    const registration = calculateUsdPrice({
      product: "registration",
      labelLength: 3,
      years: 5,
    });
    const renewal = calculateUsdPrice({
      product: "renewal",
      labelLength: 3,
      years: 5,
    });
    expect(renewal.totalUsdMicros).to.equal(registration.totalUsdMicros);
  });

  it("charges every subdomain and discounts longer terms", function () {
    expect(
      calculateUsdPrice({ product: "subdomain", years: 1 }).totalUsdMicros,
    ).to.equal(1_000_000n);
    expect(
      calculateUsdPrice({ product: "subdomain", years: 10 }).totalUsdMicros,
    ).to.equal(8_000_000n);
  });

  it("uses a fixed migration fee without a term discount", function () {
    const migration = calculateUsdPrice({ product: "migration" });
    expect(migration.totalUsdMicros).to.equal(3_000_000n);
    expect(migration.years).to.equal(null);
  });

  it("rounds XDC requirements upward and applies the quote buffer", function () {
    const wei = calculateBufferedXdcWei(5_000_000n, 25_000n);
    expect(wei).to.equal(204n * 10n ** 18n);
    expect(PRICING_POLICY.xdcQuoteBufferBps).to.equal(200n);
  });

  it("rejects unsupported lengths and terms", function () {
    expect(() => annualNamePriceUsdMicros(2)).to.throw(
      "between 3 and 63",
    );
    expect(() =>
      calculateUsdPrice({
        product: "registration",
        labelLength: 5,
        years: 2,
      }),
    ).to.throw("1, 3, 5, or 10");
  });
});
