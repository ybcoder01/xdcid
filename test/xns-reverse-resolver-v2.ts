import { expect } from "chai";
import { ethers } from "hardhat";

const YEAR = 365 * 24 * 60 * 60;

async function deploy() {
  const [admin, formerOwner, newOwner] = await ethers.getSigners();
  const Registry = await ethers.getContractFactory("XNSRegistry");
  const registry = await Registry.deploy(admin.address);
  await registry.setRegistrar(admin.address);

  const ReverseResolver = await ethers.getContractFactory(
    "XNSReverseResolverV2"
  );
  const reverse = await ReverseResolver.deploy(await registry.getAddress());
  const name = "audit.xdc";
  const node = ethers.keccak256(ethers.toUtf8Bytes(name));
  const expiry = (await ethers.provider.getBlock("latest"))!.timestamp + YEAR;
  await registry.register(node, formerOwner.address, expiry);

  return { admin, formerOwner, newOwner, registry, reverse, name, node };
}

describe("XNSReverseResolverV2", function () {
  it("returns a primary name only while the account owns it", async function () {
    const { formerOwner, reverse, name, node } = await deploy();
    await reverse.connect(formerOwner).setPrimaryName(name, node);
    expect(await reverse.primaryNames(formerOwner.address)).to.equal(name);
    expect((await reverse.primaryRecord(formerOwner.address)).active).to.equal(
      true
    );
  });

  it("invalidates a primary name after transfer", async function () {
    const { formerOwner, newOwner, registry, reverse, name, node } =
      await deploy();
    await reverse.connect(formerOwner).setPrimaryName(name, node);
    await registry.connect(formerOwner).transferName(node, newOwner.address);

    expect(await reverse.primaryNames(formerOwner.address)).to.equal("");
    expect((await reverse.primaryRecord(formerOwner.address)).active).to.equal(
      false
    );
  });

  it("invalidates a primary name after expiry and re-registration", async function () {
    const { admin, formerOwner, newOwner, registry, reverse, name, node } =
      await deploy();
    await reverse.connect(formerOwner).setPrimaryName(name, node);

    await ethers.provider.send("evm_increaseTime", [YEAR + 1]);
    await ethers.provider.send("evm_mine", []);
    expect(await reverse.primaryNames(formerOwner.address)).to.equal("");

    const expiry = (await ethers.provider.getBlock("latest"))!.timestamp + YEAR;
    await registry.connect(admin).register(node, newOwner.address, expiry);
    expect(await reverse.primaryNames(formerOwner.address)).to.equal("");
  });

  it("rejects mismatched names and non-owners", async function () {
    const { formerOwner, newOwner, reverse, node } = await deploy();
    await expect(
      reverse.connect(formerOwner).setPrimaryName("wrong.xdc", node)
    ).to.be.revertedWithCustomError(reverse, "InvalidName");
    await expect(
      reverse.connect(newOwner).setPrimaryName("audit.xdc", node)
    ).to.be.revertedWithCustomError(reverse, "NotNameOwner");
  });

  it("allows an account to clear its own reverse record", async function () {
    const { formerOwner, reverse, name, node } = await deploy();
    await reverse.connect(formerOwner).setPrimaryName(name, node);
    await reverse.connect(formerOwner).clearPrimaryName();
    expect(await reverse.primaryNames(formerOwner.address)).to.equal("");
  });
});
