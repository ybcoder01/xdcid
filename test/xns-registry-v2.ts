import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const DAY = 24 * 60 * 60;

async function fixture() {
  const [protocolOwner, alice, bob, resolver, nextRegistrar, target] =
    await ethers.getSigners();

  const Registry = await ethers.getContractFactory("XNSRegistry");
  const legacy = await Registry.deploy(protocolOwner.address);
  await legacy.setRegistrar(protocolOwner.address);

  const legacyNode = ethers.keccak256(ethers.toUtf8Bytes("legacy.xdc"));
  const legacyExpiry = (await time.latest()) + 365 * DAY;
  await legacy.register(legacyNode, alice.address, legacyExpiry);
  await legacy.connect(alice).setResolver(legacyNode, resolver.address);

  const RegistryV2 = await ethers.getContractFactory("XNSRegistryV2");
  const registry = await RegistryV2.deploy(
    protocolOwner.address,
    await legacy.getAddress(),
  );
  await registry.setRegistrar(protocolOwner.address);

  return {
    protocolOwner,
    alice,
    bob,
    resolver,
    nextRegistrar,
    target,
    legacy,
    registry,
    legacyNode,
    legacyExpiry,
  };
}

describe("XNSRegistryV2", function () {
  it("reads unmigrated ownership, expiry, and resolver from the legacy Registry", async function () {
    const { alice, resolver, registry, legacyNode, legacyExpiry } =
      await fixture();

    expect(await registry.migrated(legacyNode)).to.equal(false);
    expect(await registry.ownerOf(legacyNode)).to.equal(alice.address);
    expect(await registry.expiryOf(legacyNode)).to.equal(legacyExpiry);
    expect(await registry.resolverOf(legacyNode)).to.equal(resolver.address);
    expect((await registry.records(legacyNode)).owner).to.equal(alice.address);
  });

  it("allows only the active legacy owner to explicitly anchor a name", async function () {
    const { alice, bob, registry, legacyNode, legacyExpiry } = await fixture();

    await expect(registry.connect(bob).migrateName(legacyNode))
      .to.be.revertedWithCustomError(
        registry,
        "MigrationRequiresLegacyOwner",
      );
    await expect(registry.connect(alice).migrateName(legacyNode))
      .to.emit(registry, "NameMigrated")
      .withArgs(legacyNode, alice.address, legacyExpiry);

    expect(await registry.migrated(legacyNode)).to.equal(true);
    expect(await registry.ownershipGenerations(legacyNode)).to.equal(1n);
    await expect(
      registry.connect(alice).migrateName(legacyNode),
    ).to.be.revertedWithCustomError(registry, "AlreadyMigrated");
  });

  it("anchors on an owner mutation and ignores later legacy divergence", async function () {
    const { alice, bob, target, legacy, registry, legacyNode } =
      await fixture();

    await registry.connect(alice).transferName(legacyNode, bob.address);
    expect(await registry.ownerOf(legacyNode)).to.equal(bob.address);
    expect(await registry.ownershipGenerations(legacyNode)).to.equal(2n);

    await legacy.connect(alice).transferName(legacyNode, target.address);
    expect(await legacy.ownerOf(legacyNode)).to.equal(target.address);
    expect(await registry.ownerOf(legacyNode)).to.equal(bob.address);
  });

  it("preserves a legacy lifecycle on renewal but advances new lifecycles", async function () {
    const { protocolOwner, alice, bob, resolver, registry, legacyNode } =
      await fixture();

    const renewedExpiry = (await time.latest()) + 2 * 365 * DAY;
    await registry
      .connect(protocolOwner)
      .register(legacyNode, alice.address, renewedExpiry);
    expect(await registry.ownershipGenerations(legacyNode)).to.equal(1n);
    expect(await registry.resolverOf(legacyNode)).to.equal(resolver.address);

    await registry.connect(alice).transferName(legacyNode, bob.address);
    expect(await registry.ownershipGenerations(legacyNode)).to.equal(2n);
    expect(await registry.resolverOf(legacyNode)).to.equal(ethers.ZeroAddress);

    const freshNode = ethers.keccak256(ethers.toUtf8Bytes("fresh.xdc"));
    await registry
      .connect(protocolOwner)
      .register(freshNode, alice.address, renewedExpiry);
    expect(await registry.ownershipGenerations(freshNode)).to.equal(1n);
  });

  it("prevents the registrar from overwriting or shortening an active name", async function () {
    const {
      protocolOwner,
      alice,
      bob,
      registry,
      legacyNode,
      legacyExpiry,
    } = await fixture();

    await expect(
      registry
        .connect(protocolOwner)
        .register(legacyNode, bob.address, legacyExpiry + DAY),
    ).to.be.revertedWithCustomError(registry, "NameUnavailable");
    await expect(
      registry
        .connect(protocolOwner)
        .register(legacyNode, alice.address, legacyExpiry - DAY),
    ).to.be.revertedWithCustomError(registry, "InvalidExpiry");
  });

  it("requires a delay for every registrar rotation after bootstrap", async function () {
    const { protocolOwner, nextRegistrar, registry } = await fixture();

    await expect(registry.setRegistrar(nextRegistrar.address))
      .to.be.revertedWithCustomError(registry, "RegistrarAlreadyInitialized");
    await registry
      .connect(protocolOwner)
      .proposeRegistrar(nextRegistrar.address);
    await expect(registry.connect(protocolOwner).activateRegistrar())
      .to.be.revertedWithCustomError(registry, "RegistrarChangeNotReady");

    await time.increase(2 * DAY);
    await registry.connect(protocolOwner).activateRegistrar();
    expect(await registry.registrar()).to.equal(nextRegistrar.address);
  });

  it("prevents stale resolver records after ownership returns to a wallet", async function () {
    const { alice, bob, target, registry, legacyNode } = await fixture();
    const Reverse = await ethers.getContractFactory("XNSReverseResolverV3");
    const reverse = await Reverse.deploy(await registry.getAddress());
    const Multichain = await ethers.getContractFactory(
      "XNSMultichainResolverV2",
    );
    const multichain = await Multichain.deploy(
      await registry.getAddress(),
      await reverse.getAddress(),
    );

    await expect(
      reverse.connect(alice).setPrimaryName("legacy.xdc", legacyNode),
    ).to.be.revertedWithCustomError(reverse, "NameNotAnchored");
    await expect(
      multichain.connect(alice).setAddress(legacyNode, 1n, target.address),
    ).to.be.revertedWithCustomError(multichain, "NameNotAnchored");

    await registry.connect(alice).migrateName(legacyNode);
    await reverse.connect(alice).setPrimaryName("legacy.xdc", legacyNode);
    await multichain
      .connect(alice)
      .setAddress(legacyNode, 1n, target.address);
    await registry.connect(alice).transferName(legacyNode, bob.address);
    await registry.connect(bob).transferName(legacyNode, alice.address);

    expect(await reverse.primaryNames(alice.address)).to.equal("");
    expect(await multichain.addressFor(legacyNode, 1n)).to.equal(
      ethers.ZeroAddress,
    );
  });
});
