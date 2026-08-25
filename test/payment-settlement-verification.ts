import { expect } from "chai";
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  keccak256,
  padHex,
  stringToHex,
  toHex,
  type Address,
  type Hex,
  type Log
} from "viem";
import {
  findUniqueCctpDeposit,
  findUniqueCctpDepositor,
  findUniqueUsdcTransferPayer
} from "../frontend/lib/paymentSettlementVerification";
import { cctpDepositForBurnEventAbi } from "../frontend/lib/forwardingBurnVerification";

const token = "0x1111111111111111111111111111111111111111" as Address;
const messenger = "0x2222222222222222222222222222222222222222" as Address;
const payer = "0x3333333333333333333333333333333333333333" as Address;
const recipient = "0x4444444444444444444444444444444444444444" as Address;
const transferTopic = keccak256(stringToHex("Transfer(address,address,uint256)"));

describe("payment settlement event verification", function () {
  it("derives the actual same-chain payer from a delegated USDC transfer event", function () {
    expect(findUniqueUsdcTransferPayer(
      [transferLog(token, payer, recipient, 1_000_000n)],
      token,
      recipient,
      1_000_000n
    )).to.equal(getAddress(payer));
  });

  it("rejects ambiguous duplicate USDC transfer events", function () {
    const log = transferLog(token, payer, recipient, 1_000_000n);
    expect(findUniqueUsdcTransferPayer(
      [log, log],
      token,
      recipient,
      1_000_000n
    )).to.equal(undefined);
  });

  it("derives the CCTP depositor without trusting the outer transaction target", function () {
    expect(findUniqueCctpDepositor(
      [depositLog({
        amount: 1_200_000n,
        maxFee: 200_000n,
        destinationDomain: 6
      })],
      {
        tokenMessenger: messenger,
        burnToken: token,
        recipient,
        recipientAmount: 1_000_000n,
        destinationDomain: 6
      }
    )).to.equal(getAddress(payer));
  });

  it("returns the verified CCTP burn amount for canonical fee recording", function () {
    const deposit = findUniqueCctpDeposit(
      [depositLog({
        amount: 1_200_000n,
        maxFee: 200_000n,
        destinationDomain: 6
      })],
      {
        tokenMessenger: messenger,
        burnToken: token,
        recipient,
        recipientAmount: 1_000_000n,
        destinationDomain: 6
      }
    );
    expect(deposit?.depositor).to.equal(getAddress(payer));
    expect(deposit?.amount).to.equal(1_200_000n);
    expect(deposit?.maxFee).to.equal(200_000n);
  });

  it("rejects a CCTP deposit for a different destination", function () {
    expect(findUniqueCctpDepositor(
      [depositLog({
        amount: 1_200_000n,
        maxFee: 200_000n,
        destinationDomain: 3
      })],
      {
        tokenMessenger: messenger,
        burnToken: token,
        recipient,
        recipientAmount: 1_000_000n,
        destinationDomain: 6
      }
    )).to.equal(undefined);
  });
});

function transferLog(
  address: Address,
  from: Address,
  to: Address,
  amount: bigint
): Log {
  return {
    address,
    topics: [
      transferTopic,
      padHex(from, { size: 32 }),
      padHex(to, { size: 32 })
    ],
    data: toHex(amount, { size: 32 })
  } as Log;
}

function depositLog(input: {
  amount: bigint;
  maxFee: bigint;
  destinationDomain: number;
}): Log {
  const zeroBytes32 = ("0x" + "00".repeat(32)) as Hex;
  const topics = encodeEventTopics({
    abi: cctpDepositForBurnEventAbi,
    eventName: "DepositForBurn",
    args: {
      burnToken: token,
      depositor: payer,
      minFinalityThreshold: 1000
    }
  });
  const data = encodeAbiParameters(
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
      input.amount,
      padHex(recipient, { size: 32 }),
      input.destinationDomain,
      zeroBytes32,
      zeroBytes32,
      input.maxFee,
      "0x"
    ]
  );
  return { address: messenger, topics, data } as Log;
}
