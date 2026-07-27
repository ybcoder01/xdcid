import { expect } from "chai";
import { ethers } from "hardhat";
import { zeroAddress, type Address, type Hex, type PublicClient } from "viem";
import {
  verifyPaymentRequestSignature,
  ERC1271_MAGIC_VALUE,
} from "../frontend/lib/accountSignatures";
import {
  buildSignedPaymentLink,
  decodePaymentRequest,
  encodePaymentRequest,
  isDesignatedPayer,
  paymentRequestTypedData,
  recoverPaymentRequestSigner,
  validatePaymentRequest,
  type PaymentRequest,
} from "../frontend/lib/paymentRequests";

describe("Signed payment requests", function () {
  function hardhatPublicClient(): PublicClient {
    return {
      getBytecode: async ({ address }: { address: Address }) => {
        const bytecode = await ethers.provider.getCode(address);
        return bytecode === "0x" ? undefined : bytecode as Hex;
      },
      readContract: async ({ address, args }: { address: Address; args: readonly [Hex, Hex] }) => {
        const wallet = await ethers.getContractAt("MockERC1271Wallet", address);
        return wallet.isValidSignature(args[0], args[1]);
      },
    } as unknown as PublicClient;
  }

  async function signRequest(request: PaymentRequest, signer: Awaited<ReturnType<typeof ethers.getSigners>>[number]): Promise<Hex> {
    const typedData = paymentRequestTypedData(request);
    return signer.signTypedData(
      typedData.domain,
      { PaymentRequest: [...typedData.types.PaymentRequest] },
      typedData.message,
    ) as Promise<Hex>;
  }

  function validRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
    const now = Math.floor(Date.now() / 1000);
    return {
      version: 1,
      chainId: 50,
      name: "alice.xdc",
      amount: "25.00",
      token: "USDC",
      reference: "ORDER-104",
      description: "Consulting services",
      payer: zeroAddress,
      issuedAt: now,
      expires: now + 3600,
      nonce: ("0x" + "11".repeat(32)) as Hex,
      ...overrides,
    };
  }

  it("encodes and decodes a versioned request", function () {
    const request = validRequest();
    expect(decodePaymentRequest(encodePaymentRequest(request))).to.deep.equal(request);
  });

  it("recovers the wallet that signed the request", async function () {
    const [owner] = await ethers.getSigners();
    const request = validRequest();
    const typedData = paymentRequestTypedData(request);
    const signature = await owner.signTypedData(
      typedData.domain,
      { PaymentRequest: [...typedData.types.PaymentRequest] },
      typedData.message,
    );

    expect(await recoverPaymentRequestSigner(request, signature as Hex)).to.equal(await owner.getAddress());
  });

  it("does not validate a signature after a request is changed", async function () {
    const [owner] = await ethers.getSigners();
    const request = validRequest();
    const typedData = paymentRequestTypedData(request);
    const signature = await owner.signTypedData(
      typedData.domain,
      { PaymentRequest: [...typedData.types.PaymentRequest] },
      typedData.message,
    );
    const changed = { ...request, amount: "250.00" };

    expect(await recoverPaymentRequestSigner(changed, signature as Hex)).to.not.equal(await owner.getAddress());
  });

  it("validates network, expiry, payer, reference, and nonce", function () {
    const now = Math.floor(Date.now() / 1000);
    expect(validatePaymentRequest(validRequest(), now)).to.equal(undefined);
    expect(validatePaymentRequest({ ...validRequest(), chainId: 51 } as PaymentRequest, now)).to.equal("Payment request is for the wrong network.");
    expect(validatePaymentRequest(validRequest({ expires: now }), now)).to.equal("This payment request has expired.");
    expect(validatePaymentRequest(validRequest({ payer: "0x1234" as Hex }), now)).to.equal("Designated payer address is invalid.");
    expect(validatePaymentRequest(validRequest({ reference: "" }), now)).to.equal("Payment reference is required.");
    expect(validatePaymentRequest(validRequest({ nonce: "0x12" }), now)).to.equal("Payment request nonce is invalid.");
  });

  it("enforces an optional designated payer", function () {
    const payer = "0x00000000000000000000000000000000000000AA";
    expect(isDesignatedPayer(validRequest(), undefined)).to.equal(true);
    expect(isDesignatedPayer(validRequest({ payer }), payer)).to.equal(true);
    expect(isDesignatedPayer(validRequest({ payer }), "0x00000000000000000000000000000000000000bb")).to.equal(false);
  });

  it("builds a link containing only the encoded request and signature", function () {
    const request = validRequest();
    const signature = ("0x" + "22".repeat(65)) as Hex;
    const url = new URL(buildSignedPaymentLink("https://xdcid.com", request, signature));

    expect(url.pathname).to.equal("/pay/alice.xdc");
    expect(decodePaymentRequest(url.searchParams.get("request") || "")).to.deep.equal(request);
    expect(url.searchParams.get("signature")).to.equal(signature);
    expect(url.searchParams.has("amount")).to.equal(false);
  });
  it("verifies an ordinary wallet against the expected XNS owner", async function () {
    const [owner] = await ethers.getSigners();
    const request = validRequest();
    const verification = await verifyPaymentRequestSignature(
      hardhatPublicClient(),
      request,
      await signRequest(request, owner),
      await owner.getAddress() as Address,
    );

    expect(verification).to.include({ valid: true, accountType: "eoa" });
  });

  it("accepts a signature authorized by an ERC-1271 smart account", async function () {
    const [authorizedSigner] = await ethers.getSigners();
    const walletFactory = await ethers.getContractFactory("MockERC1271Wallet");
    const wallet = await walletFactory.deploy(await authorizedSigner.getAddress());
    const request = validRequest();
    const verification = await verifyPaymentRequestSignature(
      hardhatPublicClient(),
      request,
      await signRequest(request, authorizedSigner),
      await wallet.getAddress() as Address,
    );

    expect(verification).to.include({ valid: true, accountType: "contract" });
  });

  it("rejects an ERC-1271 signature after the smart-account signer changes", async function () {
    const [authorizedSigner, replacementSigner] = await ethers.getSigners();
    const walletFactory = await ethers.getContractFactory("MockERC1271Wallet");
    const wallet = await walletFactory.deploy(await authorizedSigner.getAddress());
    const request = validRequest();
    const signature = await signRequest(request, authorizedSigner);
    await wallet.setSigner(await replacementSigner.getAddress());

    const verification = await verifyPaymentRequestSignature(
      hardhatPublicClient(), request, signature, await wallet.getAddress() as Address,
    );
    expect(verification).to.include({ valid: false, accountType: "contract" });
  });

  it("rejects a smart account that returns the wrong ERC-1271 value", async function () {
    const [authorizedSigner] = await ethers.getSigners();
    const walletFactory = await ethers.getContractFactory("MockERC1271Wallet");
    const wallet = await walletFactory.deploy(await authorizedSigner.getAddress());
    const request = validRequest();
    await wallet.setValidResult("0xffffffff");

    const verification = await verifyPaymentRequestSignature(
      hardhatPublicClient(), request, await signRequest(request, authorizedSigner), await wallet.getAddress() as Address,
    );
    expect(verification.valid).to.equal(false);
    expect(verification.error).to.equal("The smart account rejected this signature.");
    expect(ERC1271_MAGIC_VALUE).to.equal("0x1626ba7e");
  });

  it("fails closed when an ERC-1271 signature check reverts", async function () {
    const [authorizedSigner] = await ethers.getSigners();
    const walletFactory = await ethers.getContractFactory("MockERC1271Wallet");
    const wallet = await walletFactory.deploy(await authorizedSigner.getAddress());
    const request = validRequest();
    await wallet.setShouldRevert(true);

    const verification = await verifyPaymentRequestSignature(
      hardhatPublicClient(), request, await signRequest(request, authorizedSigner), await wallet.getAddress() as Address,
    );
    expect(verification).to.include({ valid: false, accountType: "contract" });
    expect(verification.error).to.equal("The smart account signature check failed or reverted.");
  });

});
