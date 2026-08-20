import { expect } from "chai";
import {
  EIP1559_FEE_POLICIES,
  calculateBufferedEip1559Fees,
  getEip1559FeePolicy,
  isBaseFeeTooLowError
} from "../frontend/lib/gasFeePolicy";

describe("adaptive EIP-1559 gas policy", function () {
  it("covers every currently supported mainnet and testnet", function () {
    expect(Object.keys(EIP1559_FEE_POLICIES).map(Number)).to.include.members([
      1, 50, 137, 8453, 42161,
      51, 80002, 84532, 421614, 11155111
    ]);
  });

  it("includes XDC mainnet and Apothem", function () {
    expect(getEip1559FeePolicy(50)).to.not.equal(undefined);
    expect(getEip1559FeePolicy(51)).to.not.equal(undefined);
  });

  it("adds a 25 percent base-fee margin plus the priority fee", function () {
    const fees = calculateBufferedEip1559Fees({
      baseFeePerGas: 20_132_000n,
      estimatedMaxFeePerGas: 20_000_000n,
      estimatedPriorityFeePerGas: 1_000_000n,
      policy: getEip1559FeePolicy(421614)!
    });
    expect(fees.maxPriorityFeePerGas).to.equal(10_000_000n);
    expect(fees.maxFeePerGas).to.equal(35_165_000n);
  });

  it("keeps a safer RPC estimate when it exceeds the buffered fee", function () {
    const fees = calculateBufferedEip1559Fees({
      baseFeePerGas: 100n,
      estimatedMaxFeePerGas: 500n,
      estimatedPriorityFeePerGas: 2n,
      policy: { minimumPriorityFeePerGas: 1n, baseFeeMarginBps: 2_500n }
    });
    expect(fees.maxFeePerGas).to.equal(500n);
    expect(fees.maxPriorityFeePerGas).to.equal(2n);
  });

  it("retries only explicit base-fee-underpricing errors", function () {
    expect(
      isBaseFeeTooLowError(
        new Error("max fee per gas less than block base fee")
      )
    ).to.equal(true);
    expect(isBaseFeeTooLowError(new Error("request is rate limited"))).to.equal(
      false
    );
    expect(isBaseFeeTooLowError(new Error("user rejected the request"))).to.equal(
      false
    );
  });
});
