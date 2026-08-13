import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("XNSDiscountAuthorization", function () {
  const types = {
    DiscountAuthorization: [
      { name: "node", type: "bytes32" },
      { name: "beneficiary", type: "address" },
      { name: "product", type: "uint8" },
      { name: "termYears", type: "uint256" },
      { name: "discountBps", type: "uint16" },
      { name: "maxUses", type: "uint32" },
      { name: "validAfter", type: "uint64" },
      { name: "deadline", type: "uint64" },
      { name: "nonce", type: "uint256" },
    ],
  };

  async function fixture() {
    const [owner, signer, consumer, beneficiary, outsider, nextConsumer] =
      await ethers.getSigners();
    const factory = await ethers.getContractFactory("XNSDiscountAuthorization");
    const module = await factory.deploy(
      owner.address,
      signer.address,
      consumer.address,
    );
    const network = await ethers.provider.getNetwork();
    const domain = {
      name: "XDCID Discount Authorization",
      version: "1",
      chainId: network.chainId,
      verifyingContract: await module.getAddress(),
    };
    const now = await time.latest();
    const authorization = {
      node: ethers.keccak256(ethers.toUtf8Bytes("aa.xdc")),
      beneficiary: beneficiary.address,
      product: 0,
      termYears: 1,
      discountBps: 5_000,
      maxUses: 1,
      validAfter: now,
      deadline: now + 3_600,
      nonce: 7,
    };
    const sign = (target = authorization) =>
      signer.signTypedData(domain, types, target);
    return {
      module,
      owner,
      signer,
      consumer,
      beneficiary,
      outsider,
      nextConsumer,
      domain,
      authorization,
      sign,
    };
  }

  it("consumes an exact-name authorization once", async function () {
    const { module, consumer, authorization, sign } = await fixture();
    const signature = await sign();

    await expect(
      module.connect(consumer).consume(
        authorization,
        signature,
        authorization.node,
        authorization.beneficiary,
        authorization.product,
        authorization.termYears,
      ),
    )
      .to.emit(module, "AuthorizationConsumed")
      .withArgs(
        await module.hashAuthorization(authorization),
        authorization.node,
        authorization.beneficiary,
        authorization.discountBps,
        1,
        1,
      );

    expect(
      await module.isUsable(authorization, signature),
    ).to.equal(false);
    await expect(
      module.connect(consumer).consume(
        authorization,
        signature,
        authorization.node,
        authorization.beneficiary,
        authorization.product,
        authorization.termYears,
      ),
    ).to.be.revertedWithCustomError(module, "AuthorizationExhausted");
  });

  it("prevents outsiders from consuming or burning an authorization", async function () {
    const { module, outsider, authorization, sign } = await fixture();
    await expect(
      module.connect(outsider).consume(
        authorization,
        await sign(),
        authorization.node,
        authorization.beneficiary,
        authorization.product,
        authorization.termYears,
      ),
    ).to.be.revertedWithCustomError(module, "UnauthorizedConsumer");
  });

  it("binds the authorization to name, wallet, product, and term", async function () {
    const { module, consumer, outsider, authorization, sign } = await fixture();
    const signature = await sign();

    await expect(
      module.connect(consumer).consume(
        authorization,
        signature,
        ethers.keccak256(ethers.toUtf8Bytes("bb.xdc")),
        authorization.beneficiary,
        authorization.product,
        authorization.termYears,
      ),
    ).to.be.revertedWithCustomError(module, "InvalidAuthorization");

    await expect(
      module.connect(consumer).consume(
        authorization,
        signature,
        authorization.node,
        outsider.address,
        authorization.product,
        authorization.termYears,
      ),
    ).to.be.revertedWithCustomError(module, "InvalidAuthorization");
  });

  it("supports partial and free allocations", async function () {
    const { module } = await fixture();
    expect(await module.applyDiscount(50_000_000, 2_500)).to.equal(37_500_000);
    expect(await module.applyDiscount(50_000_000, 10_000)).to.equal(0);
    expect(await module.applyDiscount(1, 1)).to.equal(1);
  });

  it("enforces activation windows and owner revocation", async function () {
    const { module, owner, consumer, authorization, sign } = await fixture();
    const future = {
      ...authorization,
      validAfter: authorization.validAfter + 100,
      deadline: authorization.deadline + 100,
      nonce: 8,
    };
    await expect(
      module.connect(consumer).consume(
        future,
        await sign(future),
        future.node,
        future.beneficiary,
        future.product,
        future.termYears,
      ),
    ).to.be.revertedWithCustomError(module, "AuthorizationNotYetValid");

    await expect(module.connect(owner).revoke(authorization))
      .to.emit(module, "AuthorizationRevoked");
    await expect(
      module.connect(consumer).consume(
        authorization,
        await sign(),
        authorization.node,
        authorization.beneficiary,
        authorization.product,
        authorization.termYears,
      ),
    ).to.be.revertedWithCustomError(module, "AuthorizationRevoked");

    await time.increaseTo(future.deadline + 1);
    await expect(
      module.connect(consumer).consume(
        future,
        await sign(future),
        future.node,
        future.beneficiary,
        future.product,
        future.termYears,
      ),
    ).to.be.revertedWithCustomError(module, "AuthorizationExpired");
  });

  it("accepts an ERC-1271 contract authorization signer", async function () {
    const base = await fixture();
    const walletFactory = await ethers.getContractFactory("MockERC1271Wallet");
    const smartSigner = await walletFactory.deploy(base.signer.address);
    const moduleFactory = await ethers.getContractFactory("XNSDiscountAuthorization");
    const module = await moduleFactory.deploy(
      base.owner.address,
      await smartSigner.getAddress(),
      base.consumer.address,
    );
    const network = await ethers.provider.getNetwork();
    const domain = {
      name: "XDCID Discount Authorization",
      version: "1",
      chainId: network.chainId,
      verifyingContract: await module.getAddress(),
    };
    const signature = await base.signer.signTypedData(
      domain,
      types,
      base.authorization,
    );

    await expect(
      module.connect(base.consumer).consume(
        base.authorization,
        signature,
        base.authorization.node,
        base.authorization.beneficiary,
        base.authorization.product,
        base.authorization.termYears,
      ),
    ).to.emit(module, "AuthorizationConsumed");
  });

  it("delays signer and consumer rotation", async function () {
    const { module, owner, outsider, signer, nextConsumer } = await fixture();

    await expect(
      module.connect(outsider).proposeConfiguration(
        signer.address,
        nextConsumer.address,
      ),
    ).to.be.revertedWithCustomError(module, "OwnableUnauthorizedAccount");

    await expect(
      module.connect(owner).proposeConfiguration(
        outsider.address,
        nextConsumer.address,
      ),
    ).to.emit(module, "ConfigurationProposed");

    await expect(module.activatePendingConfiguration())
      .to.be.revertedWithCustomError(module, "UpdateDelayActive");

    await time.increase(48 * 60 * 60);
    await module.connect(outsider).activatePendingConfiguration();
    expect(await module.authorizationSigner()).to.equal(outsider.address);
    expect(await module.consumer()).to.equal(nextConsumer.address);
  });
});
