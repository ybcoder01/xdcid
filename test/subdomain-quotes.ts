import { expect } from "chai";
import { getAddress, keccak256, toBytes, zeroAddress } from "viem";
import {
  buildSubdomainQuote,
  normalizeSubdomainQuoteRequest,
  SUBDOMAIN_QUOTE_LIFETIME_SECONDS,
} from "../frontend/lib/subdomainQuotes";

describe("server-signed subdomain quotes", function () {
  const payer = getAddress("0x0000000000000000000000000000000000000011");
  const owner = getAddress("0x0000000000000000000000000000000000000022");

  it("canonicalizes a regular-user registration request", function () {
    const request = normalizeSubdomainQuoteRequest({
      parentName: "Company.XDC",
      label: "Alice",
      action: "registration",
      termYears: 3,
      paymentCurrency: "xdc",
      payer,
      subdomainOwner: owner,
    });
    expect(request).to.deep.include({
      parentName: "company.xdc",
      label: "alice",
      fullName: "alice.company.xdc",
      action: "registration",
      termYears: 3,
      paymentCurrency: "XDC",
      payer,
      subdomainOwner: owner,
    });
  });

  it("builds the exact contract-bound nodes and ten-minute lifetime", function () {
    const request = normalizeSubdomainQuoteRequest({
      parentName: "company.xdc",
      label: "pay",
      action: "renewal",
      termYears: 1,
      paymentCurrency: "USDC",
      payer,
      subdomainOwner: owner,
    });
    const quote = buildSubdomainQuote({
      request,
      paymentToken: zeroAddress,
      paymentAmount: 10n,
      usdMicros: 1_000_000n,
      policyVersion: 4n,
      nonce: 7n,
      issuedAt: 1_000,
    });
    expect(quote.parentNode).to.equal(keccak256(toBytes("company.xdc")));
    expect(quote.node).to.equal(keccak256(toBytes("pay.company.xdc")));
    expect(quote.deadline - quote.issuedAt).to.equal(
      BigInt(SUBDOMAIN_QUOTE_LIFETIME_SECONDS),
    );
  });

  for (const label of ["", "-alice", "alice-", "alice.test", "a".repeat(64)]) {
    it(`rejects invalid label ${JSON.stringify(label)}`, function () {
      expect(() => normalizeSubdomainQuoteRequest({
        parentName: "company.xdc",
        label,
        action: "registration",
        termYears: 1,
        paymentCurrency: "XDC",
        payer,
        subdomainOwner: owner,
      })).to.throw();
    });
  }
});
