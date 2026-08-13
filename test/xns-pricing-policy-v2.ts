import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("XNSPricingPolicyV2", function () {
  async function deployPolicy() {
    const [owner, signer, nextSigner, treasury, usdc, other] =
      await ethers.getSigners();
    const config = {
      twoCharacterAnnualUsdMicros: 50_000_000,
      threeCharacterAnnualUsdMicros: 20_000_000,
      fourCharacterAnnualUsdMicros: 10_000_000,
      standardAnnualUsdMicros: 5_000_000,
      subdomainAnnualUsdMicros: 1_000_000,
      premiumSubdomainAnnualUsdMicros: 5_000_000,
      migrationUsdMicros: 3_000_000,
      threeYearDiscountBps: 1_000,
      fiveYearDiscountBps: 1_500,
      tenYearDiscountBps: 2_000,
      xdcQuoteBufferBps: 200,
      quoteSigner: signer.address,
      usdcToken: usdc.address,
      treasury: treasury.address,
      xdcPaymentsEnabled: true,
      usdcPaymentsEnabled: true,
    };
    const factory = await ethers.getContractFactory("XNSPricingPolicyV2");
    const policy = await factory.deploy(config, owner.address);
    return { policy, config, owner, signer, nextSigner, treasury, usdc, other };
  }

  it("starts two-character names at $50", async function () {
    const { policy } = await deployPolicy();
    expect(await policy.priceUsdMicros(0, 2, 1)).to.equal(50_000_000);
    expect(await policy.priceUsdMicros(0, 2, 10)).to.equal(400_000_000);
    expect(await policy.priceUsdMicros(1, 2, 10)).to.equal(400_000_000);
  });

  it("retains the existing top-level pricing tiers", async function () {
    const { policy } = await deployPolicy();
    expect(await policy.priceUsdMicros(0, 3, 1)).to.equal(20_000_000);
    expect(await policy.priceUsdMicros(0, 4, 1)).to.equal(10_000_000);
    expect(await policy.priceUsdMicros(0, 5, 1)).to.equal(5_000_000);
    expect(await policy.priceUsdMicros(1, 5, 5)).to.equal(21_250_000);
    expect(await policy.priceUsdMicros(4, 0, 0)).to.equal(3_000_000);
  });

  it("prices general and premium subdomain products independently", async function () {
    const { policy } = await deployPolicy();
    expect(await policy.priceUsdMicros(2, 0, 1)).to.equal(1_000_000);
    expect(await policy.priceUsdMicros(3, 0, 1)).to.equal(5_000_000);
    expect(await policy.priceUsdMicros(2, 0, 10)).to.equal(8_000_000);
    expect(await policy.priceUsdMicros(3, 0, 10)).to.equal(40_000_000);
  });

  it("allows delayed adjustment of the two-character price", async function () {\n    const { policy, config } = await deployPolicy();\n    await expect(\n      policy.proposeConfig({\n        ...config,\n        twoCharacterAnnualUsdMicros: 75_000_000,\n      }),\n    ).to.emit(policy, "PricingConfigProposed");\n  });\n\n  it("allows delayed admin price changes", async function () {
    const { policy, config, other } = await deployPolicy();
    const nextConfig = {
      ...config,
      twoCharacterAnnualUsdMicros: 125_000_000,
      subdomainAnnualUsdMicros: 2_000_000,
      premiumSubdomainAnnualUsdMicros: 8_000_000,
    };

    await expect(policy.connect(other).proposeConfig(nextConfig))
      .to.be.revertedWithCustomError(policy, "OwnableUnauthorizedAccount");
    await expect(policy.proposeConfig(nextConfig))
      .to.emit(policy, "PricingConfigProposed");
    await expect(policy.activatePendingConfig())
      .to.be.revertedWithCustomError(policy, "UpdateDelayActive");

    await time.increase(48 * 60 * 60);
    await expect(policy.connect(other).activatePendingConfig())
      .to.emit(policy, "PricingConfigActivated")
      .withArgs(2, await policy.hashConfig(nextConfig));

    expect(await policy.priceUsdMicros(0, 2, 1)).to.equal(125_000_000);
    expect(await policy.priceUsdMicros(2, 0, 1)).to.equal(2_000_000);
    expect(await policy.priceUsdMicros(3, 0, 1)).to.equal(8_000_000);
  });

  it("supports cancellation and quote-signer grace", async function () {
    const { policy, config, signer, nextSigner } = await deployPolicy();
    await policy.proposeConfig({
      ...config,
      twoCharacterAnnualUsdMicros: 110_000_000,
    });
    await policy.cancelPendingConfig();
    expect(await policy.hasPendingConfig()).to.equal(false);

    await policy.proposeConfig({ ...config, quoteSigner: nextSigner.address });
    await time.increase(48 * 60 * 60);
    await policy.activatePendingConfig();

    expect(await policy.isQuoteAuthorizationValid(nextSigner.address, 2)).to.equal(true);
    expect(await policy.isQuoteAuthorizationValid(signer.address, 1)).to.equal(true);
    await time.increase(5 * 60 + 1);
    expect(await policy.isQuoteAuthorizationValid(signer.address, 1)).to.equal(false);
  });

  it("rejects unsupported terms and label lengths", async function () {
    const { policy } = await deployPolicy();
    await expect(policy.priceUsdMicros(0, 1, 1))
      .to.be.revertedWithCustomError(policy, "InvalidLabelLength");
    await expect(policy.priceUsdMicros(0, 64, 1))
      .to.be.revertedWithCustomError(policy, "InvalidLabelLength");
    await expect(policy.priceUsdMicros(0, 2, 2))
      .to.be.revertedWithCustomError(policy, "InvalidTerm");
    await expect(policy.priceUsdMicros(4, 0, 1))
      .to.be.revertedWithCustomError(policy, "InvalidTerm");
  });
});
