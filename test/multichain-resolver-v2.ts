import { expect } from "chai";
import { ethers } from "hardhat";

const CHAINS = [1n, 50n, 137n, 8453n, 42161n] as const;

async function deployFixture() {
  const [protocolOwner, nameOwner, recipient, customTarget] =
    await ethers.getSigners();

  const Registry = await ethers.getContractFactory("XNSRegistry");
  const registry = await Registry.deploy(protocolOwner.address);

  const Registrar = await ethers.getContractFactory("XNSRegistrar");
  const registrar = await Registrar.deploy(
    await registry.getAddress(),
    protocolOwner.address,
  );
  await registry.setRegistrar(await registrar.getAddress());

  const ReverseResolver = await ethers.getContractFactory(
    "XNSReverseResolverV3",
  );
  const reverseResolver = await ReverseResolver.deploy(
    await registry.getAddress(),
  );

  const MultichainResolver = await ethers.getContractFactory(
    "XNSMultichainResolverV2",
  );
  const resolver = await MultichainResolver.deploy(
    await registry.getAddress(),
    await reverseResolver.getAddress(),
  );

  const price = await registrar.price("alice.xdc");
  await registrar
    .connect(nameOwner)
    .register("alice.xdc", nameOwner.address, 1, { value: price });
  const node = await registrar.nodeFor("alice.xdc");

  return {
    protocolOwner,
    nameOwner,
    recipient,
    customTarget,
    registry,
    registrar,
    reverseResolver,
    resolver,
    node,
  };
}

describe("XNSMultichainResolverV2", function () {
  it("uses the verified primary owner as the default on all five networks", async function () {
    const { nameOwner, reverseResolver, resolver, node } =
      await deployFixture();

    for (const chainId of CHAINS) {
      expect(await resolver.addressFor(node, chainId)).to.equal(
        ethers.ZeroAddress,
      );
    }

    await reverseResolver
      .connect(nameOwner)
      .setPrimaryName("alice.xdc", node);

    for (const chainId of CHAINS) {
      expect(await resolver.addressFor(node, chainId)).to.equal(
        nameOwner.address,
      );
    }
  });

  it("does not let wallets impersonate the registrar to initialize a primary", async function () {
    const { nameOwner, reverseResolver, node } = await deployFixture();

    await expect(
      reverseResolver
        .connect(nameOwner)
        .initializePrimaryName(nameOwner.address, "alice.xdc", node),
    ).to.be.revertedWithCustomError(reverseResolver, "NotRegistrar");
  });

  it("prefers an explicit chain override and restores the default when cleared", async function () {
    const { nameOwner, customTarget, reverseResolver, resolver, node } =
      await deployFixture();
    await reverseResolver
      .connect(nameOwner)
      .setPrimaryName("alice.xdc", node);

    await resolver
      .connect(nameOwner)
      .setAddress(node, 1n, customTarget.address);
    expect(await resolver.addressFor(node, 1n)).to.equal(customTarget.address);
    expect(await resolver.addressFor(node, 8453n)).to.equal(nameOwner.address);

    const [target, recordOwner, active] = await resolver.addressRecord(node, 1n);
    expect(target).to.equal(customTarget.address);
    expect(recordOwner).to.equal(nameOwner.address);
    expect(active).to.equal(true);

    await resolver.connect(nameOwner).clearAddress(node, 1n);
    expect(await resolver.addressFor(node, 1n)).to.equal(nameOwner.address);
    const [, , activeAfterClear] = await resolver.addressRecord(node, 1n);
    expect(activeAfterClear).to.equal(false);
  });

  it("moves owner fallback when the owner chooses a different primary", async function () {
    const { nameOwner, registrar, reverseResolver, resolver, node } =
      await deployFixture();
    await reverseResolver
      .connect(nameOwner)
      .setPrimaryName("alice.xdc", node);

    const secondPrice = await registrar.price("second.xdc");
    await registrar
      .connect(nameOwner)
      .register("second.xdc", nameOwner.address, 1, { value: secondPrice });
    const secondNode = await registrar.nodeFor("second.xdc");
    await reverseResolver
      .connect(nameOwner)
      .setPrimaryName("second.xdc", secondNode);

    expect(await resolver.addressFor(node, 50n)).to.equal(ethers.ZeroAddress);
    expect(await resolver.addressFor(secondNode, 50n)).to.equal(
      nameOwner.address,
    );
  });

  it("invalidates the old owner's fallback on transfer", async function () {
    const {
      nameOwner,
      recipient,
      registry,
      reverseResolver,
      resolver,
      node,
    } = await deployFixture();
    await reverseResolver
      .connect(nameOwner)
      .setPrimaryName("alice.xdc", node);
    await registry.connect(nameOwner).transferName(node, recipient.address);

    expect(await resolver.addressFor(node, 137n)).to.equal(ethers.ZeroAddress);
    expect(await reverseResolver.primaryNames(nameOwner.address)).to.equal("");

    await reverseResolver
      .connect(recipient)
      .setPrimaryName("alice.xdc", node);
    expect(await resolver.addressFor(node, 137n)).to.equal(recipient.address);
  });

  it("does not reactivate a chain override or primary after ownership cycles", async function () {
    const {
      nameOwner,
      recipient,
      customTarget,
      registry,
      reverseResolver,
      resolver,
      node,
    } = await deployFixture();
    await reverseResolver
      .connect(nameOwner)
      .setPrimaryName("alice.xdc", node);
    await resolver
      .connect(nameOwner)
      .setAddress(node, 1n, customTarget.address);

    await registry.connect(nameOwner).transferName(node, recipient.address);
    await registry.connect(recipient).transferName(node, nameOwner.address);

    expect(await reverseResolver.primaryNames(nameOwner.address)).to.equal("");
    expect(await resolver.addressFor(node, 1n)).to.equal(ethers.ZeroAddress);
    expect((await resolver.addressRecord(node, 1n)).active).to.equal(false);
  });

  it("stops resolving the fallback after expiry", async function () {
    const { nameOwner, reverseResolver, resolver, node } =
      await deployFixture();
    await reverseResolver
      .connect(nameOwner)
      .setPrimaryName("alice.xdc", node);

    await ethers.provider.send("evm_increaseTime", [365 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine", []);

    expect(await resolver.addressFor(node, 42161n)).to.equal(
      ethers.ZeroAddress,
    );
    expect(await reverseResolver.primaryNames(nameOwner.address)).to.equal("");
  });

  it("rejects missing contract dependencies", async function () {
    const { registry, reverseResolver } = await deployFixture();
    const Resolver = await ethers.getContractFactory("XNSMultichainResolverV2");

    await expect(
      Resolver.deploy(ethers.ZeroAddress, await reverseResolver.getAddress()),
    ).to.be.revertedWithCustomError(Resolver, "InvalidDependency");
    await expect(
      Resolver.deploy(await registry.getAddress(), ethers.ZeroAddress),
    ).to.be.revertedWithCustomError(Resolver, "InvalidDependency");
  });

  it("rejects resolver deployments against a pre-generation Registry", async function () {
    const Legacy = await ethers.getContractFactory("MockLegacyRegistry");
    const legacy = await Legacy.deploy();
    const { reverseResolver } = await deployFixture();
    const Reverse = await ethers.getContractFactory("XNSReverseResolverV3");
    const Multichain = await ethers.getContractFactory(
      "XNSMultichainResolverV2",
    );

    await expect(
      Reverse.deploy(await legacy.getAddress()),
    ).to.be.revertedWithCustomError(Reverse, "InvalidRegistry");
    await expect(
      Multichain.deploy(
        await legacy.getAddress(),
        await reverseResolver.getAddress(),
      ),
    ).to.be.revertedWithCustomError(Multichain, "InvalidDependency");
  });
});
