import { expect } from "chai";
import { getAddress, keccak256, toBytes } from "viem";
import {
  applyDomainDiscount,
  buildDomainDiscountAuthorization,
  deserializeDomainDiscountAuthorization,
  domainDiscountTypedData,
  serializeDomainDiscountAuthorization,
} from "../frontend/lib/domainDiscounts";

const beneficiary = getAddress("0x00000000000000000000000000000000000000a1");
const authorizationContract = getAddress(
  "0x00000000000000000000000000000000000000b2",
);

describe("domain discount grants", function () {
  it("binds a grant to the canonical name, beneficiary, product, and term", function () {
    const built = buildDomainDiscountAuthorization({
      name: "Example.XDC",
      beneficiary,
      termYears: 1,
      discountBps: 10_000,
      maxUses: 1,
      validAfter: 1_000,
      deadline: 2_000,
      nonce: 123n,
    });

    expect(built.name).to.equal("example.xdc");
    expect(built.authorization).to.deep.include({
      node: keccak256(toBytes("example.xdc")),
      beneficiary,
      product: 0,
      termYears: 1n,
      discountBps: 10_000,
      maxUses: 1,
      validAfter: 1_000n,
      deadline: 2_000n,
      nonce: 123n,
    });
  });

  it("round-trips grants without losing bigint fields", function () {
    const original = buildDomainDiscountAuthorization({
      name: "discounted",
      beneficiary,
      termYears: 3,
      discountBps: 2_500,
      maxUses: 2,
      validAfter: 1_000,
      deadline: 2_000,
      nonce: 456n,
    }).authorization;

    expect(
      deserializeDomainDiscountAuthorization(
        serializeDomainDiscountAuthorization(original),
      ),
    ).to.deep.equal(original);
  });

  it("creates contract-compatible EIP-712 domain data", function () {
    const authorization = buildDomainDiscountAuthorization({
      name: "typed-data",
      beneficiary,
      termYears: 5,
      discountBps: 500,
      maxUses: 1,
      validAfter: 1_000,
      deadline: 2_000,
      nonce: 789n,
    }).authorization;
    const typedData = domainDiscountTypedData({
      chainId: 50,
      authorizationContract,
      authorization,
    });

    expect(typedData.domain).to.deep.equal({
      name: "XDCID Discount Authorization",
      version: "1",
      chainId: 50,
      verifyingContract: authorizationContract,
    });
    expect(typedData.message).to.equal(authorization);
  });

  it("applies full discounts and rounds partial micro-dollar totals upward", function () {
    expect(applyDomainDiscount(20_000_000n, 10_000)).to.equal(0n);
    expect(applyDomainDiscount(3n, 3_333)).to.equal(3n);
    expect(applyDomainDiscount(20_000_000n, 2_500)).to.equal(15_000_000n);
  });

  it("rejects grants with unsafe scope", function () {
    expect(() => buildDomainDiscountAuthorization({
      name: "-invalid",
      beneficiary,
      termYears: 1,
      discountBps: 10_000,
      maxUses: 1,
      validAfter: 1_000,
      deadline: 2_000,
      nonce: 1n,
    })).to.throw("Name cannot start or end with a hyphen");
    expect(() => buildDomainDiscountAuthorization({
      name: "valid-name",
      beneficiary,
      termYears: 2,
      discountBps: 10_000,
      maxUses: 1,
      validAfter: 1_000,
      deadline: 2_000,
      nonce: 1n,
    })).to.throw("Term must be 1, 3, 5, or 10 years");
    expect(() => buildDomainDiscountAuthorization({
      name: "valid-name",
      beneficiary,
      termYears: 1,
      discountBps: 10_001,
      maxUses: 1,
      validAfter: 1_000,
      deadline: 2_000,
      nonce: 1n,
    })).to.throw("Discount must be between 0.01% and 100%");
  });
});
