import { expect } from "chai";
import { zeroAddress, type Address, type Hex } from "viem";
import { paymentRequestId } from "../frontend/lib/paymentCancellation";
import {
  validatePayLinkSettlementClaim,
  type PayLinkSettlementClaim
} from "../frontend/lib/payLinkSettlement";
import {
  PAYMENT_REQUEST_CHAIN_ID,
  type PaymentRequest
} from "../frontend/lib/paymentRequests";

describe("Pay Link settlement claims", function () {
  const request: PaymentRequest = {
    version: 2,
    chainId: PAYMENT_REQUEST_CHAIN_ID,
    sourceChainId: 50,
    destinationChainId: 50,
    transferMode: "direct",
    name: "alice.xdc",
    amount: "0.01",
    token: "USDC",
    reference: "ORDER-1",
    description: "",
    payer: zeroAddress,
    issuedAt: Math.floor(Date.now() / 1000),
    expires: 0,
    nonce: ("0x" + "11".repeat(32)) as Hex
  };
  const claim: PayLinkSettlementClaim = {
    requestId: paymentRequestId(request),
    name: request.name,
    sourceChainId: 50,
    destinationChainId: 50,
    token: "USDC",
    amountAtomic: "10000",
    payer: "0x00000000000000000000000000000000000000AA" as Address
  };

  it("accepts a verified settlement that exactly matches the signed request", function () {
    expect(validatePayLinkSettlementClaim(request, claim)).to.equal(undefined);
  });

  it("rejects a different request, route, asset, amount, or name", function () {
    expect(validatePayLinkSettlementClaim(request, {
      ...claim,
      requestId: ("0x" + "22".repeat(32)) as Hex
    })).to.match(/does not match/);
    expect(validatePayLinkSettlementClaim(request, {
      ...claim,
      destinationChainId: 8453
    })).to.match(/route/);
    expect(validatePayLinkSettlementClaim(request, {
      ...claim,
      token: "NATIVE"
    })).to.match(/asset/);
    expect(validatePayLinkSettlementClaim(request, {
      ...claim,
      amountAtomic: "10001"
    })).to.match(/amount/);
    expect(validatePayLinkSettlementClaim(request, {
      ...claim,
      name: "mallory.xdc"
    })).to.match(/recipient name/);
  });

  it("enforces a designated payer", function () {
    const designated = {
      ...request,
      payer: "0x00000000000000000000000000000000000000bb" as Address
    };
    expect(validatePayLinkSettlementClaim(designated, {
      ...claim,
      requestId: paymentRequestId(designated)
    })).to.match(/designated/);
  });
});
