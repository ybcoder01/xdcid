import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("XNSSignedQuoteRegistrar", function () {
  const quoteTypes = {
    Quote: [
      { name: "node", type: "bytes32" },
      { name: "payer", type: "address" },
      { name: "nameOwner", type: "address" },
      { name: "product", type: "uint8" },
      { name: "years", type: "uint256" },
      { name: "paymentToken", type: "address" },
      { name: "paymentAmount", type: "uint256" },
      { name: "usdMicros", type: "uint256" },
      { name: "policyVersion", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "issuedAt", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  async function deployFixture() {
    const [owner, quoteSigner, treasury, alice, bob] =
      await ethers.getSigners();

    const Registry = await ethers.getContractFactory("XNSRegistry");
    const registry = await Registry.deploy(owner.address);

    const Legacy = await ethers.getContractFactory("MockLegacyRegistry");
    const legacy = await Legacy.deploy();

    const USDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await USDC.deploy();

    const initialConfig = {
      threeCharacterAnnualUsdMicros: 20_000_000,
      fourCharacterAnnualUsdMicros: 10_000_000,
      standardAnnualUsdMicros: 5_000_000,
      subdomainAnnualUsdMicros: 1_000_000,
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
    };

    const Policy = await ethers.getContractFactory("XNSPricingPolicy");
    const policy = await Policy.deploy(initialConfig, owner.address);

    const Registrar = await ethers.getContractFactory(
      "XNSSignedQuoteRegistrar",
    );
    const registrar = await Registrar.deploy(
      await registry.getAddress(),
      await legacy.getAddress(),
      await policy.getAddress(),
    );
    await registry.setRegistrar(await registrar.getAddress());

    const network = await ethers.provider.getNetwork();
    const domain = {
      name: "XDCID Signed Quote Registrar",
      version: "1",
      chainId: network.chainId,
      verifyingContract: await registrar.getAddress(),
    };

    async function makeQuote(overrides: Record<string, unknown> = {}) {
      const name = (overrides.name as string | undefined) ?? "example.xdc";
      const payer =
        (overrides.payer as string | undefined) ?? alice.address;
      const nameOwner =
        (overrides.nameOwner as string | undefined) ?? alice.address;
      const product = (overrides.product as number | undefined) ?? 0;
      const years = (overrides.years as number | undefined) ?? 1;
      const issuedAt =
        (overrides.issuedAt as number | undefined) ?? (await time.latest());
      const labelLength = name.length - 4;
      const usdMicros =
        (overrides.usdMicros as bigint | undefined) ??
        (await policy.priceUsdMicros(product, labelLength, years));
      const quote = {
        node:
          (overrides.node as string | undefined) ??
          (await registrar.nodeFor(name)),
        payer,
        nameOwner,
        product,
        years,
        paymentToken:
          (overrides.paymentToken as string | undefined) ??
          ethers.ZeroAddress,
        paymentAmount:
          (overrides.paymentAmount as bigint | undefined) ??
          ethers.parseEther("0.1"),
        usdMicros,
        policyVersion:
          (overrides.policyVersion as number | undefined) ?? 1,
        nonce:
          (overrides.nonce as number | undefined) ??
          Number(await registrar.nonces(payer)),
        issuedAt,
        deadline:
          (overrides.deadline as number | undefined) ?? issuedAt + 10 * 60,
      };
      const signingDomain =
        (overrides.signingDomain as typeof domain | undefined) ?? domain;
      const signingWallet =
        (overrides.signingWallet as typeof quoteSigner | undefined) ??
        quoteSigner;
      const signature = await signingWallet.signTypedData(
        signingDomain,
        quoteTypes,
        quote,
      );
      return { name, quote, signature };
    }

    return {
      owner,
      quoteSigner,
      treasury,
      alice,
      bob,
      registry,
      legacy,
      usdc,
      policy,
      registrar,
      domain,
      makeQuote,
    };
  }

  it("registers with a payer-bound XDC quote and forwards payment", async function () {
    const { alice, treasury, registry, registrar, makeQuote } =
      await deployFixture();
    const { name, quote, signature } = await makeQuote();
    const before = await ethers.provider.getBalance(treasury.address);

    await expect(
      registrar
        .connect(alice)
        .registerWithQuote(name, quote, signature, {
          value: quote.paymentAmount,
        }),
    ).to.emit(registrar, "NameRegistered");

    expect(await registry.ownerOf(quote.node)).to.equal(alice.address);
    expect(await registrar.nonces(alice.address)).to.equal(1);
    expect(await ethers.provider.getBalance(treasury.address)).to.equal(
      before + quote.paymentAmount,
    );
  });

  it("accepts exact six-decimal USDC payment directly to treasury", async function () {
    const { alice, treasury, usdc, registrar, makeQuote } =
      await deployFixture();
    const amount = 13_500_000n;
    await usdc.mint(alice.address, amount);
    await usdc.connect(alice).approve(await registrar.getAddress(), amount);

    const { name, quote, signature } = await makeQuote({
      years: 3,
      paymentToken: await usdc.getAddress(),
      paymentAmount: amount,
    });
    await registrar
      .connect(alice)
      .registerWithQuote(name, quote, signature);

    expect(await usdc.balanceOf(treasury.address)).to.equal(amount);
  });

  it("rejects replay, another payer, and a signature for another chain", async function () {
    const { alice, bob, registrar, domain, makeQuote } =
      await deployFixture();
    const first = await makeQuote();

    await registrar
      .connect(alice)
      .registerWithQuote(first.name, first.quote, first.signature, {
        value: first.quote.paymentAmount,
      });
    await expect(
      registrar
        .connect(alice)
        .registerWithQuote(first.name, first.quote, first.signature, {
          value: first.quote.paymentAmount,
        }),
    ).to.be.revertedWithCustomError(registrar, "Unavailable");

    const payerBound = await makeQuote({ name: "payer-bound.xdc" });
    await expect(
      registrar
        .connect(bob)
        .registerWithQuote(
          payerBound.name,
          payerBound.quote,
          payerBound.signature,
          { value: payerBound.quote.paymentAmount },
        ),
    ).to.be.revertedWithCustomError(registrar, "InvalidQuote");

    const wrongChain = await makeQuote({
      name: "wrong-chain.xdc",
      signingDomain: { ...domain, chainId: 1n },
    });
    await expect(
      registrar
        .connect(alice)
        .registerWithQuote(
          wrongChain.name,
          wrongChain.quote,
          wrongChain.signature,
          { value: wrongChain.quote.paymentAmount },
        ),
    ).to.be.revertedWithCustomError(registrar, "InvalidSigner");
  });

  it("rejects expired, overlong, and underpriced quotes", async function () {
    const { alice, registrar, makeQuote } = await deployFixture();
    const now = await time.latest();

    const expired = await makeQuote({
      name: "expired.xdc",
      issuedAt: now - 700,
      deadline: now - 100,
    });
    await expect(
      registrar
        .connect(alice)
        .registerWithQuote(
          expired.name,
          expired.quote,
          expired.signature,
          { value: expired.quote.paymentAmount },
        ),
    ).to.be.revertedWithCustomError(registrar, "QuoteExpired");

    const overlong = await makeQuote({
      name: "overlong.xdc",
      issuedAt: now,
      deadline: now + 16 * 60,
    });
    await expect(
      registrar
        .connect(alice)
        .registerWithQuote(
          overlong.name,
          overlong.quote,
          overlong.signature,
          { value: overlong.quote.paymentAmount },
        ),
    ).to.be.revertedWithCustomError(registrar, "QuoteLifetimeTooLong");

    const underpriced = await makeQuote({
      name: "underpriced.xdc",
      usdMicros: 1n,
    });
    await expect(
      registrar
        .connect(alice)
        .registerWithQuote(
          underpriced.name,
          underpriced.quote,
          underpriced.signature,
          { value: underpriced.quote.paymentAmount },
        ),
    ).to.be.revertedWithCustomError(registrar, "InvalidQuote");
  });

  it("blocks legacy collisions and fails closed on legacy read errors", async function () {
    const { alice, legacy, registrar, makeQuote } = await deployFixture();
    await legacy.setName("legacy-name.xdc", 77, true);
    const legacyQuote = await makeQuote({ name: "legacy-name.xdc" });

    expect(await registrar.available("legacy-name.xdc")).to.equal(false);
    await expect(
      registrar
        .connect(alice)
        .registerWithQuote(
          legacyQuote.name,
          legacyQuote.quote,
          legacyQuote.signature,
          { value: legacyQuote.quote.paymentAmount },
        ),
    ).to.be.revertedWithCustomError(registrar, "Unavailable");

    await legacy.setFailReads(true);
    await expect(registrar.available("unverified.xdc")).to.be.revertedWith(
      "legacy read failed",
    );
  });

  it("renews only for the current owner with a renewal quote", async function () {
    const { alice, bob, registry, registrar, makeQuote } =
      await deployFixture();
    const registration = await makeQuote({ name: "renew-me.xdc" });
    await registrar
      .connect(alice)
      .registerWithQuote(
        registration.name,
        registration.quote,
        registration.signature,
        { value: registration.quote.paymentAmount },
      );
    const oldExpiry = await registry.expiryOf(registration.quote.node);

    const renewal = await makeQuote({
      name: registration.name,
      product: 1,
      nonce: 1,
    });
    await expect(
      registrar
        .connect(bob)
        .renewWithQuote(
          renewal.name,
          renewal.quote,
          renewal.signature,
          { value: renewal.quote.paymentAmount },
        ),
    ).to.be.revertedWithCustomError(registrar, "NotNameOwner");

    await registrar
      .connect(alice)
      .renewWithQuote(
        renewal.name,
        renewal.quote,
        renewal.signature,
        { value: renewal.quote.paymentAmount },
      );
    expect(await registry.expiryOf(registration.quote.node)).to.equal(
      oldExpiry + 365n * 24n * 60n * 60n,
    );
  });
});
