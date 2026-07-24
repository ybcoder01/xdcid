export const XDC_USDC_ADDRESS = (
  process.env.NEXT_PUBLIC_XDC_USDC_ADDRESS ||
  "0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1"
) as `0x${string}`;

export const erc20TransferAbi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
