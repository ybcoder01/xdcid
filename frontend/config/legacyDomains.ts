export const legacyXdcDomainsAddress = (
  process.env.NEXT_PUBLIC_XDCDOMAINS_REGISTRY ||
  "0x295a7aB79368187a6CD03c464cfaAb04d799784E"
) as `0x${string}`;

export const legacyXdcDomainsAbi = [
  {
    type: "function",
    name: "exists",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }]
  }
] as const;
