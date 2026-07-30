import assert from "node:assert/strict";
import test from "node:test";
import { getAddress, zeroAddress } from "viem";
import {
  CCTP_MAX_TRANSFER_AMOUNT,
  CCTP_MESSAGE_TRANSMITTER_V2_TESTNET,
  CCTP_STANDARD_FINALITY_THRESHOLD,
  CCTP_TESTNET_IRIS_API,
  CCTP_TESTNETS,
  CCTP_TOKEN_MESSENGER_V2_TESTNET,
  CCTP_ZERO_BYTES32,
  CctpTestnetError,
  addressToCctpBytes32,
  buildCctpAttestationUrl,
  parseCctpUsdcAmount,
  prepareCctpBurn,
  prepareCctpReceive
} from "../dist/cctp.js";

const recipient = getAddress("0x1111111111111111111111111111111111111111");
const transactionHash = "0x" + "ab".repeat(32);

test("exposes Circle testnet configuration for Arbitrum Sepolia and XDC Apothem", () => {
  assert.equal(CCTP_TESTNETS.arbitrumSepolia.chainId, 421614);
  assert.equal(CCTP_TESTNETS.arbitrumSepolia.domain, 3);
  assert.equal(
    CCTP_TESTNETS.arbitrumSepolia.usdc,
    "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d"
  );
  assert.equal(CCTP_TESTNETS.xdcApothem.chainId, 51);
  assert.equal(CCTP_TESTNETS.xdcApothem.domain, 18);
  assert.equal(
    CCTP_TESTNETS.xdcApothem.usdc,
    "0xb5AB69F7bBada22B28e79C8FFAECe55eF1c771D4"
  );
  assert.equal(
    CCTP_TESTNETS.arbitrumSepolia.tokenMessenger,
    CCTP_TOKEN_MESSENGER_V2_TESTNET
  );
  assert.equal(
    CCTP_TESTNETS.xdcApothem.messageTransmitter,
    CCTP_MESSAGE_TRANSMITTER_V2_TESTNET
  );
});

test("converts EVM recipients to CCTP bytes32 values", () => {
  assert.equal(
    addressToCctpBytes32(recipient),
    "0x" + "0".repeat(24) + recipient.slice(2).toLowerCase()
  );
  assert.throws(
    () => addressToCctpBytes32(zeroAddress),
    (error) => error instanceof CctpTestnetError && error.code === "INVALID_ADDRESS"
  );
});

test("parses USDC amounts without losing precision", () => {
  assert.equal(parseCctpUsdcAmount("1.5"), 1_500_000n);
  assert.equal(parseCctpUsdcAmount("0.000001"), 1n);
  assert.equal(parseCctpUsdcAmount("10000000"), CCTP_MAX_TRANSFER_AMOUNT);

  for (const amount of ["0", "1.0000001", "01", "-1", "10000000.000001"]) {
    assert.throws(
      () => parseCctpUsdcAmount(amount),
      (error) => error instanceof CctpTestnetError && error.code === "INVALID_AMOUNT"
    );
  }
});

test("prepares Arbitrum Sepolia to XDC Apothem approval and burn requests", () => {
  const plan = prepareCctpBurn({
    source: "arbitrumSepolia",
    destination: "xdcApothem",
    amount: "25.5",
    recipient,
    maxFee: 10_000n
  });

  assert.equal(plan.amount, 25_500_000n);
  assert.equal(plan.approvalRequest.chainId, 421614);
  assert.equal(plan.approvalRequest.address, CCTP_TESTNETS.arbitrumSepolia.usdc);
  assert.deepEqual(plan.approvalRequest.args, [CCTP_TOKEN_MESSENGER_V2_TESTNET, 25_500_000n]);
  assert.equal(plan.burnRequest.chainId, 421614);
  assert.equal(plan.burnRequest.address, CCTP_TOKEN_MESSENGER_V2_TESTNET);
  assert.equal(plan.burnRequest.args[1], 18);
  assert.equal(plan.burnRequest.args[2], addressToCctpBytes32(recipient));
  assert.equal(plan.burnRequest.args[3], CCTP_TESTNETS.arbitrumSepolia.usdc);
  assert.equal(plan.burnRequest.args[4], CCTP_ZERO_BYTES32);
  assert.equal(plan.burnRequest.args[5], 10_000n);
  assert.equal(plan.burnRequest.args[6], CCTP_STANDARD_FINALITY_THRESHOLD);
});

test("prepares the reverse XDC Apothem to Arbitrum Sepolia direction", () => {
  const plan = prepareCctpBurn({
    source: "xdcApothem",
    destination: "arbitrumSepolia",
    amount: 2_000_000n,
    recipient
  });

  assert.equal(plan.approvalRequest.chainId, 51);
  assert.equal(plan.approvalRequest.address, CCTP_TESTNETS.xdcApothem.usdc);
  assert.equal(plan.burnRequest.args[1], 3);
  assert.equal(plan.burnRequest.args[3], CCTP_TESTNETS.xdcApothem.usdc);
  assert.equal(plan.maxFee, 0n);
});

test("rejects unsafe burn plans", () => {
  assert.throws(
    () =>
      prepareCctpBurn({
        source: "xdcApothem",
        destination: "xdcApothem",
        amount: "1",
        recipient
      }),
    (error) => error instanceof CctpTestnetError && error.code === "INVALID_DIRECTION"
  );
  assert.throws(
    () =>
      prepareCctpBurn({
        source: "xdcApothem",
        destination: "arbitrumSepolia",
        amount: "1",
        recipient: "not-an-address"
      }),
    (error) => error instanceof CctpTestnetError && error.code === "INVALID_ADDRESS"
  );
  assert.throws(
    () =>
      prepareCctpBurn({
        source: "xdcApothem",
        destination: "arbitrumSepolia",
        amount: "1",
        recipient,
        maxFee: 1_000_000n
      }),
    (error) => error instanceof CctpTestnetError && error.code === "INVALID_MAX_FEE"
  );
});

test("builds the Circle attestation URL from the source domain", () => {
  assert.equal(
    buildCctpAttestationUrl("arbitrumSepolia", transactionHash),
    CCTP_TESTNET_IRIS_API + "/v2/messages/3?transactionHash=" + transactionHash
  );
  assert.throws(
    () => buildCctpAttestationUrl("xdcApothem", "0x1234"),
    (error) =>
      error instanceof CctpTestnetError && error.code === "INVALID_TRANSACTION_HASH"
  );
});

test("prepares the destination receiveMessage request", () => {
  const request = prepareCctpReceive("xdcApothem", "0x1234", "0xabcd");
  assert.equal(request.chainId, 51);
  assert.equal(request.address, CCTP_MESSAGE_TRANSMITTER_V2_TESTNET);
  assert.equal(request.functionName, "receiveMessage");
  assert.deepEqual(request.args, ["0x1234", "0xabcd"]);

  assert.throws(
    () => prepareCctpReceive("xdcApothem", "0x1", "0xabcd"),
    (error) => error instanceof CctpTestnetError && error.code === "INVALID_MESSAGE"
  );
});
