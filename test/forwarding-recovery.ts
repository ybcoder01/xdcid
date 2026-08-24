import { expect } from "chai";
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Address,
  type Hex
} from "viem";
import {
  FORWARDING_RECOVERY_TTL_SECONDS,
  parseForwardingRecoveryInput,
  recoveryRecordMatches,
  type ForwardingRecoveryRecord
} from "../frontend/lib/forwardingRecovery";
import {
  ERC20_TRANSFER_TOPIC,
  findExactUsdcTransferPayer,
  type Erc20TransactionLog
} from "../frontend/lib/forwardingFeeVerification";
import {
  CCTP_TOKEN_MESSENGER_V2,
  getPaymentNetwork
} from "../frontend/config/paymentNetworks";
import {
  CCTP_FORWARDING_HOOK_DATA,
  CCTP_STANDARD_FINALITY_THRESHOLD,
  CCTP_ZERO_BYTES32,
  addressToBytes32
} from "../frontend/lib/cctpMainnet";
import {
  cctpDepositForBurnEventAbi,
  hasExactCctpForwardingBurn,
  type CctpTransactionLog
} from "../frontend/lib/forwardingBurnVerification";
import {
  PAYMENT_RPC_CONFIG,
  getPaymentRpcUrls
} from "../frontend/lib/paymentRpcConfig";

describe("forwarding failure recovery", function () {
  it("configures recovery verification RPCs for every supported environment", function () {
    const mainnetChainIds = [1, 50, 137, 8453, 42161];
    const testnetChainIds = [11155111, 51, 80002, 84532, 421614];

    for (const chainId of [...mainnetChainIds, ...testnetChainIds]) {
      expect(PAYMENT_RPC_CONFIG[chainId]).to.not.equal(undefined);
      expect(getPaymentRpcUrls(chainId, {})).to.have.length.greaterThan(0);
    }
    expect(getPaymentRpcUrls(10, {})).to.deep.equal([]);
  });

  it("prefers environment RPCs and keeps comma-separated fallbacks", function () {
    expect(
      getPaymentRpcUrls(51, {
        XDC_APOTHEM_RPC_URLS: " https://first.example , https://second.example "
      })
    ).to.deep.equal(["https://first.example", "https://second.example"]);
  });

  const feeTransactionHash = `0x${"12".repeat(32)}`;
  const recipient = "0xe82a4267CC310FC6Db334601671A043DFc8Ce06A";

  it("normalizes the public recovery details", function () {
    const parsed = parseForwardingRecoveryInput({
      feeTransactionHash,
      sourceChainId: 50,
      recipientAmount: "10000000",
      recipient,
      destinationChainId: 42161
    });

    expect(parsed.feeTransactionHash).to.equal(feeTransactionHash);
    expect(parsed.sourceChainId).to.equal(50);
    expect(parsed.recipientAmount).to.equal(10_000_000n);
    expect(parsed.recipient).to.equal(recipient);
    expect(parsed.destinationChainId).to.equal(42161);
    expect(FORWARDING_RECOVERY_TTL_SECONDS).to.equal(2_592_000);

    const reverse = parseForwardingRecoveryInput({
      feeTransactionHash,
      sourceChainId: 42161,
      recipientAmount: "10000000",
      recipient,
      destinationChainId: 50
    });
    expect(reverse.sourceChainId).to.equal(42161);
    expect(reverse.destinationChainId).to.equal(50);
  });

  it("matches a stored fee record only to the same transfer details", function () {
    const input = parseForwardingRecoveryInput({
      feeTransactionHash,
      sourceChainId: 50,
      recipientAmount: "10000000",
      recipient,
      destinationChainId: 42161
    });
    const record: ForwardingRecoveryRecord = {
      version: 1,
      feeTransactionHash: input.feeTransactionHash,
      sourceChainId: input.sourceChainId,
      payer: recipient,
      recipientAmount: input.recipientAmount.toString(),
      recipient: input.recipient,
      destinationChainId: input.destinationChainId,
      createdAt: "2026-08-03T00:00:00.000Z",
      expiresAt: "2026-09-02T00:00:00.000Z"
    };

    expect(recoveryRecordMatches(record, input)).to.equal(true);
    expect(
      recoveryRecordMatches(record, {
        ...input,
        destinationChainId: 8453
      })
    ).to.equal(false);
  });

  it("rejects malformed, zero, same-chain, and unsupported recovery details", function () {
    expect(() =>
      parseForwardingRecoveryInput({
        feeTransactionHash: "0x1234",
        sourceChainId: 50,
        recipientAmount: "10000000",
        recipient,
        destinationChainId: 42161
      })
    ).to.throw("32-byte hex");

    expect(() =>
      parseForwardingRecoveryInput({
        feeTransactionHash,
        sourceChainId: 50,
        recipientAmount: "0",
        recipient,
        destinationChainId: 42161
      })
    ).to.throw("outside the supported range");

    expect(() =>
      parseForwardingRecoveryInput({
        feeTransactionHash,
        sourceChainId: 50,
        recipientAmount: "10000000",
        recipient,
        destinationChainId: 50
      })
    ).to.throw("not supported");

    expect(() =>
      parseForwardingRecoveryInput({
        feeTransactionHash,
        sourceChainId: 50,
        recipientAmount: "10000000",
        recipient,
        destinationChainId: 10
      })
    ).to.throw("not supported");
  });
});


describe("forwarding fee event verification", function () {
  const payer = "0x9c67d6cfE6A73497e7348b6b852495CA6236C29a" as Address;
  const feeRecipient =
    "0xe82a4267CC310FC6Db334601671A043DFc8Ce06A" as Address;
  const feeAmount = 100_000n;
  const supportedChainIds = [
    1, 50, 137, 8453, 42161,
    11155111, 51, 80002, 84532, 421614
  ];

  it("accepts an exact direct USDC fee transfer on every supported network", function () {
    for (const chainId of supportedChainIds) {
      const network = getPaymentNetwork(chainId);
      expect(network, `missing payment network ${chainId}`).to.not.equal(undefined);
      const log = transferLog(
        network!.usdcAddress,
        payer,
        feeRecipient,
        feeAmount
      );
      expect(
        findExactUsdcTransferPayer([log], {
          usdcAddress: network!.usdcAddress,
          feeRecipient,
          feeAmount
        })
      ).to.equal(payer);
    }
  });

  it("accepts a delegated wallet transaction by reading its canonical USDC event", function () {
    const network = getPaymentNetwork(84532)!;
    const helperLog: Erc20TransactionLog = {
      address: "0xdb9b1e94b5b69df7e401ddbede43491141047db3",
      topics: [(`0x${"44".repeat(32)}`) as Hex],
      data: "0x" as Hex
    };
    const feeLog = transferLog(
      network.usdcAddress,
      payer,
      feeRecipient,
      feeAmount
    );

    expect(
      findExactUsdcTransferPayer([helperLog, feeLog], {
        usdcAddress: network.usdcAddress,
        feeRecipient,
        feeAmount
      })
    ).to.equal(payer);
  });

  it("rejects the wrong token, recipient, amount, and ambiguous duplicate events", function () {
    const network = getPaymentNetwork(84532)!;
    const exact = transferLog(
      network.usdcAddress,
      payer,
      feeRecipient,
      feeAmount
    );
    const input = {
      usdcAddress: network.usdcAddress,
      feeRecipient,
      feeAmount
    };

    expect(findExactUsdcTransferPayer([
      { ...exact, address: "0x0000000000000000000000000000000000000001" }
    ], input)).to.equal(null);
    expect(findExactUsdcTransferPayer([
      transferLog(
        network.usdcAddress,
        payer,
        "0x0000000000000000000000000000000000000001",
        feeAmount
      )
    ], input)).to.equal(null);
    expect(findExactUsdcTransferPayer([
      transferLog(network.usdcAddress, payer, feeRecipient, feeAmount + 1n)
    ], input)).to.equal(null);
    expect(findExactUsdcTransferPayer([exact, exact], input)).to.equal(null);
  });
});

function transferLog(
  token: Address,
  from: Address,
  to: Address,
  amount: bigint
): Erc20TransactionLog {
  return {
    address: token,
    topics: [
      ERC20_TRANSFER_TOPIC,
      addressTopic(from),
      addressTopic(to)
    ],
    data: (`0x${amount.toString(16).padStart(64, "0")}`) as Hex
  };
}

function addressTopic(address: Address): Hex {
  return (`0x${address.slice(2).toLowerCase().padStart(64, "0")}`) as Hex;
}


describe("forwarding burn event verification", function () {
  const payer = "0x9c67d6cfE6A73497e7348b6b852495CA6236C29a" as Address;
  const recipient =
    "0x031d01283963d2fA43fe386825A056491C10994f" as Address;
  const recipientAmount = 1_000_000n;
  const maxFee = 1_733_550n;
  const supportedChainIds = [
    1, 50, 137, 8453, 42161,
    11155111, 51, 80002, 84532, 421614
  ];

  it("accepts Circle forwarding events on every supported source network", function () {
    const environments = [
      supportedChainIds.slice(0, 5),
      supportedChainIds.slice(5)
    ];
    for (const environment of environments) {
      for (let index = 0; index < environment.length; index += 1) {
        const source = getPaymentNetwork(environment[index])!;
        const destination = getPaymentNetwork(
          environment[(index + 1) % environment.length]
        )!;
        const log = depositForBurnLog({
          burnToken: source.usdcAddress,
          depositor: payer,
          totalAmount: recipientAmount + maxFee,
          destinationDomain: destination.circleDomain,
          mintRecipient: addressToBytes32(recipient),
          maxFee
        });

        expect(
          hasExactCctpForwardingBurn([log], {
            tokenMessenger: CCTP_TOKEN_MESSENGER_V2,
            burnToken: source.usdcAddress,
            depositor: payer,
            recipientAmount,
            destinationDomain: destination.circleDomain,
            mintRecipient: addressToBytes32(recipient),
            destinationCaller: CCTP_ZERO_BYTES32,
            minimumFinalityThreshold: CCTP_STANDARD_FINALITY_THRESHOLD,
            hookData: CCTP_FORWARDING_HOOK_DATA
          })
        ).to.equal(true);
      }
    }
  });

  it("accepts delegated execution receipts and rejects mismatched or duplicate burns", function () {
    const source = getPaymentNetwork(84532)!;
    const destination = getPaymentNetwork(51)!;
    const exact = depositForBurnLog({
      burnToken: source.usdcAddress,
      depositor: payer,
      totalAmount: recipientAmount + maxFee,
      destinationDomain: destination.circleDomain,
      mintRecipient: addressToBytes32(recipient),
      maxFee
    });
    const helperLog: CctpTransactionLog = {
      address: "0xdb9b1e94b5b69df7e401ddbede43491141047db3",
      topics: [(`0x${"44".repeat(32)}`) as Hex],
      data: "0x"
    };
    const input = {
      tokenMessenger: CCTP_TOKEN_MESSENGER_V2,
      burnToken: source.usdcAddress,
      depositor: payer,
      recipientAmount,
      destinationDomain: destination.circleDomain,
      mintRecipient: addressToBytes32(recipient),
      destinationCaller: CCTP_ZERO_BYTES32,
      minimumFinalityThreshold: CCTP_STANDARD_FINALITY_THRESHOLD,
      hookData: CCTP_FORWARDING_HOOK_DATA
    };

    expect(hasExactCctpForwardingBurn([helperLog, exact], input)).to.equal(true);
    expect(
      hasExactCctpForwardingBurn([exact], {
        ...input,
        depositor: recipient
      })
    ).to.equal(false);
    expect(
      hasExactCctpForwardingBurn([exact], {
        ...input,
        recipientAmount: recipientAmount + 1n
      })
    ).to.equal(false);
    expect(
      hasExactCctpForwardingBurn([exact], {
        ...input,
        destinationDomain: destination.circleDomain + 1
      })
    ).to.equal(false);
    expect(hasExactCctpForwardingBurn([exact, exact], input)).to.equal(false);
  });
});

function depositForBurnLog(input: {
  burnToken: Address;
  depositor: Address;
  totalAmount: bigint;
  destinationDomain: number;
  mintRecipient: Hex;
  maxFee: bigint;
}): CctpTransactionLog {
  return {
    address: CCTP_TOKEN_MESSENGER_V2,
    topics: encodeEventTopics({
      abi: cctpDepositForBurnEventAbi,
      eventName: "DepositForBurn",
      args: {
        burnToken: input.burnToken,
        depositor: input.depositor,
        minFinalityThreshold: CCTP_STANDARD_FINALITY_THRESHOLD
      }
    }),
    data: encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "bytes32" },
        { type: "uint32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "bytes" }
      ],
      [
        input.totalAmount,
        input.mintRecipient,
        input.destinationDomain,
        ("0x" + "11".repeat(32)) as Hex,
        CCTP_ZERO_BYTES32,
        input.maxFee,
        CCTP_FORWARDING_HOOK_DATA
      ]
    )
  };
}
