import { expect } from "chai";
import { ethers } from "hardhat";

const YEAR = 365 * 24 * 60 * 60;

async function deploy() {
  const [admin, formerOwner, newOwner, formerDestination] =
    await ethers.getSigners();
  const Registry = await ethers.getContractFactory("XNSRegistry");
  const registry = await Registry.deploy(admin.address);
  await registry.setRegistrar(admin.address);

  const Resolver = await ethers.getContractFactory("XNSResolverV2");
  const resolver = await Resolver.deploy(await registry.getAddress());
  const node = ethers.keccak256(ethers.toUtf8Bytes("audit.xdc"));
  const expiry = (await ethers.provider.getBlock("latest"))!.timestamp + YEAR;
  await registry.register(node, formerOwner.address, expiry);

  return {
    admin,
    formerOwner,
    newOwner,
    formerDestination,
    registry,
    resolver,
    node
  };
}

describe("XNSResolverV2", function () {
  it("returns the active owner when no custom address exists", async function () {
    const { formerOwner, resolver, node } = await deploy();
    expect(await resolver.addresses(node)).to.equal(formerOwner.address);
  });

  it("invalidates address and text records when a name transfers", async function () {
    const {
      formerOwner,
      newOwner,
      formerDestination,
      registry,
      resolver,
      node
    } = await deploy();

    await resolver
      .connect(formerOwner)
      .setAddress(node, formerDestination.address);
    await resolver.connect(formerOwner).setText(node, "bio", "former owner");
    expect(await resolver.addresses(node)).to.equal(formerDestination.address);

    await registry.connect(formerOwner).transferName(node, newOwner.address);

    expect(await resolver.addresses(node)).to.equal(newOwner.address);
    expect(await resolver.text(node, "bio")).to.equal("");
    expect((await resolver.addressRecord(node)).active).to.equal(false);
    expect((await resolver.textRecord(node, "bio")).active).to.equal(false);
  });

  it("returns no records after expiry", async function () {
    const { formerOwner, formerDestination, resolver, node } = await deploy();
    await resolver
      .connect(formerOwner)
      .setAddress(node, formerDestination.address);
    await resolver.connect(formerOwner).setText(node, "bio", "active");

    await ethers.provider.send("evm_increaseTime", [YEAR + 1]);
    await ethers.provider.send("evm_mine", []);

    expect(await resolver.addresses(node)).to.equal(ethers.ZeroAddress);
    expect(await resolver.text(node, "bio")).to.equal("");
  });

  it("does not reactivate former records after re-registration", async function () {
    const {
      admin,
      formerOwner,
      newOwner,
      formerDestination,
      registry,
      resolver,
      node
    } = await deploy();
    await resolver
      .connect(formerOwner)
      .setAddress(node, formerDestination.address);
    await resolver.connect(formerOwner).setText(node, "bio", "former owner");

    await ethers.provider.send("evm_increaseTime", [YEAR + 1]);
    await ethers.provider.send("evm_mine", []);
    const expiry = (await ethers.provider.getBlock("latest"))!.timestamp + YEAR;
    await registry.connect(admin).register(node, newOwner.address, expiry);

    expect(await resolver.addresses(node)).to.equal(newOwner.address);
    expect(await resolver.text(node, "bio")).to.equal("");
  });

  it("allows only the active owner to change records", async function () {
    const { formerOwner, newOwner, resolver, node } = await deploy();
    await expect(
      resolver.connect(newOwner).setAddress(node, newOwner.address)
    ).to.be.revertedWithCustomError(resolver, "NotNameOwner");

    await resolver.connect(formerOwner).setAddress(node, ethers.ZeroAddress);
    expect(await resolver.addresses(node)).to.equal(formerOwner.address);
  });
});
