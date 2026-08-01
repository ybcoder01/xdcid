import { expect } from "chai";
import {
  CCTP_STANDARD_FINALITY_THRESHOLD,
  CCTP_ZERO_BYTES32,
  addressToBytes32,
  buildMainnetAttestationUrl,
  parseMainnetUsdcAmount,
  prepareMainnetCctpBurn,
  prepareMainnetCctpReceive,
  prepareMainnetUsdcTransfer
} from "../frontend/lib/cctpMainnet";
import {
  CCTP_MESSAGE_TRANSMITTER_V2,
  CCTP_TOKEN_MESSENGER_V2,
  PAYMENT_NETWORKS
} from "../frontend/config/paymentNetworks";

describe("mainnet CCTP transaction preparation", function () {
  const recipient = "0xe82a4267CC310FC6Db334601671A043DFc8Ce06A";
  const transactionHash = `0x${"12".repeat(32)}`;

  it("parses USDC with six-decimal precision and rejects unsafe amounts", function () {
    expect(parseMainnetUsdcAmount("1.234567")).to.equal(1_234_567n);
    expect(() => parseMainnetUsdcAmount("0")).to.throw("greater than zero");
    expect(() => parseMainnetUsdcAmount("1.2345678")).to.throw("6 decimal");
    expect(() => parseMainnetUsdcAmount("10000000.000001")).to.throw("at most 10 million");
  });

  it("encodes a non-zero recipient as bytes32", function () {
    expect(addressToBytes32(recipient)).to.equal(
      "0x000000000000000000000000e82a4267cc310fc6db334601671a043dfc8ce06a"
    );
    expect(() =>
      addressToBytes32("0x0000000000000000000000000000000000000000")
    ).to.throw("non-zero");
  });

  for (const source of PAYMENT_NETWORKS) {
    for (const destination of PAYMENT_NETWORKS) {
      if (source.chainId === destination.chainId) continue;

      it(`prepares ${source.name} to ${destination.name} Standard Transfer`, function () {
        const prepared = prepareMainnetCctpBurn({
          sourceChainId: source.chainId,
          destinationChainId: destination.chainId,
          amount: "2.5",
          recipient
        });

        expect(prepared.amount).to.equal(2_500_000n);
        expect(prepared.approvalRequest.chainId).to.equal(source.chainId);
        expect(prepared.approvalRequest.address).to.equal(source.usdcAddress);
        expect(prepared.approvalRequest.args).to.deep.equal([
          CCTP_TOKEN_MESSENGER_V2,
          2_500_000n
        ]);
        expect(prepared.burnRequest.chainId).to.equal(source.chainId);
        expect(prepared.burnRequest.address).to.equal(CCTP_TOKEN_MESSENGER_V2);
        expect(prepared.burnRequest.args).to.deep.equal([
          2_500_000n,
          destination.circleDomain,
          addressToBytes32(recipient),
          source.usdcAddress,
          CCTP_ZERO_BYTES32,
          0n,
          CCTP_STANDARD_FINALITY_THRESHOLD
        ]);
      });
    }
  }

  it("prepares same-chain USDC transfer to the resolved recipient", function () {
    const prepared = prepareMainnetUsdcTransfer({
      chainId: 8453,
      amount: "3",
      recipient
    });
    expect(prepared.chainId).to.equal(8453);
    expect(prepared.functionName).to.equal("transfer");
    expect(prepared.args).to.deep.equal([recipient, 3_000_000n]);
  });

  it("prepares the destination receiveMessage call", function () {
    const prepared = prepareMainnetCctpReceive(50, "0x1234", "0xabcd");
    expect(prepared.chainId).to.equal(50);
    expect(prepared.address).to.equal(CCTP_MESSAGE_TRANSMITTER_V2);
    expect(prepared.functionName).to.equal("receiveMessage");
    expect(prepared.args).to.deep.equal(["0x1234", "0xabcd"]);
  });

  it("builds the mainnet Iris lookup with the source domain", function () {
    expect(buildMainnetAttestationUrl(42161, transactionHash)).to.equal(
      `https://iris-api.circle.com/v2/messages/3?transactionHash=${transactionHash}`
    );
  });
});
