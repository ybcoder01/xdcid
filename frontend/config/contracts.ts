import { xnsAddresses } from "./addresses";

export const xdcMainnet = {
  id: 50,
  name: "XDC Network",
  nativeCurrency: { name: "XDC", symbol: "XDC", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_XDC_RPC_URL || "https://rpc.xdcrpc.com"] }
  },
  blockExplorers: {
    default: { name: "XDCScan", url: "https://xdcscan.com" }
  }
} as const;

export const addresses = {
  registry: (process.env.NEXT_PUBLIC_XNS_REGISTRY || xnsAddresses.registry) as `0x${string}`,
  registrar: (process.env.NEXT_PUBLIC_XNS_REGISTRAR || xnsAddresses.registrar) as `0x${string}`,
  resolver: (process.env.NEXT_PUBLIC_XNS_RESOLVER || xnsAddresses.resolver) as `0x${string}`,
  reverseResolver: (process.env.NEXT_PUBLIC_XNS_REVERSE_RESOLVER || xnsAddresses.reverseResolver) as `0x${string}`,
  organization: (process.env.NEXT_PUBLIC_XNS_ORGANIZATION || "0x0000000000000000000000000000000000000000") as `0x${string}`
};

export const zeroAddress = "0x0000000000000000000000000000000000000000";

export const contractsConfigured =
  addresses.registry !== zeroAddress &&
  addresses.registrar !== zeroAddress &&
  addresses.resolver !== zeroAddress &&
  addresses.reverseResolver !== zeroAddress;

export const organizationConfigured = addresses.organization !== zeroAddress;

export const registrarAbi = [
  {
    type: "function",
    name: "available",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "price",
    stateMutability: "pure",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "nodeFor",
    stateMutability: "pure",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ type: "bytes32" }]
  },
  {
    type: "function",
    name: "register",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "nameOwner", type: "address" },
      { name: "years_", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "renew",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "years_", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }]
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }],
    outputs: []
  }
] as const;

export const registryAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ type: "address" }]
  },
  {
    type: "function",
    name: "expiryOf",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "setResolver",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "resolver", type: "address" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "transferName",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "newOwner", type: "address" }
    ],
    outputs: []
  }
] as const;

export const resolverAbi = [
  {
    type: "function",
    name: "addresses",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ type: "address" }]
  },
  {
    type: "function",
    name: "text",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" }
    ],
    outputs: [{ type: "string" }]
  },
  {
    type: "function",
    name: "setAddress",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "addr", type: "address" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "setText",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" }
    ],
    outputs: []
  }
] as const;

export const reverseResolverAbi = [
  {
    type: "function",
    name: "primaryNames",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "string" }]
  },
  {
    type: "function",
    name: "setPrimaryName",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "node", type: "bytes32" }
    ],
    outputs: []
  }
] as const;

export const organizationAbi = [
  {
    type: "function",
    name: "annualFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "organizationStatus",
    stateMutability: "view",
    inputs: [{ name: "parentName", type: "string" }],
    outputs: [
      { name: "parentNode", type: "bytes32" },
      { name: "parentOwner", type: "address" },
      { name: "paidUntil", type: "uint256" },
      { name: "active", type: "bool" }
    ]
  },
  {
    type: "function",
    name: "subscribe",
    stateMutability: "payable",
    inputs: [
      { name: "parentName", type: "string" },
      { name: "years_", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "setManager",
    stateMutability: "nonpayable",
    inputs: [
      { name: "parentName", type: "string" },
      { name: "manager", type: "address" },
      { name: "approved", type: "bool" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "bulkIssue",
    stateMutability: "nonpayable",
    inputs: [
      { name: "labels", type: "string[]" },
      { name: "parentName", type: "string" },
      { name: "targets", type: "address[]" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "revokeSubname",
    stateMutability: "nonpayable",
    inputs: [
      { name: "label", type: "string" },
      { name: "parentName", type: "string" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "resolve",
    stateMutability: "view",
    inputs: [
      { name: "label", type: "string" },
      { name: "parentName", type: "string" }
    ],
    outputs: [{ type: "address" }]
  }
] as const;
