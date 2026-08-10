import { expect } from "chai";
import { ethers } from "hardhat";
import { zeroAddress, type Address, type Hex, type PublicClient } from "viem";
import { verifyPaymentCancellationSignature } from "../frontend/lib/accountSignatures";
import {
  createPaymentRequestCancellation,
  paymentCancellationTypedData,
  paymentRequestId,
  recoverPaymentCancellationSigner,
  validatePaymentRequestCancellation,
} from "../frontend/lib/paymentCancellation";
import {
  type PaymentRequest,
} from "../frontend/lib/paymentRequests";

describe("Pay Link cancellation", function () {
  function request(): PaymentRequest {
    const now = Math.floor(Date.now() / 1000);
    return {
      version: 2,
      chainId: 50,
      sourceChainId: 8453,
      destinationChainId: 50,
      transferMode: "automatic",
      name: "alice.xdc",
      amount: "10.00",
      token: "USDC",
      reference: "CANCEL-101",
      description: "",
      payer: zeroAddress,
      issuedAt: now,
      expires: now + 3600,
      nonce: ("0x" + "44".repeat(32)) as Hex,
    };
  }

  it("derives a deterministic request identifier", function () {
    const paymentRequest = request();
    expect(paymentRequestId(paymentRequest)).to.equal(paymentRequestId({ ...paymentRequest }));
    expect(paymentRequestId({ ...paymentRequest, amount: "11.00" })).to.not.equal(
      paymentRequestId(paymentRequest),
    );
  });

  it("validates a fresh cancellation bound to the exact request", function () {
    const now = Math.floor(Date.now() / 1000);
    const paymentRequest = request();
    const cancellation = createPaymentRequestCancellation(paymentRequest, now);
    expect(validatePaymentRequestCancellation(cancellation, paymentRequest, now)).to.equal(undefined);
    expect(
      validatePaymentRequestCancellation(
        cancellation,
        { ...paymentRequest, amount: "12.00" },
        now,
      ),
    ).to.equal("Payment cancellation does not match this request.");
    expect(
      validatePaymentRequestCancellation(
        { ...cancellation, cancelledAt: now - 601 },
        paymentRequest,
        now,
      ),
    ).to.equal("Payment cancellation authorization has expired.");
  });

  it("recovers the creator that signed the cancellation", async function () {
    const [creator] = await ethers.getSigners();
    const cancellation = createPaymentRequestCancellation(request());
    const typedData = paymentCancellationTypedData(cancellation);
    const signature = await creator.signTypedData(
      typedData.domain,
      { PaymentRequestCancellation: [...typedData.types.PaymentRequestCancellation] },
      typedData.message,
    ) as Hex;
    expect(await recoverPaymentCancellationSigner(cancellation, signature)).to.equal(
      await creator.getAddress(),
    );
  });

  it("supports ERC-1271 creator accounts", async function () {
    const [creator] = await ethers.getSigners();
    const walletFactory = await ethers.getContractFactory("MockERC1271Wallet");
    const wallet = await walletFactory.deploy(await creator.getAddress());
    const cancellation = createPaymentRequestCancellation(request());
    const typedData = paymentCancellationTypedData(cancellation);
    const signature = await creator.signTypedData(
      typedData.domain,
      { PaymentRequestCancellation: [...typedData.types.PaymentRequestCancellation] },
      typedData.message,
    ) as Hex;
    const client = {
      getBytecode: async () => "0x01" as Hex,
      readContract: async ({ args }: { args: readonly [Hex, Hex] }) =>
        wallet.isValidSignature(args[0], args[1]),
    } as unknown as PublicClient;

    const result = await verifyPaymentCancellationSignature(
      client,
      cancellation,
      signature,
      await wallet.getAddress() as Address,
    );
    expect(result).to.include({ valid: true, accountType: "contract" });
  });
});
