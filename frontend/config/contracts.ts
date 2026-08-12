import { xnsAddresses } from "./addresses";
import {
  MULTICHAIN_RESOLVER_ADDRESS,
  SUPPORTED_MULTICHAIN_NETWORKS,
  multichainResolverAbi
} from "../../sdk/src/index";

export { multichainResolverAbi };
export const supportedMultichainNetworks = SUPPORTED_MULTICHAIN_NETWORKS;

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
  multichainResolver: (
    process.env.NEXT_PUBLIC_XNS_MULTICHAIN_RESOLVER || MULTICHAIN_RESOLVER_ADDRESS
  ) as `0x${string}`,
  pricingPolicy: (
    process.env.NEXT_PUBLIC_XNS_PRICING_POLICY ||
    "0x0000000000000000000000000000000000000000"
  ) as `0x${string}`
};

export const signedRegistrarEnabled =
  process.env.NEXT_PUBLIC_SIGNED_REGISTRAR_ENABLED === "true";

export const signedRegistrarAbi = [
  {
    type: "function",
    name: "registerWithQuote",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      {
        name: "quote",
        type: "tuple",
        components: [
          { name: "node", type: "bytes32" },
          { name: "payer", type: "address" },
          { name: "nameOwner", type: "address" },
          { name: "product", type: "uint8" },
          { name: "termYears", type: "uint256" },
          { name: "paymentToken", type: "address" },
          { name: "paymentAmount", type: "uint256" },
          { name: "usdMicros", type: "uint256" },
          { name: "policyVersion", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "issuedAt", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "renewWithQuote",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      {
        name: "quote",
        type: "tuple",
        components: [
          { name: "node", type: "bytes32" },
          { name: "payer", type: "address" },
          { name: "nameOwner", type: "address" },
          { name: "product", type: "uint8" },
          { name: "termYears", type: "uint256" },
          { name: "paymentToken", type: "address" },
          { name: "paymentAmount", type: "uint256" },
          { name: "usdMicros", type: "uint256" },
          { name: "policyVersion", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "issuedAt", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  }
] as const;

export const erc20ApprovalAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

export const zeroAddress = "0x0000000000000000000000000000000000000000";

export const contractsConfigured =
  addresses.registry !== zeroAddress &&
  addresses.registrar !== zeroAddress &&
  addresses.resolver !== zeroAddress &&
  addresses.reverseResolver !== zeroAddress &&
  addresses.multichainResolver !== zeroAddress;

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


export const ownableAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "transferOwnership",
    stateMutability: "nonpayable",
    inputs: [{ name: "newOwner", type: "address" }],
    outputs: []
  }
] as const;

export const pricingPolicyAbi = [
  ...ownableAbi,
  {
    type: "function",
    name: "version",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "config",
    stateMutability: "view",
    inputs: [],
    outputs: [{
      name: "",
      type: "tuple",
      components: [
        { name: "threeCharacterAnnualUsdMicros", type: "uint64" },
        { name: "fourCharacterAnnualUsdMicros", type: "uint64" },
        { name: "standardAnnualUsdMicros", type: "uint64" },
        { name: "subdomainAnnualUsdMicros", type: "uint64" },
        { name: "migrationUsdMicros", type: "uint64" },
        { name: "threeYearDiscountBps", type: "uint16" },
        { name: "fiveYearDiscountBps", type: "uint16" },
        { name: "tenYearDiscountBps", type: "uint16" },
        { name: "xdcQuoteBufferBps", type: "uint16" },
        { name: "quoteSigner", type: "address" },
        { name: "usdcToken", type: "address" },
        { name: "treasury", type: "address" },
        { name: "xdcPaymentsEnabled", type: "bool" },
        { name: "usdcPaymentsEnabled", type: "bool" }
      ]
    }]
  },
  {
    type: "function",
    name: "hasPendingConfig",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "pendingActivationTime",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "proposeConfig",
    stateMutability: "nonpayable",
    inputs: [{
      name: "nextConfig",
      type: "tuple",
      components: [
        { name: "threeCharacterAnnualUsdMicros", type: "uint64" },
        { name: "fourCharacterAnnualUsdMicros", type: "uint64" },
        { name: "standardAnnualUsdMicros", type: "uint64" },
        { name: "subdomainAnnualUsdMicros", type: "uint64" },
        { name: "migrationUsdMicros", type: "uint64" },
        { name: "threeYearDiscountBps", type: "uint16" },
        { name: "fiveYearDiscountBps", type: "uint16" },
        { name: "tenYearDiscountBps", type: "uint16" },
        { name: "xdcQuoteBufferBps", type: "uint16" },
        { name: "quoteSigner", type: "address" },
        { name: "usdcToken", type: "address" },
        { name: "treasury", type: "address" },
        { name: "xdcPaymentsEnabled", type: "bool" },
        { name: "usdcPaymentsEnabled", type: "bool" }
      ]
    }],
    outputs: []
  },
  {
    type: "function",
    name: "cancelPendingConfig",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: []
  },
  {
    type: "function",
    name: "activatePendingConfig",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: []
  }
] as const;
