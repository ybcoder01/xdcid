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
    expect(await registry.ownershipGenerations(node)).to.equal(1n);
    await expect(registry.connect(alice).setResolver(node, resolver.address))
      .to.emit(registry, "ResolverChanged")
      .withArgs(node, alice.address, resolver.address);
    await expect(registry.connect(alice).transferName(node, bob.address))
      .to.emit(registry, "NameTransferred")
      .withArgs(node, alice.address, bob.address);
    expect(await registry.ownershipGenerations(node)).to.equal(2n);
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

  it("clears the previous owner's resolver on transfer", async function () {
    const { owner, alice, bob, resolver, registry, node } = await fixture();
    await registry.setRegistrar(owner.address);
    await registry.register(node, alice.address, await time.latest() + 60);
    await registry.connect(alice).setResolver(node, resolver.address);

    await expect(registry.connect(alice).transferName(node, bob.address))
      .to.emit(registry, "ResolverChanged")
      .withArgs(node, alice.address, ethers.ZeroAddress);

    expect(await registry.ownerOf(node)).to.equal(bob.address);
    expect(await registry.resolverOf(node)).to.equal(ethers.ZeroAddress);
    expect((await registry.records(node)).resolver).to.equal(
      ethers.ZeroAddress,
    );
  });

  it("clears an expired resolver on re-registration but preserves it on renewal", async function () {
    const { owner, alice, bob, resolver, registry, node } = await fixture();
    const firstExpiry = await time.latest() + 60;
    await registry.setRegistrar(owner.address);
    await registry.register(node, alice.address, firstExpiry);
    await registry.connect(alice).setResolver(node, resolver.address);

    await registry.register(node, alice.address, firstExpiry + 60);
    expect(await registry.resolverOf(node)).to.equal(resolver.address);
    expect(await registry.ownershipGenerations(node)).to.equal(1n);

    await time.increaseTo(firstExpiry + 61);
    const nextExpiry = await time.latest() + 60;
    await expect(registry.register(node, bob.address, nextExpiry))
      .to.emit(registry, "ResolverChanged")
      .withArgs(node, alice.address, ethers.ZeroAddress);

    expect(await registry.ownerOf(node)).to.equal(bob.address);
    expect(await registry.resolverOf(node)).to.equal(ethers.ZeroAddress);
    expect(await registry.ownershipGenerations(node)).to.equal(2n);
  });
});
