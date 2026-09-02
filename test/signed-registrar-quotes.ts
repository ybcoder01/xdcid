import { expect } from "chai";
import { zeroAddress } from "viem";
import {
  buildRegistrarQuote,
  calculateBufferedXdcWeiForPolicy,
  LEGACY_SIGNED_QUOTE_DOMAIN_NAME,
  normalizeSignedQuoteRequest,
  SIGNED_QUOTE_DOMAIN_NAME,
  SIGNED_QUOTE_LIFETIME_SECONDS,
} from "../frontend/lib/signedRegistrarQuotes";

describe("signed registrar quote helpers", function () {
  const payer = "0x0000000000000000000000000000000000000001";
  const nameOwner = "0x0000000000000000000000000000000000000002";

  it("keeps legacy and v2 EIP-712 domains distinct", function () {
    expect(LEGACY_SIGNED_QUOTE_DOMAIN_NAME).to.equal(
      "XDCID Signed Quote Registrar",
    );
    expect(SIGNED_QUOTE_DOMAIN_NAME).to.equal("XDCID Registrar V2");
  });

  it("canonicalizes and validates quote requests", function () {
    const request = normalizeSignedQuoteRequest({
      name: "Example.XDC",
      product: "registration",
      termYears: 5,
      paymentCurrency: "xdc",
      payer,
      nameOwner,
    });

    expect(request.name).to.equal("example.xdc");
    expect(request.labelLength).to.equal(7);
    expect(request.productId).to.equal(0);
    expect(request.paymentCurrency).to.equal("XDC");
  });

  it("accepts and canonicalizes two-character names for registrar v2", function () {
    const request = normalizeSignedQuoteRequest({
      name: "AB.XDC",
      product: "registration",
      termYears: 10,
      paymentCurrency: "USDC",
      payer,
      nameOwner,
    });

    expect(request.name).to.equal("ab.xdc");
    expect(request.labelLength).to.equal(2);
    expect(request.termYears).to.equal(10);
  });

  it("builds the exact contract typed-data shape and ten-minute lifetime", function () {
    const request = normalizeSignedQuoteRequest({
      name: "example.xdc",
      product: "renewal",
      termYears: 3,
      paymentCurrency: "USDC",
      payer,
      nameOwner: payer,
    });
    const quote = buildRegistrarQuote({
      request,
      paymentToken: zeroAddress,
      paymentAmount: 13_500_000n,
      usdMicros: 13_500_000n,
      policyVersion: 4n,
      nonce: 9n,
      issuedAt: 1_000,
    });

    expect(quote.product).to.equal(1);
    expect(quote.termYears).to.equal(3n);
    expect(quote.nonce).to.equal(9n);
    expect(quote.deadline - quote.issuedAt).to.equal(
      BigInt(SIGNED_QUOTE_LIFETIME_SECONDS),
    );
  });

  it("uses the on-chain buffer and always rounds XDC upward", function () {
    expect(
      calculateBufferedXdcWeiForPolicy(5_000_000n, 25_000n, 200n),
    ).to.equal(204n * 10n ** 18n);
    expect(() =>
      calculateBufferedXdcWeiForPolicy(5_000_000n, 25_000n, 2_001n),
    ).to.throw("outside the policy limit");
  });

  it("rejects unsupported products, currencies, terms, and addresses", function () {
    const base = {
      name: "example.xdc",
      product: "registration",
      termYears: 1,
      paymentCurrency: "XDC",
      payer,
      nameOwner,
    };

    expect(() =>
      normalizeSignedQuoteRequest({ ...base, product: "migration" }),
    ).to.throw("registration or renewal");
    expect(() =>
      normalizeSignedQuoteRequest({ ...base, paymentCurrency: "ETH" }),
    ).to.throw("XDC or USDC");
    expect(() =>
      normalizeSignedQuoteRequest({ ...base, termYears: 2 }),
    ).to.throw("1, 3, 5, or 10");
    expect(() =>
      normalizeSignedQuoteRequest({ ...base, payer: "not-an-address" }),
    ).to.throw("valid address");
  });
});
