import { expect } from "chai";
import { ethers } from "hardhat";

const YEAR = 365 * 24 * 60 * 60;
const ORGANIZATION_FEE = ethers.parseEther("100");

async function deployOrganization() {
  const [protocolOwner, parentOwner, manager, newParentOwner, recipient, treasury] =
    await ethers.getSigners();

  const Registry = await ethers.getContractFactory("XNSRegistry");
  const registry = await Registry.deploy(protocolOwner.address);

  const Registrar = await ethers.getContractFactory("XNSRegistrar");
  const registrar = await Registrar.deploy(
    await registry.getAddress(),
    protocolOwner.address
  );
  await registry.setRegistrar(await registrar.getAddress());

  const Organization = await ethers.getContractFactory("XNSOrganization");
  const organization = await Organization.deploy(
    await registry.getAddress(),
    protocolOwner.address,
    ORGANIZATION_FEE
  );

  const registrationPrice = await registrar.price("company.xdc");
  await registrar
    .connect(parentOwner)
    .register("company.xdc", parentOwner.address, 2, {
      value: registrationPrice * 2n
    });

  return {
    protocolOwner,
    parentOwner,
    manager,
    newParentOwner,
    recipient,
    treasury,
    registry,
    registrar,
    organization
  };
}

describe("XNSOrganization", function () {
  it("charges the configured annual fee and resolves issued subnames", async function () {
    const { parentOwner, recipient, organization } = await deployOrganization();

    await organization
      .connect(parentOwner)
      .subscribe("Company.XDC", 1, { value: ORGANIZATION_FEE });
    await organization
      .connect(parentOwner)
      .issueSubname("Alice", "company.xdc", recipient.address);

    expect(await organization.canonicalSubname("Alice", "Company.XDC")).to.equal(
      "alice.company.xdc"
    );
    expect(await organization.resolve("alice", "company.xdc")).to.equal(
      recipient.address
    );

    const [, owner, paidUntil, active] = await organization.organizationStatus(
      "company.xdc"
    );
    expect(owner).to.equal(parentOwner.address);
    expect(paidUntil).to.be.greaterThan(0n);
    expect(active).to.equal(true);
  });

  it("requires the active parent owner and exact subscription payment", async function () {
    const { parentOwner, manager, organization } = await deployOrganization();

    await expect(
      organization
        .connect(manager)
        .subscribe("company.xdc", 1, { value: ORGANIZATION_FEE })
    ).to.be.revertedWithCustomError(organization, "NotParentOwner");

    await expect(
      organization
        .connect(parentOwner)
        .subscribe("company.xdc", 1, { value: ORGANIZATION_FEE - 1n })
    ).to.be.revertedWithCustomError(organization, "WrongPrice");

    await expect(
      organization.connect(parentOwner).subscribe("company.xdc", 0, { value: 0 })
    ).to.be.revertedWithCustomError(organization, "InvalidDuration");

    await expect(
      organization
        .connect(parentOwner)
        .subscribe("company.xdc", 11, { value: ORGANIZATION_FEE * 11n })
    ).to.be.revertedWithCustomError(organization, "InvalidDuration");
  });

  it("requires a fresh workspace after transfer and invalidates old records", async function () {
    const {
      parentOwner,
      manager,
      newParentOwner,
      recipient,
      registry,
      registrar,
      organization
    } = await deployOrganization();

    await organization
      .connect(parentOwner)
      .subscribe("company.xdc", 1, { value: ORGANIZATION_FEE });
    await organization
      .connect(parentOwner)
      .setManager("company.xdc", manager.address, true);

    await organization
      .connect(manager)
      .issueSubname("treasury", "company.xdc", recipient.address);
    expect(await organization.resolve("treasury", "company.xdc")).to.equal(
      recipient.address
    );

    const parentNode = await registrar.nodeFor("company.xdc");
    await registry
      .connect(parentOwner)
      .transferName(parentNode, newParentOwner.address);

    expect(await organization.isManager(parentNode, manager.address)).to.equal(false);
    await expect(
      organization
        .connect(manager)
        .issueSubname("ops", "company.xdc", recipient.address)
    ).to.be.revertedWithCustomError(organization, "NotParentController");

    expect(await organization.resolve("treasury", "company.xdc")).to.equal(
      ethers.ZeroAddress
    );
    await expect(
      organization
        .connect(newParentOwner)
        .issueSubname("ops", "company.xdc", newParentOwner.address)
    ).to.be.revertedWithCustomError(organization, "NotParentController");

    await organization
      .connect(newParentOwner)
      .subscribe("company.xdc", 1, { value: ORGANIZATION_FEE });
    expect(await organization.resolve("treasury", "company.xdc")).to.equal(
      ethers.ZeroAddress
    );

    await organization
      .connect(newParentOwner)
      .issueSubname("ops", "company.xdc", newParentOwner.address);
    expect(await organization.resolve("ops", "company.xdc")).to.equal(
      newParentOwner.address
    );
  });

  it("bulk issues and revokes organization subnames", async function () {
    const { parentOwner, manager, recipient, organization } =
      await deployOrganization();

    await organization
      .connect(parentOwner)
      .subscribe("company.xdc", 1, { value: ORGANIZATION_FEE });

    await organization.connect(parentOwner).bulkIssue(
      ["alice", "treasury", "invoice-104"],
      "company.xdc",
      [recipient.address, manager.address, parentOwner.address]
    );

    expect(await organization.resolve("alice", "company.xdc")).to.equal(
      recipient.address
    );
    expect(await organization.resolve("treasury", "company.xdc")).to.equal(
      manager.address
    );

    await organization
      .connect(parentOwner)
      .revokeSubname("treasury", "company.xdc");
    expect(await organization.resolve("treasury", "company.xdc")).to.equal(
      ethers.ZeroAddress
    );

    await expect(
      organization
        .connect(parentOwner)
        .bulkIssue(["one"], "company.xdc", [])
    ).to.be.revertedWithCustomError(organization, "InvalidBulkRequest");
  });

  it("stops resolution and issuance when the organization subscription expires", async function () {
    const { parentOwner, recipient, organization } = await deployOrganization();

    await organization
      .connect(parentOwner)
      .subscribe("company.xdc", 1, { value: ORGANIZATION_FEE });
    await organization
      .connect(parentOwner)
      .issueSubname("alice", "company.xdc", recipient.address);

    await ethers.provider.send("evm_increaseTime", [YEAR + 1]);
    await ethers.provider.send("evm_mine", []);

    expect(await organization.resolve("alice", "company.xdc")).to.equal(
      ethers.ZeroAddress
    );
    await expect(
      organization
        .connect(parentOwner)
        .issueSubname("bob", "company.xdc", recipient.address)
    ).to.be.revertedWithCustomError(organization, "InactiveOrganization");
  });

  it("restricts pricing and revenue withdrawal to the protocol owner", async function () {
    const {
      protocolOwner,
      parentOwner,
      treasury,
      organization
    } = await deployOrganization();

    await expect(
      organization.connect(parentOwner).setAnnualFee(ethers.parseEther("200"))
    ).to.be.revertedWithCustomError(
      organization,
      "OwnableUnauthorizedAccount"
    );

    await organization
      .connect(protocolOwner)
      .setAnnualFee(ethers.parseEther("200"));
    expect(await organization.annualFee()).to.equal(ethers.parseEther("200"));

    await organization
      .connect(parentOwner)
      .subscribe("company.xdc", 1, { value: ethers.parseEther("200") });

    await expect(
      organization.connect(parentOwner).withdraw(treasury.address)
    ).to.be.revertedWithCustomError(
      organization,
      "OwnableUnauthorizedAccount"
    );

    await organization.connect(protocolOwner).withdraw(treasury.address);
    expect(
      await ethers.provider.getBalance(await organization.getAddress())
    ).to.equal(0n);
  });

  it("rejects malformed labels and zero targets", async function () {
    const { parentOwner, organization } = await deployOrganization();

    await organization
      .connect(parentOwner)
      .subscribe("company.xdc", 1, { value: ORGANIZATION_FEE });

    for (const label of ["", "-alice", "alice-", "ali ce", "alice.ops"]) {
      await expect(
        organization
          .connect(parentOwner)
          .issueSubname(label, "company.xdc", parentOwner.address)
      ).to.be.revertedWithCustomError(organization, "InvalidName");
    }

    await expect(
      organization
        .connect(parentOwner)
        .issueSubname("alice", "company.xdc", ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(organization, "InvalidTarget");
  });
});
