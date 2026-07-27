import { expect } from "chai";
import { ethers } from "hardhat";
import { zeroAddress, type Hex } from "viem";
import {
  buildSignedPaymentLink,
  decodePaymentRequest,
  encodePaymentRequest,
  isDesignatedPayer,
  paymentRequestTypedData,
  recoverPaymentRequestSigner,
  validatePaymentRequest,
  type PaymentRequest,
} from "../frontend/lib/paymentRequests";

describe("Signed payment requests", function () {
  function validRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
    const now = Math.floor(Date.now() / 1000);
    return {
      version: 1,
      chainId: 50,
      name: "alice.xdc",
      amount: "25.00",
      token: "USDC",
      reference: "ORDER-104",
      description: "Consulting services",
      payer: zeroAddress,
      issuedAt: now,
      expires: now + 3600,
      nonce: ("0x" + "11".repeat(32)) as Hex,
      ...overrides,
    };
  }

  it("encodes and decodes a versioned request", function () {
    const request = validRequest();
    expect(decodePaymentRequest(encodePaymentRequest(request))).to.deep.equal(request);
  });

  it("recovers the wallet that signed the request", async function () {
    const [owner] = await ethers.getSigners();
    const request = validRequest();
    const typedData = paymentRequestTypedData(request);
    const signature = await owner.signTypedData(
      typedData.domain,
      { PaymentRequest: [...typedData.types.PaymentRequest] },
      typedData.message,
    );

    expect(await recoverPaymentRequestSigner(request, signature as Hex)).to.equal(await owner.getAddress());
  });

  it("does not validate a signature after a request is changed", async function () {
    const [owner] = await ethers.getSigners();
    const request = validRequest();
    const typedData = paymentRequestTypedData(request);
    const signature = await owner.signTypedData(
      typedData.domain,
      { PaymentRequest: [...typedData.types.PaymentRequest] },
      typedData.message,
    );
    const changed = { ...request, amount: "250.00" };

    expect(await recoverPaymentRequestSigner(changed, signature as Hex)).to.not.equal(await owner.getAddress());
  });

  it("validates network, expiry, payer, reference, and nonce", function () {
    const now = Math.floor(Date.now() / 1000);
    expect(validatePaymentRequest(validRequest(), now)).to.equal(undefined);
    expect(validatePaymentRequest({ ...validRequest(), chainId: 51 } as PaymentRequest, now)).to.equal("Payment request is for the wrong network.");
    expect(validatePaymentRequest(validRequest({ expires: now }), now)).to.equal("This payment request has expired.");
    expect(validatePaymentRequest(validRequest({ payer: "0x1234" as Hex }), now)).to.equal("Designated payer address is invalid.");
    expect(validatePaymentRequest(validRequest({ reference: "" }), now)).to.equal("Payment reference is required.");
    expect(validatePaymentRequest(validRequest({ nonce: "0x12" }), now)).to.equal("Payment request nonce is invalid.");
  });

  it("enforces an optional designated payer", function () {
    const payer = "0x00000000000000000000000000000000000000AA";
    expect(isDesignatedPayer(validRequest(), undefined)).to.equal(true);
    expect(isDesignatedPayer(validRequest({ payer }), payer)).to.equal(true);
    expect(isDesignatedPayer(validRequest({ payer }), "0x00000000000000000000000000000000000000bb")).to.equal(false);
  });

  it("builds a link containing only the encoded request and signature", function () {
    const request = validRequest();
    const signature = ("0x" + "22".repeat(65)) as Hex;
    const url = new URL(buildSignedPaymentLink("https://xdcid.com", request, signature));

    expect(url.pathname).to.equal("/pay/alice.xdc");
    expect(decodePaymentRequest(url.searchParams.get("request") || "")).to.deep.equal(request);
    expect(url.searchParams.get("signature")).to.equal(signature);
    expect(url.searchParams.has("amount")).to.equal(false);
  });
});
