import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const DAY = 24 * 60 * 60;
const YEAR = 365 * DAY;

const quoteTypes = {
  Quote: [
    { name: "node", type: "bytes32" },
    { name: "parentNode", type: "bytes32" },
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

const discountTypes = {
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

async function deployProtocol() {
  const [admin, quoteSigner, discountSigner, treasury, alice, bob, carol] =
    await ethers.getSigners();

  const Legacy = await ethers.getContractFactory("XNSRegistry");
  const legacy = await Legacy.deploy(admin.address);
  await legacy.setRegistrar(admin.address);

  const Registry = await ethers.getContractFactory("XNSRegistryV3");
  const registry = await Registry.deploy(admin.address, await legacy.getAddress());

  const Resolver = await ethers.getContractFactory("XNSUniversalResolver");
  const resolver = await Resolver.deploy(await registry.getAddress());

  const LegacySubs = await ethers.getContractFactory(
    "MockLegacySubdomainRegistrar",
  );
  const legacySubs = await LegacySubs.deploy();

  const USDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await USDC.deploy();

  const config = {
    twoCharacterAnnualUsdMicros: 50_000_000,
    threeCharacterAnnualUsdMicros: 20_000_000,
    fourCharacterAnnualUsdMicros: 10_000_000,
    standardAnnualUsdMicros: 5_000_000,
    subdomainAnnualUsdMicros: 1_000_000,
    premiumSubdomainAnnualUsdMicros: 2_000_000,
    migrationUsdMicros: 500_000,
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

  const Policy = await ethers.getContractFactory("XNSPricingPolicyV2");
  const pricingPolicy = await Policy.deploy(config, admin.address);

  const Registrar = await ethers.getContractFactory("XNSUnifiedRegistrar");
  const registrar = await Registrar.deploy(
    await registry.getAddress(),
    await resolver.getAddress(),
    await legacySubs.getAddress(),
    await pricingPolicy.getAddress(),
    discountSigner.address,
    admin.address,
  );
  await registry.setRegistrar(await registrar.getAddress());

  const network = await ethers.provider.getNetwork();
  const domain = {
    name: "XDCID Unified Registrar",
    version: "1",
    chainId: network.chainId,
    verifyingContract: await registrar.getAddress(),
  };

  async function quote(options: {
    name: string;
    payer: string;
    nameOwner: string;
    product: number;
    years?: number;
    parentName?: string;
    paymentAmount?: bigint;
    signer?: typeof quoteSigner;
    version?: bigint;
    usdMicros?: bigint;
  }) {
    const canonical = options.name.toLowerCase();
    const node = ethers.keccak256(ethers.toUtf8Bytes(canonical));
    const parentNode = options.parentName
      ? ethers.keccak256(ethers.toUtf8Bytes(options.parentName.toLowerCase()))
      : ethers.ZeroHash;
    const termYears = options.years ?? 1;
    const labelLength = options.parentName
      ? canonical.split(".")[0].length
      : canonical.length - 4;
    const policyVersion = options.version ?? (await pricingPolicy.version());
    const usdMicros =
      options.usdMicros ??
      (await registrar.priceUsdMicrosForVersion(
        options.product,
        labelLength,
        termYears,
        policyVersion,
      ));
    const issuedAt = await time.latest();
    const value = {
      node,
      parentNode,
      payer: options.payer,
      nameOwner: options.nameOwner,
      product: options.product,
      termYears,
      paymentToken: ethers.ZeroAddress,
      paymentAmount: options.paymentAmount ?? ethers.parseEther("0.01"),
      usdMicros,
      policyVersion,
      nonce: await registrar.nonces(options.payer),
      issuedAt,
      deadline: issuedAt + 600,
    };
    return {
      value,
      signature: await (options.signer ?? quoteSigner).signTypedData(
        domain,
        quoteTypes,
        value,
      ),
    };
  }

  async function registerParent(years = 10) {
    const made = await quote({
      name: "company.xdc",
      payer: alice.address,
      nameOwner: alice.address,
      product: 0,
      years,
    });
    await registrar.connect(alice).register("company.xdc", made.value, made.signature, {
      value: made.value.paymentAmount,
    });
    return made.value.node;
  }

  return {
    admin,
    quoteSigner,
    discountSigner,
    treasury,
    alice,
    bob,
    carol,
    legacy,
    legacySubs,
    registry,
    resolver,
    registrar,
    pricingPolicy,
    usdc,
    config,
    quote,
    registerParent,
  };
}

describe("XDCID unified protocol", function () {
  it("supports a clean deployment when a testnet rollback leaves no legacy state", async function () {
    const [admin, quoteSigner, authorizationSigner, treasury] =
      await ethers.getSigners();
    const Registry = await ethers.getContractFactory("XNSRegistryV3");
    const registry = await Registry.deploy(admin.address, ethers.ZeroAddress);
    const Resolver = await ethers.getContractFactory("XNSUniversalResolver");
    const resolver = await Resolver.deploy(await registry.getAddress());
    const USDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await USDC.deploy();
    const Policy = await ethers.getContractFactory("XNSPricingPolicyV2");
    const policy = await Policy.deploy({
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
    }, admin.address);
    const Registrar = await ethers.getContractFactory("XNSUnifiedRegistrar");
    const registrar = await Registrar.deploy(
      await registry.getAddress(),
      await resolver.getAddress(),
      ethers.ZeroAddress,
      await policy.getAddress(),
      authorizationSigner.address,
      admin.address,
    );
    await registry.setRegistrar(await registrar.getAddress());

    expect(await registry.legacyRegistry()).to.equal(ethers.ZeroAddress);
    expect(await registrar.legacySubdomains()).to.equal(ethers.ZeroAddress);
    expect(await registry.ownerOf(ethers.ZeroHash)).to.equal(ethers.ZeroAddress);
    await expect(registry.migrateName(ethers.ZeroHash)).to.be.revertedWithCustomError(
      registry,
      "MigrationRequiresLegacyOwner",
    );
    await expect(registrar.migrateSubdomain(ethers.ZeroHash)).to.be.revertedWithCustomError(
      registrar,
      "MigrationUnavailable",
    );
  });

  it("satisfies the deployment preflight bindings after two-step ownership acceptance", async function () {
    const {
      admin,
      bob,
      discountSigner,
      legacy,
      legacySubs,
      registry,
      resolver,
      registrar,
      pricingPolicy,
    } = await deployProtocol();

    await registry.connect(admin).transferOwnership(bob.address);
    expect(await registry.pendingOwner()).to.equal(bob.address);
    await registry.connect(bob).acceptOwnership();
    await registrar.connect(admin).transferOwnership(bob.address);
    await registrar.connect(bob).acceptOwnership();

    expect(await registry.owner()).to.equal(bob.address);
    expect(await registry.pendingOwner()).to.equal(ethers.ZeroAddress);
    expect(await registry.registrar()).to.equal(await registrar.getAddress());
    expect(await registry.legacyRegistry()).to.equal(await legacy.getAddress());
    expect(await resolver.registry()).to.equal(await registry.getAddress());
    expect(await registrar.owner()).to.equal(bob.address);
    expect(await registrar.registry()).to.equal(await registry.getAddress());
    expect(await registrar.resolver()).to.equal(await resolver.getAddress());
    expect(await registrar.legacySubdomains()).to.equal(
      await legacySubs.getAddress(),
    );
    expect(await registrar.pricingPolicy()).to.equal(
      await pricingPolicy.getAddress(),
    );
    expect(await registrar.authorizationSigner()).to.equal(
      discountSigner.address,
    );
    expect(await registrar.consumer()).to.equal(await registrar.getAddress());
    expect(await registrar.hasPendingConfiguration()).to.equal(false);
    expect(await registrar.topLevelRegistrationsPaused()).to.equal(false);
    expect(await registrar.topLevelRenewalsPaused()).to.equal(false);
    expect(await registrar.subdomainRegistrationsPaused()).to.equal(false);
    expect(await registrar.subdomainRenewalsPaused()).to.equal(false);
    expect(await pricingPolicy.version()).to.be.greaterThan(0n);
  });

  it("keeps all ownership in one registry and lets only the parent reassign children", async function () {
    const { alice, bob, carol, registry, resolver, registrar, quote, registerParent } =
      await deployProtocol();
    const parentNode = await registerParent();
    const made = await quote({
      name: "pay.company.xdc",
      parentName: "company.xdc",
      payer: alice.address,
      nameOwner: bob.address,
      product: 2,
    });
    await registrar
      .connect(alice)
      .registerSubdomain("company.xdc", "pay", made.value, made.signature, {
        value: made.value.paymentAmount,
      });

    expect(await registry.ownerOf(made.value.node)).to.equal(bob.address);
    expect(await registry.parentOf(made.value.node)).to.equal(parentNode);
    expect(await resolver.addressFor(made.value.node, 50)).to.equal(bob.address);
    await expect(
      registry.connect(bob).transferName(made.value.node, carol.address),
    ).to.be.revertedWithCustomError(registry, "SubdomainIsNonTransferable");

    await resolver.connect(bob).setPrimaryName("pay.company.xdc");
    expect(await resolver.primaryNames(bob.address)).to.equal("pay.company.xdc");
    await registrar
      .connect(alice)
      .reassignSubdomain("company.xdc", "pay", carol.address);
    expect(await registry.ownerOf(made.value.node)).to.equal(carol.address);
    expect(await resolver.primaryNames(bob.address)).to.equal("");
    expect(await resolver.addressFor(made.value.node, 50)).to.equal(carol.address);
  });

  it("does not let a parent set another wallet's primary through assignment", async function () {
    const { alice, bob, resolver, registrar, quote, registerParent } =
      await deployProtocol();
    await registerParent();
    const made = await quote({
      name: "staff.company.xdc",
      parentName: "company.xdc",
      payer: alice.address,
      nameOwner: bob.address,
      product: 2,
    });
    await registrar
      .connect(alice)
      .registerSubdomain("company.xdc", "staff", made.value, made.signature, {
        value: made.value.paymentAmount,
      });
    expect(await resolver.primaryNames(bob.address)).to.equal("");
    await resolver.connect(bob).setPrimaryName("staff.company.xdc");
    expect(await resolver.primaryNames(bob.address)).to.equal(
      "staff.comertedWithCustomError(registry, "NameUnavailable");
    await registrar.connect(alice).releaseSubdomain("company.xdc", "short");
  });

  it("invalidates every route and primary across A to B to A ownership cycles", async function () {
    const { alice, bob, carol, registry, resolver, registerParent } =
      await deployProtocol();
    const node = await registerParent();
    await resolver.connect(alice).setAddress(node, 1, carol.address);
    expect(await resolver.addressFor(node, 1)).to.equal(carol.address);
    await registry.connect(alice).transferName(node, bob.address);
    await registry.connect(bob).transferName(node, alice.address);
    expect(await resolver.addressFor(node, 1)).to.equal(alice.address);
    expect(await resolver.primaryNames(alice.address)).to.equal("");
  });

  it("honors previous-version prices and signatures only during the five-minute grace", async function () {
    const {
      admin,
      quoteSigner,
      treasury,
      alice,
      registrar,
      pricingPolicy,
      usdc,
      config,
      quote,
    } = await deployProtocol();
    await pricingPolicy.connect(admin).proposeConfig({
      ...config,
      standardAnnualUsdMicros: 9_000_000,
      quoteSigner: quoteSigner.address,
      treasury: treasury.address,
      usdcToken: await usdc.getAddress(),
    });
    await time.increase(2 * DAY - 120);
    const old = await quote({
      name: "grace.xdc",
      payer: alice.address,
      nameOwner: alice.address,
      product: 0,
    });
    await time.increase(120);
    await pricingPolicy.activatePendingConfig();
    await registrar.connect(alice).register("grace.xdc", old.value, old.signature, {
      value: old.value.paymentAmount,
    });

    const expired = await quote({
      name: "late.xdc",
      payer: alice.address,
      nameOwner: alice.address,
      product: 0,
      signer: quoteSigner,
      version: 1n,
      usdMicros: 5_000_000n,
    });
    await time.increase(301);
    await expect(
      registrar.connect(alice).register("late.xdc", expired.value, expired.signature, {
        value: expired.value.paymentAmount,
      }),
    ).to.be.revertedWithCustomError(registrar, "InvalidQuoteVersion");
  });

  it("migrates an active legacy subdomain exactly once", async function () {
    const { alice, bob, carol, legacySubs, registry, resolver, registrar, registerParent } =
      await deployProtocol();
    const parentNode = await registerParent();
    const node = ethers.keccak256(ethers.toUtf8Bytes("legacy.company.xdc"));
    const expiry = (await time.latest()) + YEAR;
    await legacySubs.seed(node, parentNode, bob.address, expiry);
    await legacySubs.setAddress(node, 8453, carol.address);
    await registrar.connect(alice).migrateSubdomain(node);
    expect(await registry.ownerOf(node)).to.equal(bob.address);
    expect(await registry.expiryOf(node)).to.equal(expiry);
    expect(await resolver.addressFor(node, 8453)).to.equal(carol.address);
    expect(await resolver.addressFor(node, 42161)).to.equal(bob.address);
    await expect(registrar.migrateSubdomain(node)).to.be.revertedWithCustomError(
      registrar,
      "AlreadyMigrated",
    );
  });

  it("preserves generation and resolver invariants across repeated parent reassignments", async function () {
    const { alice, bob, carol, registry, resolver, registrar, quote, registerParent } =
      await deployProtocol();
    await registerParent();
    const child = await quote({
      name: "rotating.company.xdc",
      parentName: "company.xdc",
      payer: alice.address,
      nameOwner: bob.address,
      product: 2,
    });
    await registrar
      .connect(alice)
      .registerSubdomain("company.xdc", "rotating", child.value, child.signature, {
        value: child.value.paymentAmount,
      });

    let expectedGeneration = 1n;
    let currentOwner = bob;
    for (let i = 0; i < 12; i += 1) {
      await resolver.connect(currentOwner).setAddress(
        child.value.node,
        8453,
        currentOwner.address,
      );
      const nextOwner = currentOwner.address === bob.address ? carol : bob;
      await registrar
        .connect(alice)
        .reassignSubdomain("company.xdc", "rotating", nextOwner.address);
      expectedGeneration += 1n;
      expect(await registry.ownershipGenerations(child.value.node)).to.equal(
        expectedGeneration,
      );
      expect(await resolver.addressFor(child.value.node, 8453)).to.equal(
        nextOwner.address,
      );
      currentOwner = nextOwner;
    }
  });

  it("preserves dashboard-compatible discount grants and delayed signer rotation", async function () {
    const {
      admin,
      discountSigner,
      alice,
      bob,
      registrar,
      quote,
    } = await deployProtocol();
    const made = await quote({
      name: "grant.xdc",
      payer: alice.address,
      nameOwner: alice.address,
      product: 0,
      paymentAmount: 0n,
      usdMicros: 0n,
    });
    const now = await time.latest();
    const authorization = {
      node: made.value.node,
      beneficiary: alice.address,
      product: 0,
      termYears: 1,
      discountBps: 10_000,
      maxUses: 1,
      validAfter: now - 1,
      deadline: now + DAY,
      nonce: 42,
    };
    const network = await ethers.provider.getNetwork();
    const signature = await discountSigner.signTypedData(
      {
        name: "XDCID Discount Authorization",
        version: "1",
        chainId: network.chainId,
        verifyingContract: await registrar.getAddress(),
      },
      discountTypes,
      authorization,
    );

    expect(await registrar.discountAuthorization()).to.equal(
      await registrar.getAddress(),
    );
    expect(await registrar.consumer()).to.equal(await registrar.getAddress());
    expect(await registrar.authorizationSigner()).to.equal(discountSigner.address);
    expect(await registrar.isUsable(authorization, signature)).to.equal(true);

    await registrar
      .connect(alice)
      .registerWithDiscount(
        "grant.xdc",
        made.value,
        made.signature,
        authorization,
        signature,
      );
    const authorizationHash = await registrar.hashAuthorization(authorization);
    expect(await registrar.uses(authorizationHash)).to.equal(1);
    expect(await registrar.isUsable(authorization, signature)).to.equal(false);

    await expect(
      registrar
        .connect(admin)
        .proposeConfiguration(bob.address, alice.address),
    ).to.be.revertedWithCustomError(registrar, "InvalidConfiguration");
    await registrar
      .connect(admin)
      .proposeConfiguration(bob.address, await registrar.getAddress());
    expect(await registrar.pendingAuthorizationSigner()).to.equal(bob.address);
    expect(await registrar.pendingConsumer()).to.equal(await registrar.getAddress());
    await time.increase(2 * DAY);
    await registrar.activatePendingConfiguration();
    expect(await registrar.authorizationSigner()).to.equal(bob.address);
  });

  it("blocks treasury reentrancy after committing registration state", async function () {
    const {
      admin,
      quoteSigner,
      discountSigner,
      alice,
      bob,
      legacySubs,
      registry,
      resolver,
      registrar,
      pricingPolicy,
      usdc,
      config,
      quote,
    } = await deployProtocol();
    const Treasury = await ethers.getContractFactory("MockReentrantTreasury");
    const callbackTreasury = await Treasury.deploy();
    await pricingPolicy.connect(admin).proposeConfig({
      ...config,
      quoteSigner: quoteSigner.address,
      treasury: await callbackTreasury.getAddress(),
      usdcToken: await usdc.getAddress(),
    });
    await time.increase(2 * DAY);
    await pricingPolicy.activatePendingConfig();

    const parentNode = ethers.keccak256(ethers.toUtf8Bytes("callback.xdc"));
    const legacyChild = ethers.keccak256(
      ethers.toUtf8Bytes("legacy.callback.xdc"),
    );
    await legacySubs.seed(
      legacyChild,
      parentNode,
      bob.address,
      (await time.latest()) + YEAR,
    );
    await callbackTreasury.configure(
      await registrar.getAddress(),
      registrar.interface.encodeFunctionData("migrateSubdomain", [legacyChild]),
    );

    const made = await quote({
      name: "callback.xdc",
      payer: alice.address,
      nameOwner: alice.address,
      product: 0,
    });
    await registrar.connect(alice).register("callback.xdc", made.value, made.signature, {
      value: made.value.paymentAmount,
    });
    expect(await callbackTreasury.callbackAttempted()).to.equal(true);
    expect(await callbackTreasury.callbackSucceeded()).to.equal(false);
    expect(await registry.ownerOf(parentNode)).to.equal(alice.address);
    expect(await registry.ownerOf(legacyChild)).to.equal(ethers.ZeroAddress);
    expect(await resolver.primaryNames(alice.address)).to.equal("callback.xdc");
  });
});
