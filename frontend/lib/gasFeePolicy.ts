import type { PublicClient } from "viem";

export type AdaptiveGasFeeOverrides = {
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
};

export type Eip1559FeePolicy = {
  minimumPriorityFeePerGas: bigint;
  baseFeeMarginBps: bigint;
};

const DEFAULT_MARGIN_BPS = 2_500n;
const BPS_DENOMINATOR = 10_000n;

export const EIP1559_FEE_POLICIES: Readonly<Record<number, Eip1559FeePolicy>> = {
  // Ethereum and Sepolia
  1: { minimumPriorityFeePerGas: 1_000_000_000n, baseFeeMarginBps: DEFAULT_MARGIN_BPS },
  11155111: { minimumPriorityFeePerGas: 1_000_000_000n, baseFeeMarginBps: DEFAULT_MARGIN_BPS },
  // XDC and Apothem
  50: { minimumPriorityFeePerGas: 10_000_000n, baseFeeMarginBps: DEFAULT_MARGIN_BPS },
  51: { minimumPriorityFeePerGas: 10_000_000n, baseFeeMarginBps: DEFAULT_MARGIN_BPS },
  // Polygon and Amoy
  137: { minimumPriorityFeePerGas: 25_000_000_000n, baseFeeMarginBps: DEFAULT_MARGIN_BPS },
  80002: { minimumPriorityFeePerGas: 25_000_000_000n, baseFeeMarginBps: DEFAULT_MARGIN_BPS },
  // Base and Base Sepolia
  8453: { minimumPriorityFeePerGas: 1_000_000n, baseFeeMarginBps: DEFAULT_MARGIN_BPS },
  84532: { minimumPriorityFeePerGas: 1_000_000n, baseFeeMarginBps: DEFAULT_MARGIN_BPS },
  // Arbitrum and Arbitrum Sepolia
  42161: { minimumPriorityFeePerGas: 10_000_000n, baseFeeMarginBps: DEFAULT_MARGIN_BPS },
  421614: { minimumPriorityFeePerGas: 10_000_000n, baseFeeMarginBps: DEFAULT_MARGIN_BPS }
};

export function getEip1559FeePolicy(
  chainId: number
): Eip1559FeePolicy | undefined {
  return EIP1559_FEE_POLICIES[chainId];
}

export function calculateBufferedEip1559Fees(input: {
  baseFeePerGas: bigint;
  estimatedMaxFeePerGas?: bigint;
  estimatedPriorityFeePerGas?: bigint;
  policy: Eip1559FeePolicy;
}): Required<AdaptiveGasFeeOverrides> {
  const priorityFee =
    input.estimatedPriorityFeePerGas !== undefined &&
    input.estimatedPriorityFeePerGas > input.policy.minimumPriorityFeePerGas
      ? input.estimatedPriorityFeePerGas
      : input.policy.minimumPriorityFeePerGas;
  const bufferedBaseFee =
    (input.baseFeePerGas *
      (BPS_DENOMINATOR + input.policy.baseFeeMarginBps) +
      BPS_DENOMINATOR -
      1n) /
    BPS_DENOMINATOR;
  const bufferedMaximum = bufferedBaseFee + priorityFee;
  const estimatedMaximum = input.estimatedMaxFeePerGas ?? 0n;

  return {
    maxFeePerGas:
      estimatedMaximum > bufferedMaximum
        ? estimatedMaximum
        : bufferedMaximum,
    maxPriorityFeePerGas: priorityFee
  };
}

export async function estimateAdaptiveGasFees(
  client: PublicClient,
  chainId: number
): Promise<AdaptiveGasFeeOverrides> {
  const policy = getEip1559FeePolicy(chainId);
  if (!policy) return {};

  try {
    const [block, estimate] = await Promise.all([
      client.getBlock(),
      client.estimateFeesPerGas({ type: "eip1559" })
    ]);
    if (block.baseFeePerGas === null) return {};

    return calculateBufferedEip1559Fees({
      baseFeePerGas: block.baseFeePerGas,
      estimatedMaxFeePerGas: estimate.maxFeePerGas,
      estimatedPriorityFeePerGas: estimate.maxPriorityFeePerGas,
      policy
    });
  } catch {
    // If fee RPC methods are unavailable, preserve the connected wallet's
    // native estimation instead of blocking the transaction.
    return {};
  }
}

export function isBaseFeeTooLowError(cause: unknown): boolean {
  const message =
    cause instanceof Error
      ? cause.message
      : typeof cause === "string"
        ? cause
        : "";
  const normalized = message.toLowerCase();
  return (
    normalized.includes("max fee per gas less than block base fee") ||
    normalized.includes("fee cap less than block base fee") ||
    normalized.includes("maxfeepergas") &&
      normalized.includes("basefee")
  );
}
