import { expect } from "chai";
import {
  CCTP_FORWARDING_HOOK_DATA,
  CCTP_STANDARD_FINALITY_THRESHOLD,
  CCTP_ZERO_BYTES32,
  XDC_APOTHEM_CCTP_RECEIVE_GAS_LIMIT,
  XDCID_FEE_RECIPIENT,
  addressToBytes32,
  buildMainnetAttestationUrl,
  buildMainnetForwardingFeeUrl,
  calculateXdcidConvenienceFee,
  getCctpReceiveGasLimit,
  parseMainnetForwardingQuote,
  parseMainnetUsdcAmount,
  prepareMainnetCctpBurn,
  prepareMainnetCctpForwardedBurn,
  prepareMainnetCctpReceive,
  prepareMainnetUsdcTransfer,
  prepareXdcidConvenienceFeeTransfer
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

  it("uses an explicit receiveMessage gas limit only on XDC Apothem", function () {
    expect(getCctpReceiveGasLimit(51)).to.equal(
      XDC_APOTHEM_CCTP_RECEIVE_GAS_LIMIT
    );
    expect(getCctpReceiveGasLimit(50)).to.equal(undefined);
    expect(getCctpReceiveGasLimit(421614)).to.equal(undefined);
  });

  it("builds the mainnet Iris lookup with the source domain", function () {
    expect(buildMainnetAttestationUrl(42161, transactionHash)).to.equal(
      `https://iris-api.circle.com/v2/messages/3?transactionHash=${transactionHash}`
    );
  });

  it("applies the published XDCID convenience-fee floor, rate, and cap", function () {
    expect(calculateXdcidConvenienceFee(5_000_000n)).to.equal(100_000n);
    expect(calculateXdcidConvenienceFee(100_000_000n)).to.equal(100_000n);
    expect(calculateXdcidConvenienceFee(1_000_000_000n)).to.equal(1_000_000n);
    expect(calculateXdcidConvenienceFee(10_000_000_000n)).to.equal(5_000_000n);
  });

  it("prepares the separate XDCID convenience-fee transfer", function () {
    const prepared = prepareXdcidConvenienceFeeTransfer(
      50,
      1_000_000_000n
    );
    expect(prepared.chainId).to.equal(50);
    expect(prepared.functionName).to.equal("transfer");
    expect(prepared.args).to.deep.equal([XDCID_FEE_RECIPIENT, 1_000_000n]);
  });

  it("builds the XDC to Arbitrum live forwarding quote URL", function () {
    expect(buildMainnetForwardingFeeUrl(50, 42161)).to.equal(
      "https://iris-api.circle.com/v2/burn/USDC/fees/18/3?forward=true"
    );
  });

  it("selects Circle's Standard forwarding quote", function () {
    expect(
      parseMainnetForwardingQuote([
        {
          finalityThreshold: 1000,
          minimumFee: 1,
          forwardFee: { med: "1000" }
        },
        {
          finalityThreshold: 2000,
          minimumFee: 0,
          forwardFee: { med: "57543" }
        }
      ])
    ).to.deep.equal({ forwardFee: 57_543n, minimumFeeBps: 0 });
  });

  it("grosses up an XDC forwarded burn so the recipient receives the requested amount", function () {
    const prepared = prepareMainnetCctpForwardedBurn({
      sourceChainId: 50,
      destinationChainId: 42161,
      amount: "10",
      recipient,
      forwardFee: 57_543n,
      minimumFeeBps: 0
    });

    expect(prepared.recipientAmount).to.equal(10_000_000n);
    expect(prepared.maxFee).to.equal(57_543n);
    expect(prepared.totalBurnAmount).to.equal(10_057_543n);
    expect(prepared.approvalRequest.args).to.deep.equal([
      CCTP_TOKEN_MESSENGER_V2,
      10_057_543n
    ]);
    expect(prepared.burnRequest.functionName).to.equal(
      "depositForBurnWithHook"
    );
    expect(prepared.burnRequest.args).to.deep.equal([
      10_057_543n,
      3,
      addressToBytes32(recipient),
      PAYMENT_NETWORKS.find((network) => network.chainId === 50)?.usdcAddress,
      CCTP_ZERO_BYTES32,
      57_543n,
      CCTP_STANDARD_FINALITY_THRESHOLD,
      CCTP_FORWARDING_HOOK_DATA
    ]);
  });

  it("prepares automatic forwarding from Arbitrum to XDC", function () {
    const prepared = prepareMainnetCctpForwardedBurn({
      sourceChainId: 42161,
      destinationChainId: 50,
      amount: "10",
      recipient,
      forwardFee: 57_543n,
      minimumFeeBps: 0
    });

    expect(prepared.source.chainId).to.equal(42161);
    expect(prepared.destination.chainId).to.equal(50);
    expect(prepared.burnRequest.args[1]).to.equal(18);
  });
});
