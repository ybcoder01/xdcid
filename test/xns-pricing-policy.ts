import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("XNSPricingPolicy", function () {
  async function deployPolicy() {
    const [owner, signer, nextSigner, treasury, usdc, other] =
      await ethers.getSigners();
    const config = {
      threeCharacterAnnualUsdMicros: 20_000_000,
      fourCharacterAnnualUsdMicros: 10_000_000,
      standardAnnualUsdMicros: 5_000_000,
      subdomainAnnualUsdMicros: 1_000_000,
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
    const factory = await ethers.getContractFactory("XNSPricingPolicy");
    const policy = await factory.deploy(config, owner.address);
    return {
      policy,
      config,
      owner,
      signer,
      nextSigner,
      treasury,
      usdc,
      other,
    };
  }

  it("publishes the agreed initial prices and discounts", async function () {
    const { policy } = await deployPolicy();
    expect(await policy.priceUsdMicros(0, 3, 1)).to.equal(20_000_000);
    expect(await policy.priceUsdMicros(0, 4, 1)).to.equal(10_000_000);
    expect(await policy.priceUsdMicros(0, 5, 1)).to.equal(5_000_000);
    expect(await policy.priceUsdMicros(1, 5, 5)).to.equal(21_250_000);
    expect(await policy.priceUsdMicros(2, 0, 10)).to.equal(8_000_000);
    expect(await policy.priceUsdMicros(3, 0, 0)).to.equal(3_000_000);
  });

  it("rejects unsupported terms and label lengths", async function () {
    const { policy } = await deployPolicy();
    await expect(policy.priceUsdMicros(0, 2, 1))
      .to.be.revertedWithCustomError(policy, "InvalidLabelLength");
    await expect(policy.priceUsdMicros(0, 5, 2))
      .to.be.revertedWithCustomError(policy, "InvalidTerm");
    await expect(policy.priceUsdMicros(3, 0, 1))
      .to.be.revertedWithCustomError(policy, "InvalidTerm");
  });

  it("requires the owner and enforces the update delay", async function () {
    const { policy, config, nextSigner, other } = await deployPolicy();
    const nextConfig = {
      ...config,
      standardAnnualUsdMicros: 7_000_000,
      quoteSigner: nextSigner.address,
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

    expect(await policy.version()).to.equal(2);
    expect(await policy.priceUsdMicros(0, 5, 1)).to.equal(7_000_000);
  });

  it("allows the owner to cancel a pending update", async function () {
    const { policy, config } = await deployPolicy();
    await policy.proposeConfig({
      ...config,
      migrationUsdMicros: 4_000_000,
    });
    await expect(policy.cancelPendingConfig())
      .to.emit(policy, "PricingConfigCancelled")
      .withArgs(2);
    expect(await policy.hasPendingConfig()).to.equal(false);
    await expect(policy.activatePendingConfig())
      .to.be.revertedWithCustomError(policy, "NoPendingConfig");
  });

  it("keeps previous-version quotes valid for five minutes", async function () {
    const { policy, config, signer, nextSigner } = await deployPolicy();
    await policy.proposeConfig({
      ...config,
      quoteSigner: nextSigner.address,
    });
    await time.increase(48 * 60 * 60);
    await policy.activatePendingConfig();

    expect(
      await policy.isQuoteAuthorizationValid(nextSigner.address, 2),
    ).to.equal(true);
    expect(
      await policy.isQuoteAuthorizationValid(signer.address, 1),
    ).to.equal(true);

    await time.increase(5 * 60 + 1);
    expect(
      await policy.isQuoteAuthorizationValid(signer.address, 1),
    ).to.equal(false);
  });

  it("rejects unsafe configuration", async function () {
    const { policy, owner, signer, treasury, usdc } = await deployPolicy();
    const factory = await ethers.getContractFactory("XNSPricingPolicy");
    await expect(
      factory.deploy(
        {
          threeCharacterAnnualUsdMicros: 20_000_000,
          fourCharacterAnnualUsdMicros: 10_000_000,
          standardAnnualUsdMicros: 0,
          subdomainAnnualUsdMicros: 1_000_000,
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
        },
        owner.address,
      ),
    ).to.be.revertedWithCustomError(policy, "InvalidConfig");
  });
});
