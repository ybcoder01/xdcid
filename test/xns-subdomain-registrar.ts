import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("XNSSubdomainRegistrar", function () {
  const quoteTypes = {
    SubdomainQuote: [
      { name: "node", type: "bytes32" },
      { name: "parentNode", type: "bytes32" },
      { name: "payer", type: "address" },
      { name: "subdomainOwner", type: "address" },
      { name: "termYears", type: "uint256" },
      { name: "paymentToken", type: "address" },
      { name: "paymentAmount", type: "uint256" },
      { name: "usdMicros", type: "uint256" },
      { name: "policyVersion", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "issuedAt", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  async function fixture() {
    const [owner, quoteSigner, treasury, alice, bob, operator, carol] =
      await ethers.getSigners();

    const Registry = await ethers.getContractFactory("XNSRegistry");
    const registry = await Registry.deploy(owner.address);
    await registry.setRegistrar(owner.address);

    const USDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await USDC.deploy();

    const Policy = await ethers.getContractFactory("XNSPricingPolicyV2");
    const policy = await Policy.deploy(
      {
        twoCharacterAnnualUsdMicros: 50_000_000,
        threeCharacterAnnualUsdMicros: 20_000_000,
        fourCharacterAnnualUsdMicros: 10_000_000,
        standardAnnualUsdMicros: 5_000_000,
        subdomainAnnualUsdMicros: 1_000_000,
        premiumSubdomainAnnualUsdMicros: 5_000_000,
        migrationUsdMicros: 3_000_000,
        threeYearDiscountBps: 1_000,
        fiveYearDiscountBps: 1_500,
        tenYearDiscountBps: 2_000,
        xdcQuoteBufferBps: 200,
        quoteSigner: quoteSigner.address,
        usdcToken: await usdc.getAddress(),
        treasury: treasury.address,
        xdcPaymentsEnabled: true,
        usdcPaymentsEnabled: true,
      },
      owner.address,
    );

    const Subdomains = await ethers.getContractFactory(
      "XNSSubdomainRegistrar",
    );
    const subdomains = await Subdomains.deploy(
      await registry.getAddress(),
      await policy.getAddress(),
      owner.address,
    );

    const parentName = "alice.xdc";
    const parentNode = ethers.keccak256(ethers.toUtf8Bytes(parentName));
    const parentExpiry = (await time.latest()) + 20 * 365 * 24 * 60 * 60;
    await registry.register(parentNode, alice.address, parentExpiry);

    const network = await ethers.provider.getNetwork();
    const domain = {
      name: "XDCID Subdomain Registrar",
      version: "1",
      chainId: network.chainId,
      verifyingContract: await subdomains.getAddress(),
    };

    async function makeQuote(options: {
      payer?: string;
      subdomainOwner?: string;
      parentName?: string;
      label?: string;
      termYears?: number;
      paymentToken?: string;
      paymentAmount?: bigint;
      usdMicros?: bigint;
    } = {}) {
      const payer = options.payer ?? alice.address;
      const subdomainOwner = options.subdomainOwner ?? bob.address;
      const targetParent = options.parentName ?? parentName;
      const label = options.label ?? "pay";
      const termYears = options.termYears ?? 1;
      const node = await subdomains.nodeFor(targetParent, label);
      const quoteParentNode = await subdomains.parentNodeFor(targetParent);
      const usdMicros =
        options.usdMicros ??
        (await policy.priceUsdMicros(2, label.length, termYears));
      const issuedAt = await time.latest();
      const quote = {
        node,
        parentNode: quoteParentNode,
        payer,
        subdomainOwner,
        termYears,
        paymentToken: options.paymentToken ?? ethers.ZeroAddress,
        paymentAmount:
          options.paymentAmount ?? ethers.parseEther("0.02"),
        usdMicros,
        policyVersion: await policy.version(),
        nonce: await subdomains.nonces(payer),
        issuedAt,
        deadline: issuedAt + 600,
      };
      return {
        parentName: targetParent,
        label,
        quote,
        signature: await quoteSigner.signTypedData(domain, quoteTypes, quote),
      };
    }

    return {
      owner,
      treasury,
      alice,
      bob,
      operator,
      carol,
      registry,
      usdc,
      policy,
      subdomains,
      parentName,
      parentNode,
      makeQuote,
    };
  }

  it("registers a paid subdomain with XDC and resolves its owner by default", async function () {
    const { alice, bob, treasury, subdomains, makeQuote } = await fixture();
    const made = await makeQuote();
    const treasuryBefore = await ethers.provider.getBalance(treasury.address);

    await subdomains.connect(alice).registerWithQuote(
      made.parentName,
      made.label,
      made.quote,
      made.signature,
      { value: made.quote.paymentAmount },
    );

    expect(await subdomains.ownerOf(made.quote.node)).to.equal(bob.address);
    expect(await subdomains.addressOf(made.quote.node, 50)).to.equal(
      bob.address,
    );
    expect(await ethers.provider.getBalance(treasury.address)).to.equal(
      treasuryBefore + made.quote.paymentAmount,
    );
  });

  it("allows an approved parent operator but rejects unrelated wallets", async function () {
    const { alice, bob, operator, carol, subdomains, parentName, makeQuote } =
      await fixture();

    const unauthorized = await makeQuote({
      payer: carol.address,
      label: "blocked",
    });
    await expect(
      subdomains.connect(carol).registerWithQuote(
        unauthorized.parentName,
        unauthorized.label,
        unauthorized.quote,
        unauthorized.signature,
        { value: unauthorized.quote.paymentAmount },
      ),
    ).to.be.revertedWithCustomError(subdomains, "NotParentController");

    await subdomains
      .connect(alice)
      .setParentOperator(parentName, operator.address, true);
    const delegated = await makeQuote({
      payer: operator.address,
      subdomainOwner: bob.address,
      label: "team",
    });
    await subdomains.connect(operator).registerWithQuote(
      delegated.parentName,
      delegated.label,
      delegated.quote,
      delegated.signature,
      { value: delegated.quote.paymentAmount },
    );
    expect(await subdomains.ownerOf(delegated.quote.node)).to.equal(
      bob.address,
    );
  });

  it("renews with USDC only when the parent has enough remaining lifetime", async function () {
    const { alice, bob, treasury, usdc, subdomains, makeQuote } =
      await fixture();
    const registration = await makeQuote();
    await subdomains.connect(alice).registerWithQuote(
      registration.parentName,
      registration.label,
      registration.quote,
      registration.signature,
      { value: registration.quote.paymentAmount },
    );

    const renewal = await makeQuote({
      payer: bob.address,
      subdomainOwner: bob.address,
      paymentToken: await usdc.getAddress(),
      paymentAmount: 1_000_000n,
    });
    await usdc.mint(bob.address, 1_000_000n);
    await usdc
      .connect(bob)
      .approve(await subdomains.getAddress(), 1_000_000n);
    const oldExpiry = (await subdomains.records(registration.quote.node))
      .expiry;

    await subdomains.connect(bob).renewWithQuote(
      renewal.parentName,
      renewal.label,
      renewal.quote,
      renewal.signature,
    );

    expect(await usdc.balanceOf(treasury.address)).to.equal(1_000_000n);
    expect((await subdomains.records(registration.quote.node)).expiry).to.equal(
      oldExpiry + 365n * 24n * 60n * 60n,
    );

    const excessive = await makeQuote({
      payer: bob.address,
      subdomainOwner: bob.address,
      termYears: 10,
    });
    await expect(
      subdomains.connect(bob).renewWithQuote(
        excessive.parentName,
        excessive.label,
        excessive.quote,
        excessive.signature,
        { value: excessive.quote.paymentAmount },
      ),
    ).to.be.revertedWithCustomError(subdomains, "TermExceedsParentExpiry");
  });

  it("supports multichain records, owner transfers, and parent revocation", async function () {
    const { alice, bob, carol, subdomains, makeQuote } = await fixture();
    const made = await makeQuote();
    await subdomains.connect(alice).registerWithQuote(
      made.parentName,
      made.label,
      made.quote,
      made.signature,
      { value: made.quote.paymentAmount },
    );

    await subdomains
      .connect(bob)
      .setAddress(made.quote.node, 42161, carol.address);
    expect(await subdomains.addressOf(made.quote.node, 42161)).to.equal(
      carol.address,
    );

    await subdomains
      .connect(bob)
      .transferSubdomain(made.quote.node, carol.address);
    expect(await subdomains.ownerOf(made.quote.node)).to.equal(carol.address);

    await subdomains
      .connect(alice)
      .revokeSubdomain(made.parentName, made.label);
    expect(await subdomains.ownerOf(made.quote.node)).to.equal(
      ethers.ZeroAddress,
    );
  });

  it("enforces pause controls, canonical names, and quote nonces", async function () {
    const { owner, alice, subdomains, makeQuote } = await fixture();

    await expect(
      subdomains.nodeFor("alice.xdc", "-bad"),
    ).to.be.revertedWithCustomError(subdomains, "InvalidName");
    expect(await subdomains.nodeFor("ALICE.XDC", "PAY")).to.equal(
      await subdomains.nodeFor("alice.xdc", "pay"),
    );

    const made = await makeQuote();
    await subdomains.connect(owner).setRegistrationsPaused(true);
    await expect(
      subdomains.connect(alice).registerWithQuote(
        made.parentName,
        made.label,
        made.quote,
        made.signature,
        { value: made.quote.paymentAmount },
      ),
    ).to.be.revertedWithCustomError(subdomains, "RegistrationsPaused");

    await subdomains.connect(owner).setRegistrationsPaused(false);
    await subdomains.connect(alice).registerWithQuote(
      made.parentName,
      made.label,
      made.quote,
      made.signature,
      { value: made.quote.paymentAmount },
    );

    await expect(
      subdomains.connect(alice).registerWithQuote(
        made.parentName,
        "other",
        made.quote,
        made.signature,
        { value: made.quote.paymentAmount },
      ),
    ).to.be.revertedWithCustomError(subdomains, "InvalidQuote");
  });
});
