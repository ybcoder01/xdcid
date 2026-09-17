export type CctpTimingNotice = {
  estimate: string;
  detail: string;
};

const SLOW_STANDARD_SOURCES = new Set([1, 8453, 42161]);

const FAST_STANDARD_ATTESTATION_SECONDS: Record<number, number> = {
  50: 10,
  137: 8
};

export function getCctpTimingNotice(
  sourceChainId: number,
  sourceName: string
): CctpTimingNotice {
  if (SLOW_STANDARD_SOURCES.has(sourceChainId)) {
    return {
      estimate: "Allow about 15–20 minutes",
      detail: `Circle Standard Transfer waits for hard finality on ${sourceName} before issuing the attestation. Actual completion can take longer.`
    };
  }

  const attestationSeconds = FAST_STANDARD_ATTESTATION_SECONDS[sourceChainId];
  if (attestationSeconds) {
    return {
      estimate: "Usually completes within a few minutes",
      detail: `Circle's published average attestation time from ${sourceName} is about ${attestationSeconds} seconds. Wallet confirmations and destination minting add time.`
    };
  }

  return {
    estimate: "Completion time varies",
    detail: `Circle waits for finality on ${sourceName} before issuing the attestation. Wallet confirmations and destination minting add time.`
  };
}
