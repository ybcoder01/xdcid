export function domainRevenueEventId(input: {
  chainId: number;
  contractAddress: string;
  transactionHash: string;
  logIndex: number;
}) {
  return [
    input.chainId,
    input.contractAddress.toLowerCase(),
    input.transactionHash.toLowerCase(),
    input.logIndex,
  ].join(":");
}
