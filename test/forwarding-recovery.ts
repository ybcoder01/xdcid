import { expect } from "chai";
import {
  FORWARDING_RECOVERY_TTL_SECONDS,
  parseForwardingRecoveryInput,
  recoveryRecordMatches,
  type ForwardingRecoveryRecord
} from "../frontend/lib/forwardingRecovery";

describe("forwarding failure recovery", function () {
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
