import { expect } from "chai";
import { ethers } from "hardhat";

const CHAINS = {
  ethereum: 1n,
  xdc: 50n,
  polygon: 137n,
  base: 8453n,
  arbitrum: 42161n
} as const;

async function deployFixture() {
  const [protocolOwner, nameOwner, other, xdcTarget, ethereumTarget, baseTarget, arbitrumTarget, polygonTarget] =
    await ethers.getSigners();

  const Registry = await ethers.getContractFactory("XNSRegistry");
  const registry = await Registry.deploy(protocolOwner.address);

  const Registrar = await ethers.getContractFactory("XNSRegistrar");
  const registrar = await Registrar.deploy(await registry.getAddress(), protocolOwner.address);
  await registry.setRegistrar(await registrar.getAddress());

  const MultichainResolver = await ethers.getContractFactory("XNSMultichainResolver");
  const resolver = await MultichainResolver.deploy(await registry.getAddress());

  const price = await registrar.price("alice.xdc");
  await registrar.connect(nameOwner).register("alice.xdc", nameOwner.address, 1, { value: price });
  const node = await registrar.nodeFor("alice.xdc");

  return {
    registry,
    registrar,
    resolver,
    node,
    nameOwner,
    other,
    targets: {
      [CHAINS.xdc.toString()]: xdcTarget.address,
      [CHAINS.ethereum.toString()]: ethereumTarget.address,
      [CHAINS.base.toString()]: baseTarget.address,
      [CHAINS.arbitrum.toString()]: arbitrumTarget.address,
      [CHAINS.polygon.toString()]: polygonTarget.address
    }
  };
}

describe("XNSMultichainResolver", function () {
  it("stores independent addresses for the five initial networks", async function () {
    const { resolver, node, nameOwner, targets } = await deployFixture();

    for (const chainId of Object.values(CHAINS)) {
      const target = targets[chainId.toString()];
      await expect(resolver.connect(nameOwner).setAddress(node, chainId, target))
        .to.emit(resolver, "ChainAddressSet")
        .withArgs(node, chainId, target, nameOwner.address);
      expect(await resolver.addressFor(node, chainId)).to.equal(target);
    }
  });

  it("accepts future non-zero EVM chain IDs without a contract upgrade", async function () {
    const { resolver, node, nameOwner, other } = await deployFixture();

    await resolver.connect(nameOwner).setAddress(node, 999999n, other.address);
    expect(await resolver.addressFor(node, 999999n)).to.equal(other.address);
  });

  it("only permits the active name owner to change records", async function () {
    const { resolver, node, nameOwner, other } = await deployFixture();

    await expect(
      resolver.connect(other).setAddress(node, CHAINS.base, other.address)
    ).to.be.revertedWithCustomError(resolver, "NotNameOwner");

    await expect(
      resolver.connect(other).clearAddress(node, CHAINS.base)
    ).to.be.revertedWithCustomError(resolver, "NotNameOwner");

    await expect(
      resolver.connect(nameOwner).setAddress(node, 0, other.address)
    ).to.be.revertedWithCustomError(resolver, "InvalidChainId");

    await expect(
      resolver.connect(nameOwner).setAddress(node, CHAINS.base, ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(resolver, "InvalidTarget");
  });

  it("clears a chain without modifying the other chain records", async function () {
    const { resolver, node, nameOwner, other } = await deployFixture();

    await resolver.connect(nameOwner).setAddress(node, CHAINS.base, other.address);
    await resolver.connect(nameOwner).setAddress(node, CHAINS.ethereum, nameOwner.address);

    await expect(resolver.connect(nameOwner).clearAddress(node, CHAINS.base))
      .to.emit(resolver, "ChainAddressCleared")
      .withArgs(node, CHAINS.base, nameOwner.address);

    expect(await resolver.addressFor(node, CHAINS.base)).to.equal(ethers.ZeroAddress);
    expect(await resolver.addressFor(node, CHAINS.ethereum)).to.equal(nameOwner.address);
  });

  it("invalidates records when the name transfers to another owner", async function () {
    const { registry, resolver, node, nameOwner, other } = await deployFixture();

    await resolver.connect(nameOwner).setAddress(node, CHAINS.polygon, nameOwner.address);
    await registry.connect(nameOwner).transferName(node, other.address);

    expect(await resolver.addressFor(node, CHAINS.polygon)).to.equal(ethers.ZeroAddress);
    const [, recordOwner, active] = await resolver.addressRecord(node, CHAINS.polygon);
    expect(recordOwner).to.equal(nameOwner.address);
    expect(active).to.equal(false);

    await expect(
      resolver.connect(nameOwner).setAddress(node, CHAINS.polygon, nameOwner.address)
    ).to.be.revertedWithCustomError(resolver, "NotNameOwner");

    await resolver.connect(other).setAddress(node, CHAINS.polygon, other.address);
    expect(await resolver.addressFor(node, CHAINS.polygon)).to.equal(other.address);
  });

  it("stops resolving records after the XDCID name expires", async function () {
    const { resolver, node, nameOwner } = await deployFixture();

    await resolver.connect(nameOwner).setAddress(node, CHAINS.arbitrum, nameOwner.address);
    await ethers.provider.send("evm_increaseTime", [365 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine", []);

    expect(await resolver.addressFor(node, CHAINS.arbitrum)).to.equal(ethers.ZeroAddress);
    await expect(
      resolver.connect(nameOwner).clearAddress(node, CHAINS.arbitrum)
    ).to.be.revertedWithCustomError(resolver, "NotNameOwner");
  });

  it("rejects a zero registry address", async function () {
    const MultichainResolver = await ethers.getContractFactory("XNSMultichainResolver");
    await expect(MultichainResolver.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      MultichainResolver,
      "InvalidTarget"
    );
  });
});
