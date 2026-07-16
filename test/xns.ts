import { expect } from "chai";
import { ethers } from "hardhat";

const YEAR = 365 * 24 * 60 * 60;

async function deploy() {
  const [owner, alice, bob] = await ethers.getSigners();
  const Registry = await ethers.getContractFactory("XNSRegistry");
  const registry = await Registry.deploy(owner.address);

  const Registrar = await ethers.getContractFactory("XNSRegistrar");
  const registrar = await Registrar.deploy(await registry.getAddress(), owner.address);
  await registry.setRegistrar(await registrar.getAddress());

  const Resolver = await ethers.getContractFactory("XNSResolver");
  const resolver = await Resolver.deploy(await registry.getAddress());

  const Reverse = await ethers.getContractFactory("XNSReverseResolver");
  const reverse = await Reverse.deploy(await registry.getAddress());

  return { owner, alice, bob, registry, registrar, resolver, reverse };
}

describe("XNS Protocol", function () {
  it("registers a .xdc name", async function () {
    const { alice, registry, registrar } = await deploy();
    const price = await registrar.price("alice.xdc");

    await registrar.connect(alice).register("alice.xdc", alice.address, 1, { value: price });
    const node = await registrar.nodeFor("alice.xdc");

    expect(await registry.ownerOf(node)).to.equal(alice.address);
  });

  it("canonicalizes label and suffix casing", async function () {
    const { registrar } = await deploy();

    expect(await registrar.canonicalize("Alice.XDC")).to.equal("alice.xdc");
    expect(await registrar.nodeFor("Alice.XDC")).to.equal(await registrar.nodeFor("alice.xdc"));
  });

  it("rejects invalid labels", async function () {
    const { registrar } = await deploy();
    const invalidNames = [
      "ab.xdc",
      "-alice.xdc",
      "alice-.xdc",
      "ali ce.xdc",
      "ali_ce.xdc",
      "alice.eth",
      "alice.xdc.xdc",
      "a".repeat(64) + ".xdc"
    ];

    for (const name of invalidNames) {
      await expect(registrar.canonicalize(name)).to.be.revertedWithCustomError(registrar, "InvalidName");
    }
  });

  it("prevents duplicate registration through case variants", async function () {
    const { alice, bob, registrar } = await deploy();
    const price = await registrar.price("Alice.XDC");

    await registrar.connect(alice).register("Alice.XDC", alice.address, 1, { value: price });

    expect(await registrar.available("alice.xdc")).to.equal(false);
    await expect(
      registrar.connect(bob).register("alice.xdc", bob.address, 1, { value: price })
    ).to.be.revertedWithCustomError(registrar, "Unavailable");
  });

  it("fails duplicate registration", async function () {
    const { alice, bob, registrar } = await deploy();
    const price = await registrar.price("alice.xdc");

    await registrar.connect(alice).register("alice.xdc", alice.address, 1, { value: price });

    await expect(
      registrar.connect(bob).register("alice.xdc", bob.address, 1, { value: price })
    ).to.be.revertedWithCustomError(registrar, "Unavailable");
  });

  it("makes expired names available", async function () {
    const { alice, bob, registry, registrar } = await deploy();
    const price = await registrar.price("alice.xdc");

    await registrar.connect(alice).register("alice.xdc", alice.address, 1, { value: price });
    await ethers.provider.send("evm_increaseTime", [YEAR + 1]);
    await ethers.provider.send("evm_mine", []);

    expect(await registrar.available("alice.xdc")).to.equal(true);
    await registrar.connect(bob).register("alice.xdc", bob.address, 1, { value: price });

    expect(await registry.ownerOf(await registrar.nodeFor("alice.xdc"))).to.equal(bob.address);
  });

  it("prices names by label length", async function () {
    const { registrar } = await deploy();

    expect(await registrar.price("abc.xdc")).to.equal(ethers.parseEther("500"));
    expect(await registrar.price("abcd.xdc")).to.equal(ethers.parseEther("100"));
    expect(await registrar.price("abcde.xdc")).to.equal(ethers.parseEther("10"));
    expect(await registrar.price("abc.XDC")).to.equal(ethers.parseEther("500"));
    await expect(registrar.price("ab.xdc")).to.be.revertedWithCustomError(registrar, "InvalidName");
  });

  it("defaults resolver address to current owner", async function () {
    const { alice, registrar, resolver } = await deploy();
    const price = await registrar.price("alice.xdc");
    await registrar.connect(alice).register("alice.xdc", alice.address, 1, { value: price });
    const node = await registrar.nodeFor("alice.xdc");

    expect(await resolver.addresses(node)).to.equal(alice.address);
  });

  it("allows only owner to edit resolver records", async function () {
    const { alice, bob, registrar, resolver } = await deploy();
    const price = await registrar.price("alice.xdc");
    await registrar.connect(alice).register("alice.xdc", alice.address, 1, { value: price });
    const node = await registrar.nodeFor("alice.xdc");

    await resolver.connect(alice).setText(node, "bio", "hello");
    expect(await resolver.text(node, "bio")).to.equal("hello");

    await expect(
      resolver.connect(bob).setText(node, "bio", "nope")
    ).to.be.revertedWithCustomError(resolver, "NotNameOwner");
  });

  it("allows only owner to transfer a name", async function () {
    const { alice, bob, registrar, registry, resolver } = await deploy();
    const price = await registrar.price("alice.xdc");
    await registrar.connect(alice).register("alice.xdc", alice.address, 1, { value: price });
    const node = await registrar.nodeFor("alice.xdc");

    await expect(
      registry.connect(bob).transferName(node, bob.address)
    ).to.be.revertedWithCustomError(registry, "NotNameOwner");

    await registry.connect(alice).transferName(node, bob.address);

    expect(await registry.ownerOf(node)).to.equal(bob.address);
    expect(await resolver.addresses(node)).to.equal(bob.address);
  });

  it("allows only owner to set reverse primary name", async function () {
    const { alice, bob, registrar, reverse } = await deploy();
    const price = await registrar.price("alice.xdc");
    await registrar.connect(alice).register("alice.xdc", alice.address, 1, { value: price });
    const node = await registrar.nodeFor("alice.xdc");

    await reverse.connect(alice).setPrimaryName("alice.xdc", node);
    expect(await reverse.primaryNames(alice.address)).to.equal("alice.xdc");

    await expect(
      reverse.connect(bob).setPrimaryName("alice.xdc", node)
    ).to.be.revertedWithCustomError(reverse, "NotNameOwner");
  });

  it("renews owned names", async function () {
    const { alice, registry, registrar } = await deploy();
    const price = await registrar.price("alice.xdc");
    await registrar.connect(alice).register("alice.xdc", alice.address, 1, { value: price });
    const node = await registrar.nodeFor("alice.xdc");
    const before = await registry.expiryOf(node);

    await registrar.connect(alice).renew("alice.xdc", 1, { value: price });

    expect(await registry.expiryOf(node)).to.equal(before + BigInt(YEAR));
  });

  it("allows only registrar owner to withdraw funds", async function () {
    const { owner, alice, bob, registrar } = await deploy();
    const price = await registrar.price("alice.xdc");
    await registrar.connect(alice).register("alice.xdc", alice.address, 1, { value: price });

    await expect(
      registrar.connect(alice).withdraw(bob.address)
    ).to.be.revertedWithCustomError(registrar, "OwnableUnauthorizedAccount");

    await registrar.connect(owner).withdraw(bob.address);

    expect(await ethers.provider.getBalance(await registrar.getAddress())).to.equal(0n);
  });
});
