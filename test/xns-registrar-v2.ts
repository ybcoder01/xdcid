import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("XNSRegistrarV2", function () {
  const quoteTypes = {
    Quote: [
      { name: "node", type: "bytes32" },
      { name: "payer", type: "address" },
      { name: "nameOwner", type: "address" },
      { name: "product", type: "uint8" },
      { name: "termYears", type: "uint256" },
      { name: "paymentToken", type: "address" },
      { name: "paymentAmount", type: "uint256" },
      { name: "usdMicros", type: "uint256" },
      { name: "policyVersion", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "issuedAt", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };
  const authorizationTypes = {
    DiscountAuthorization: [
      { name: "node", type: "bytes32" },
      { name: "beneficiary", type: "address" },
      { name: "product", type: "uint8" },
      { name: "termYears", type: "uint256" },
      { name: "discountBps", type: "uint16" },
      { name: "maxUses", type: "uint32" },
      { name: "validAfter", type: "uint64" },
      { name: "deadline", type: "uint64" },
      { name: "nonce", type: "uint256" },
    ],
  };

  async function fixture() {
    const [owner, quoteSigner, discountSigner, treasury, alice, bob] =
      await ethers.getSigners();
    const Registry = await ethers.getContractFactory("XNSRegistry");
    const registry = await Registry.deploy(owner.address);
    const Legacy = await ethers.getContractFactory("MockLegacyRegistry");
    const legacy = await Legacy.deploy();
    const USDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await USDC.deploy();

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
        usdcToken: await usdc.getAddress(),
        treasury: treasury.address,
        xdcPaymentsEnabled: true,
        usdcPaymentsEnabled: true,
      },
      owner.address,
    );

    const nextNonce = await ethers.provider.getTransactionCount(owner.address);
    const predictedRegistrar = ethers.getCreateAddress({
      from: owner.address,
      nonce: nextNonce + 1,
    });
    const Authorization = await ethers.getContractFactory(
      "XNSDiscountAuthorization",
    );
    const authorization = await Authorization.deploy(
      owner.address,
      discountSigner.address,
      predictedRegistrar,
    );
    const Registrar = await ethers.getContractFactory("XNSRegistrarV2");
    const registrar = await Registrar.deploy(
      await registry.getAddress(),
      await legacy.getAddress(),
      await policy.getAddress(),
      await authorization.getAddress(),
      owner.address,
    );
    expect(await registrar.getAddress()).to.equal(predictedRegistrar);
    await registry.setRegistrar(await registrar.getAddress());

    const network = await ethers.provider.getNetwork();
    const quoteDomain = {
      name: "XDCID Registrar V2",
      version: "1",
      chainId: network.chainId,
      verifyingContract: await registrar.getAddress(),
    };
    const authorizationDomain = {
      name: "XDCID Discount Authorization",
      version: "1",
      chainId: network.chainId,
      verifyingContract: await authorization.getAddress(),
    };

    async function makeQuote(overrides: Record<string, unknown> = {}) {
      const name = (overrides.name as string | undefined) ?? "example.xdc";
      const payer = (overrides.payer as string | undefined) ?? alice.address;
      const nameOwner =
        (overrides.nameOwner as string | undefined) ?? alice.address;
      const product = (overrides.product as number | undefined) ?? 0;
      const termYears = (overrides.termYears as number | undefined) ?? 1;
      const gross = await policy.priceUsdMicros(
        product,
        name.length - 4,
        termYears,
      );
      const discountBps =
        (overrides.discountBps as number | undefined) ?? 0;
      const usdMicros =
        (overrides.usdMicros as bigint | undefined) ??
        (await authorization.applyDiscount(gross, discountBps));
      const issuedAt = await time.latest();
      const quote = {
        node: await registrar.nodeFor(name),
        payer,
        nameOwner,
        product,
        termYears,
        paymentToken:
          (overrides.paymentToken as string | undefined) ?? ethers.ZeroAddress,
        paymentAmount:
          (overrides.paymentAmount as bigint | undefined) ??
          ethers.parseEther("0.1"),
        usdMicros,
        policyVersion: 1,
        nonce: await registrar.nonces(payer),
        issuedAt,
        deadline: issuedAt + 600,
      };
      return {
        name,
        quote,
        signature: await quoteSigner.signTypedData(
          quoteDomain,
          quoteTypes,
          quote,
        ),
      };
    }

    return {
      owner,
      discountSigner,
      treasury,
      alice,
      bob,
      registry,
      legacy,
      usdc,
      policy,
      authorization,
      registrar,
      authorizationDomain,
      makeQuote,
    };
  }

  it("registers two-character names and forwards XDC", async function () {
    const { alice, treasury, registry, registrar, makeQuote } = await fixture();
    const made = await makeQuote({ name: "ab.xdc" });
    const before = await ethers.provider.getBalance(treasury.address);
    await registrar.connect(alice).registerWithQuote(
      made.name,
      made.quote,
      made.signature,
      { value: made.quote.paymentAmount },
    );
    expect(await registry.ownerOf(made.quote.node)).to.equal(alice.address);
    expect(await ethers.provider.getBalance(treasury.address)).to.equal(
      before + made.quote.paymentAmount,
    );
  });

  it("accepts USDC and renews only for the owner", async function () {
    const { alice, bob, treasury, usdc, registry, registrar, makeQuote } =
      await fixture();
    const registration = await makeQuote({
      paymentToken: await usdc.getAddress(),
      paymentAmount: 5_000_000n,
    });
    await usdc.mint(alice.address, 10_000_000n);
    await usdc.connect(alice).approve(await registrar.getAddress(), 10_000_000n);
    await registrar
      .connect(alice)
      .registerWithQuote(
        registration.name,
        registration.quote,
        registration.signature,
      );
    expect(await usdc.balanceOf(treasury.address)).to.equal(5_000_000n);

    const renewal = await makeQuote({
      name: registration.name,
      product: 1,
      paymentToken: await usdc.getAddress(),
      paymentAmount: 5_000_000n,
    });
    await expect(
      registrar
        .connect(bob)
        .renewWithQuote(renewal.name, renewal.quote, renewal.signature),
    ).to.be.revertedWithCustomError(registrar, "NotNameOwner");
    const oldExpiry = await registry.expiryOf(registration.quote.node);
    await registrar
      .connect(alice)
      .renewWithQuote(renewal.name, renewal.quote, renewal.signature);
    expect(await registry.expiryOf(registration.quote.node)).to.equal(
      oldExpiry + 365n * 24n * 60n * 60n,
    );
  });

  it("consumes an exact-name 100% discount only once", async function () {
    const {
      discountSigner,
      alice,
      authorization,
      authorizationDomain,
      registry,
      registrar,
      makeQuote,
    } = await fixture();
    const made = await makeQuote({
      name: "free.xdc",
      discountBps: 10_000,
      paymentAmount: 0n,
    });
    const now = await time.latest();
    const grant = {
      node: made.quote.node,
      beneficiary: alice.address,
      product: 0,
      termYears: 1,
      discountBps: 10_000,
      maxUses: 1,
      validAfter: now - 1,
      deadline: now + 3600,
      nonce: 42,
    };
    const grantSignature = await discountSigner.signTypedData(
      authorizationDomain,
      authorizationTypes,
      grant,
    );

    await registrar.connect(alice).registerWithDiscountQuote(
      made.name,
      made.quote,
      made.signature,
      grant,
      grantSignature,
    );
    expect(await registry.ownerOf(made.quote.node)).to.equal(alice.address);
    expect(await authorization.uses(await authorization.hashAuthorization(grant)))
      .to.equal(1);

    const replay = await makeQuote({
      name: "other.xdc",
      discountBps: 10_000,
      paymentAmount: 0n,
    });
    await expect(
      registrar.connect(alice).registerWithDiscountQuote(
        replay.name,
        replay.quote,
        replay.signature,
        grant,
        grantSignature,
      ),
    ).to.be.reverted;
  });

  it("blocks legacy collisions and supports independent emergency pauses", async function () {
    const { owner, alice, legacy, registrar, makeQuote } = await fixture();
    await legacy.setName("legacy.xdc", 7, true);
    expect(await registrar.available("legacy.xdc")).to.equal(false);

    await registrar.connect(owner).setRegistrationsPaused(true);
    const made = await makeQuote();
    await expect(
      registrar.connect(alice).registerWithQuote(
        made.name,
        made.quote,
        made.signature,
        { value: made.quote.paymentAmount },
      ),
    ).to.be.revertedWithCustomError(registrar, "RegistrationsPaused");
    expect(await registrar.renewalsPaused()).to.equal(false);
  });

  it("rejects one-character, malformed, underpriced, and wrong-payer requests", async function () {
    const { alice, bob, registrar, makeQuote } = await fixture();
    await expect(registrar.nodeFor("a.xdc")).to.be.revertedWithCustomError(
      registrar,
      "InvalidName",
    );
    await expect(registrar.nodeFor("-ab.xdc")).to.be.revertedWithCustomError(
      registrar,
      "InvalidName",
    );

    const underpriced = await makeQuote({ usdMicros: 1n });
    await expect(
      registrar.connect(alice).registerWithQuote(
        underpriced.name,
        underpriced.quote,
        underpriced.signature,
        { value: underpriced.quote.paymentAmount },
      ),
    ).to.be.revertedWithCustomError(registrar, "InvalidQuote");

    const payerBound = await makeQuote({ name: "payer.xdc" });
    await expect(
      registrar.connect(bob).registerWithQuote(
        payerBound.name,
        payerBound.quote,
        payerBound.signature,
        { value: payerBound.quote.paymentAmount },
      ),
    ).to.be.revertedWithCustomError(registrar, "InvalidQuote");
  });

  it("prices every name tier and supported multi-year term", async function () {
    const { policy } = await fixture();

    expect(await policy.priceUsdMicros(0, 2, 1)).to.equal(50_000_000n);
    expect(await policy.priceUsdMicros(0, 3, 1)).to.equal(20_000_000n);
    expect(await policy.priceUsdMicros(0, 4, 1)).to.equal(10_000_000n);
    expect(await policy.priceUsdMicros(0, 5, 1)).to.equal(5_000_000n);

    expect(await policy.priceUsdMicros(0, 5, 3)).to.equal(13_500_000n);
    expect(await policy.priceUsdMicros(0, 5, 5)).to.equal(21_250_000n);
    expect(await policy.priceUsdMicros(0, 5, 10)).to.equal(40_000_000n);
  });

  it("registers and renews with XDC for every supported term", async function () {
    for (const termYears of [1, 3, 5, 10]) {
      const { alice, registry, registrar, makeQuote } = await fixture();
      const name = `term${termYears}.xdc`;
      const registration = await makeQuote({ name, termYears });

      await registrar.connect(alice).registerWithQuote(
        registration.name,
        registration.quote,
        registration.signature,
        { value: registration.quote.paymentAmount },
      );

      const oldExpiry = await registry.expiryOf(registration.quote.node);
      const renewal = await makeQuote({
        name,
        product: 1,
        termYears,
      });
      await registrar.connect(alice).renewWithQuote(
        renewal.name,
        renewal.quote,
        renewal.signature,
        { value: renewal.quote.paymentAmount },
      );

      expect(await registry.expiryOf(registration.quote.node)).to.equal(
        oldExpiry + BigInt(termYears) * 365n * 24n * 60n * 60n,
      );
    }
  });

  it("applies an exact-name partial discount", async function () {
    const {
      discountSigner,
      alice,
      treasury,
      authorization,
      authorizationDomain,
      registrar,
      makeQuote,
    } = await fixture();
    const paymentAmount = ethers.parseEther("0.075");
    const made = await makeQuote({
      name: "discount.xdc",
      discountBps: 2_500,
      paymentAmount,
    });
    const now = await time.latest();
    const grant = {
      node: made.quote.node,
      beneficiary: alice.address,
      product: 0,
      termYears: 1,
      discountBps: 2_500,
      maxUses: 1,
      validAfter: now - 1,
      deadline: now + 3600,
      nonce: 7,
    };
    const grantSignature = await discountSigner.signTypedData(
      authorizationDomain,
      authorizationTypes,
      grant,
    );
    const before = await ethers.provider.getBalance(treasury.address);

    await registrar.connect(alice).registerWithDiscountQuote(
      made.name,
      made.quote,
      made.signature,
      grant,
      grantSignature,
      { value: paymentAmount },
    );

    expect(made.quote.usdMicros).to.equal(3_750_000n);
    expect(await ethers.provider.getBalance(treasury.address)).to.equal(
      before + paymentAmount,
    );
  });

  it("pauses and unpauses registrations and renewals independently", async function () {
    const { owner, alice, registrar, makeQuote } = await fixture();
    const registration = await makeQuote({ name: "pause.xdc" });

    await registrar.connect(owner).setRegistrationsPaused(true);
    await expect(
      registrar.connect(alice).registerWithQuote(
        registration.name,
        registration.quote,
        registration.signature,
        { value: registration.quote.paymentAmount },
      ),
    ).to.be.revertedWithCustomError(registrar, "RegistrationsPaused");

    await registrar.connect(owner).setRegistrationsPaused(false);
    await registrar.connect(alice).registerWithQuote(
      registration.name,
      registration.quote,
      registration.signature,
      { value: registration.quote.paymentAmount },
    );

    const renewal = await makeQuote({
      name: registration.name,
      product: 1,
    });
    await registrar.connect(owner).setRenewalsPaused(true);
    await expect(
      registrar.connect(alice).renewWithQuote(
        renewal.name,
        renewal.quote,
        renewal.signature,
        { value: renewal.quote.paymentAmount },
      ),
    ).to.be.revertedWithCustomError(registrar, "RenewalsPaused");

    await registrar.connect(owner).setRenewalsPaused(false);
    await registrar.connect(alice).renewWithQuote(
      renewal.name,
      renewal.quote,
      renewal.signature,
      { value: renewal.quote.paymentAmount },
    );
  });

});
