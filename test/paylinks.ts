import { expect } from "chai";
import {
  buildPayLink,
  normalizePayToken,
  parsePayAmount,
  validatePayAmount,
  validatePayExpiry,
  validatePayMemo,
} from "../frontend/lib/paylinks";

describe("Pay Links", function () {
  it("normalizes supported payment tokens", function () {
    expect(normalizePayToken("usdc")).to.equal("USDC");
    expect(normalizePayToken("XDC")).to.equal("XDC");
    expect(normalizePayToken("unknown")).to.equal("XDC");
  });

  it("validates positive token amounts and precision", function () {
    expect(validatePayAmount("1.25", "XDC")).to.equal(undefined);
    expect(validatePayAmount("1.000001", "USDC")).to.equal(undefined);
    expect(validatePayAmount("0", "XDC")).to.equal("Amount must be greater than zero.");
    expect(validatePayAmount("-1", "XDC")).to.not.equal(undefined);
    expect(validatePayAmount("1e6", "USDC")).to.not.equal(undefined);
    expect(validatePayAmount("1.0000001", "USDC")).to.equal("USDC supports up to 6 decimal places.");
    expect(parsePayAmount("1.25", "USDC")).to.equal(1_250_000n);
  });

  it("validates public memo and request expiry limits", function () {
    expect(validatePayMemo("Invoice 104")).to.equal(undefined);
    expect(validatePayMemo("x".repeat(121))).to.equal("Memo must be 120 characters or fewer.");
    expect(validatePayExpiry("200", 100)).to.equal(undefined);
    expect(validatePayExpiry("100", 100)).to.equal("This payment request has expired.");
    expect(validatePayExpiry("not-a-time", 100)).to.equal("Payment link expiry is invalid.");
  });

  it("builds a deterministic URL-only payment request", function () {
    const link = buildPayLink("https://xdcid.com", {
      name: "alice.xdc",
      amount: "25.00",
      token: "USDC",
      memo: "Invoice 104",
      expires: "200",
    });
    const url = new URL(link);

    expect(url.pathname).to.equal("/pay/alice.xdc");
    expect(url.searchParams.get("amount")).to.equal("25.00");
    expect(url.searchParams.get("token")).to.equal("USDC");
    expect(url.searchParams.get("memo")).to.equal("Invoice 104");
    expect(url.searchParams.get("expires")).to.equal("200");
  });
});
