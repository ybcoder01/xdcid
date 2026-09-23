import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("XNSRegistry hardening", function () {
  async function fixture() {
    const [owner, alice, bob, resolver] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("XNSRegistry");
    const registry = await Registry.deploy(owner.address);
    const node = ethers.keccak256(ethers.toUtf8Bytes("alice.xdc"));
    return { owner, alice, bob, resolver, registry, node };
  }

  it("rejects zero registrar and name-owner assignments", async function () {
    const { owner, alice, registry, node } = await fixture();

    await expect(registry.setRegistrar(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(registry, "InvalidRegistrar");
    await registry.setRegistrar(owner.address);
    await expect(registry.register(node, ethers.ZeroAddress, await time.latest() + 60))
      .to.be.revertedWithCustomError(registry, "InvalidNameOwner");

    await registry.register(node, alice.address, await time.latest() + 60);
    await expect(registry.connect(alice).transferName(node, ethers.ZeroAddress))
      .to.be.revertedWithCustomError(registry, "InvalidNameOwner");
  });

  it("emits complete registrar, registration, transfer, and resolver events", async function () {
    const { owner, alice, bob, resolver, registry, node } = await fixture();
    const expiry = await time.latest() + 60;

    await expect(registry.setRegistrar(owner.address))
      .to.emit(registry, "RegistrarChanged")
      .withArgs(ethers.ZeroAddress, owner.address);
    await expect(registry.register(node, alice.address, expiry))
      .to.emit(registry, "NameRegistered")
      .withArgs(node, alice.address, expiry);
    await expect(registry.connect(alice).setResolver(node, resolver.address))
      .to.emit(registry, "ResolverChanged")
      .withArgs(node, alice.address, resolver.address);
    await expect(registry.connect(alice).transferName(node, bob.address))
      .to.emit(registry, "NameTransferred")
      .withArgs(node, alice.address, bob.address);
  });

  it("does not expose resolver metadata for an expired name", async function () {
    const { owner, alice, resolver, registry, node } = await fixture();
    const expiry = await time.latest() + 60;
    await registry.setRegistrar(owner.address);
    await registry.register(node, alice.address, expiry);
    await registry.connect(alice).setResolver(node, resolver.address);
    expect(await registry.resolverOf(node)).to.equal(resolver.address);

    await time.increaseTo(expiry + 1);
    expect(await registry.ownerOf(node)).to.equal(ethers.ZeroAddress);
    expect(await registry.resolverOf(node)).to.equal(ethers.ZeroAddress);
  });
});
