import { expect } from "chai";
import { ethers } from "hardhat";

async function deployRegistrarV3() {
  const [owner, alice, bob] = await ethers.getSigners();

  const Registry = await ethers.getContractFactory("XNSRegistry");
  const registry = await Registry.deploy(owner.address);

  const Legacy = await ethers.getContractFactory("MockLegacyRegistry");
  const legacy = await Legacy.deploy();

  const Registrar = await ethers.getContractFactory("XNSRegistrarV3");
  const registrar = await Registrar.deploy(
    await registry.getAddress(),
    await legacy.getAddress(),
    owner.address,
  );
  await registry.setRegistrar(await registrar.getAddress());

  const Controller = await ethers.getContractFactory(
    "MockMigrationController",
  );
  const controller = await Controller.deploy();

  return {
    owner,
    alice,
    bob,
    registry,
    legacy,
    registrar,
    controller,
  };
}

describe("XNSRegistrarV3 legacy guard", function () {
  it("keeps ordinary registration available for new names", async function () {
    const { alice, registry, registrar } = await deployRegistrarV3();
    const price = await registrar.price("fresh-name.xdc");

    expect(await registrar.available("fresh-name.xdc")).to.equal(true);
    await registrar
      .connect(alice)
      .register("fresh-name.xdc", alice.address, 1, { value: price });

    const node = await registrar.nodeFor("fresh-name.xdc");
    expect(await registry.ownerOf(node)).to.equal(alice.address);
  });

  it("blocks legacy names in available and register", async function () {
    const { alice, legacy, registrar } = await deployRegistrarV3();
    await legacy.setName("legacy-name.xdc", 1232, true);
    const price = await registrar.price("legacy-name.xdc");

    expect(await registrar.legacyRegistered("legacy-name.xdc")).to.equal(true);
    expect(await registrar.available("legacy-name.xdc")).to.equal(false);
    await expect(
      registrar
        .connect(alice)
        .register("legacy-name.xdc", alice.address, 1, { value: price }),
    ).to.be.revertedWithCustomError(registrar, "Unavailable");
  });

  it("canonicalizes before consulting the legacy registry", async function () {
    const { alice, legacy, registrar } = await deployRegistrarV3();
    await legacy.setName("case-name.xdc", 44, true);
    const price = await registrar.price("Case-Name.XDC");

    expect(await registrar.legacyRegistered("Case-Name.XDC")).to.equal(true);
    await expect(
      registrar
        .connect(alice)
        .register("Case-Name.XDC", alice.address, 1, { value: price }),
    ).to.be.revertedWithCustomError(registrar, "Unavailable");
  });

  it("fails closed when the legacy registry cannot be read", async function () {
    const { alice, legacy, registrar } = await deployRegistrarV3();
    await legacy.setFailReads(true);
    const price = await registrar.price("unverified.xdc");

    await expect(registrar.available("unverified.xdc")).to.be.revertedWith(
      "legacy read failed",
    );
    await expect(
      registrar
        .connect(alice)
        .register("unverified.xdc", alice.address, 1, { value: price }),
    ).to.be.revertedWith("legacy read failed");
  });

  it("allows the owner to authorize one deployed migration contract", async function () {
    const { owner, alice, registrar, controller } =
      await deployRegistrarV3();

    await expect(
      registrar.connect(alice).setMigrationController(alice.address),
    ).to.be.revertedWithCustomError(
      registrar,
      "OwnableUnauthorizedAccount",
    );
    await expect(
      registrar.connect(owner).setMigrationController(alice.address),
    ).to.be.revertedWithCustomError(
      registrar,
      "InvalidMigrationController",
    );

    await registrar
      .connect(owner)
      .setMigrationController(await controller.getAddress());
    expect(await registrar.migrationController()).to.equal(
      await controller.getAddress(),
    );

    await expect(
      registrar
        .connect(owner)
        .setMigrationController(await controller.getAddress()),
    ).to.be.revertedWithCustomError(
      registrar,
      "MigrationControllerAlreadySet",
    );
  });

  it("reserves migration registration for the authorized controller", async function () {
    const { owner, alice, bob, registry, legacy, registrar, controller } =
      await deployRegistrarV3();
    await legacy.setName("migrate-me.xdc", 99, true);

    await expect(
      registrar
        .connect(owner)
        .registerMigration("migrate-me.xdc", alice.address, 1),
    ).to.be.revertedWithCustomError(registrar, "NotMigrationController");

    await registrar
      .connect(owner)
      .setMigrationController(await controller.getAddress());
    await controller.migrate(
      await registrar.getAddress(),
      "migrate-me.xdc",
      alice.address,
      1,
    );

    const node = await registrar.nodeFor("migrate-me.xdc");
    expect(await registry.ownerOf(node)).to.equal(alice.address);

    await expect(
      controller.migrate(
        await registrar.getAddress(),
        "not-legacy.xdc",
        bob.address,
        1,
      ),
    ).to.be.revertedWithCustomError(registrar, "LegacyNameRequired");
  });

  it("does not overwrite an active XDCID record during migration", async function () {
    const { owner, alice, bob, legacy, registrar, controller } =
      await deployRegistrarV3();
    const price = await registrar.price("collision.xdc");
    await registrar
      .connect(alice)
      .register("collision.xdc", alice.address, 1, { value: price });
    await legacy.setName("collision.xdc", 100, true);
    await registrar
      .connect(owner)
      .setMigrationController(await controller.getAddress());

    await expect(
      controller.migrate(
        await registrar.getAddress(),
        "collision.xdc",
        bob.address,
        1,
      ),
    ).to.be.revertedWithCustomError(registrar, "Unavailable");
  });
});
