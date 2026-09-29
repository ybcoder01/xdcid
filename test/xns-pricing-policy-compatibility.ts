import { expect } from "chai";
import { ethers } from "hardhat";

describe("XNSPricingPolicyCompatibility", function () {
  it("prices a current-version quote against the original V2 bytecode", async function () {
    const LegacyPolicy = await ethers.getContractFactory(
      "MockVersionlessPricingPolicyV2",
    );
    const legacyPolicy = await LegacyPolicy.deploy(3, 5_000_000);
    const Harness = await ethers.getContractFactory(
      "PricingPolicyCompatibilityHarness",
    );
    const harness = await Harness.deploy();

    expect(
      await harness.priceUsdMicrosForVersion(
        await legacyPolicy.getAddress(),
        0,
        11,
        1,
        3,
      ),
    ).to.equal(5_000_000);
  });

  it("does not price an old quote when the deployed policy has no history lookup", async function () {
    const LegacyPolicy = await ethers.getContractFactory(
      "MockVersionlessPricingPolicyV2",
    );
    const legacyPolicy = await LegacyPolicy.deploy(3, 5_000_000);
    const Harness = await ethers.getContractFactory(
      "PricingPolicyCompatibilityHarness",
    );
    const harness = await Harness.deploy();

    await expect(
      harness.priceUsdMicrosForVersion(
        await legacyPolicy.getAddress(),
        0,
        11,
        1,
        2,
      ),
    ).to.be.revertedWithCustomError(
      harness,
      "UnsupportedPricingPolicyVersion",
    );
  });

  it("preserves reverts from a policy that implements version-aware pricing", async function () {
    const [owner, quoteSigner, treasury] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockUSDC");
    const token = await Token.deploy();
    const Policy = await ethers.getContractFactory("XNSPricingPolicyV2");
    const policy = await Policy.deploy(
      {
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
        quoteSigner: quoteSigner.address,
        usdcToken: await token.getAddress(),
        treasury: treasury.address,
        xdcPaymentsEnabled: true,
        usdcPaymentsEnabled: true,
      },
      owner.address,
    );
    const Harness = await ethers.getContractFactory(
      "PricingPolicyCompatibilityHarness",
    );
    const harness = await Harness.deploy();

    await expect(
      harness.priceUsdMicrosForVersion(
        await policy.getAddress(),
        0,
        11,
        1,
        2,
      ),
    ).to.be.revertedWithCustomError(policy, "InvalidQuoteVersion");
  });
});
