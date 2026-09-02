import { expect } from "chai";
import {
  archivePurchaseMessage,
  normalizeArchivePlanYears
} from "../frontend/lib/archiveSubscriptionPurchases";
import { isSameArchiveWallet } from "../frontend/lib/archiveAccessAdministrator";

describe("archive subscription purchase authorization", function () {
  it("accepts only the supported one, three, and seven year plans", function () {
    expect(normalizeArchivePlanYears(1)).to.equal(1);
    expect(normalizeArchivePlanYears("3")).to.equal(3);
    expect(normalizeArchivePlanYears(7)).to.equal(7);
    expect(() => normalizeArchivePlanYears(5)).to.throw(
      "Archive plan must be 1, 3, or 7 years"
    );
  });

  it("identifies treasury self-payments", function () {
    expect(isSameArchiveWallet(
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000001"
    )).to.equal(true);
    expect(isSameArchiveWallet(
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000002"
    )).to.equal(false);
  });

  it("binds a checkout signature to the wallet, price, chain, treasury, and expiry", function () {
    const message = archivePurchaseMessage({
      challengeId: "85f55445-50f1-49e4-a822-494655eca16c",
      wallet: "0x0000000000000000000000000000000000000001",
      planYears: 3,
      amountAtomic: 13_500_000n,
      chainId: 51,
      treasury: "0x0000000000000000000000000000000000000002",
      expiresAt: new Date("2030-01-01T00:00:00.000Z")
    });
    expect(message).to.include("Wallet: 0x0000000000000000000000000000000000000001");
    expect(message).to.include("Plan: 3 years");
    expect(message).to.include("Amount: 13500000 USDC atomic units");
    expect(message).to.include("Chain ID: 51");
    expect(message).to.include("Treasury: 0x0000000000000000000000000000000000000002");
    expect(message).to.include("Expires: 2030-01-01T00:00:00.000Z");
  });
});
