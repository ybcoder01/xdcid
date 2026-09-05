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

export const apothemRegistration = {
  chainId: 51,
  registry: "0x2BeD8EB404e1BD8D690e3dD2Fd06F287e5A92Eb1" as `0x${string}`,
  registrar: "0x506B82DaD0cf55d909D9C6F0edD5A7939339256d" as `0x${string}`,
  pricingPolicy: "0x90a719bCAD35EB1048b30e43CA3fC804A35e5c81" as `0x${string}`,
} as const;

export const apothemSubdomainRegistrar =
  "0xa2135729ce122ef93158FCc4C69683155e6707d3" as `0x${string}`;

// Verified mainnet XNSPricingPolicyV2 deployment. This lets the frontend select
// the correct tuple ABI immediately after the policy address is switched, while
// the explicit public generation setting remains available for future policies.
export const mainnetPricingPolicyV2 =
  "0x8aE4b7E57b6693c70FD40F5De17974CA5AB6DB94" as `0x${string}`;

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
  ) as `0x${string}`,
  subdomainRegistrar: (
    process.env.NEXT_PUBLIC_XNS_SUBDOMAIN_REGISTRAR ||
    "0x0000000000000000000000000000000000000000"
  ) as `0x${string}`
};

export const isTestnetEnvironment =
  process.env.NEXT_PUBLIC_PAYMENT_NETWORK_ENV?.toLowerCase() === "testnet";

export const activeXnsChainId = isTestnetEnvironment ? apothemRegistration.chainId : 50;
export const activeRegistryAddress = isTestnetEnvironment
  ? apothemRegistration.registry
  : addresses.registry;
export const activeRegistrarAddress = isTestnetEnvironment
  ? apothemRegistration.registrar
  : addresses.registrar;
export const activeSubdomainRegistrarAddress = isTestnetEnvironment
  ? apothemSubdomainRegistrar
  : addresses.subdomainRegistrar;

// Apothem currently has the registry and signed registrar, but no separately
// deployed resolver suite. Dev therefore resolves registered names to their
// registry owner as the safe EVM-wide fallback and never calls mainnet resolvers.
export const activeResolverSuiteAvailable = !isTestnetEnvironment;

export const signedRegistrarEnabled =
  process.env.NEXT_PUBLIC_SIGNED_REGISTRAR_ENABLED === "true";

export const subdomainRegistrationEnabled =
  process.env.NEXT_PUBLIC_SUBDOMAIN_REGISTRATION_ENABLED === "true" &&
  activeSubdomainRegistrarAddress !==
    "0x0000000000000000000000000000000000000000";

export const subdomainRegistrarAbi = [
  {
    type: "function",
    name: "available",
    stateMutability: "view",
    inputs: [
      { name: "parentName", type: "string" },
      { name: "label", type: "string" }
    ],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "nodeFor",
    stateMutability: "pure",
    inputs: [
      { name: "parentName", type: "string" },
      { name: "label", type: "string" }
    ],
    outputs: [{ type: "bytes32" }]
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ type: "address" }]
  },
  {
    type: "function",
    name: "registerWithQuote",
    stateMutability: "payable",
    inputs: [
      { name: "parentName", type: "string" },
      { name: "label", type: "string" },
      {
        name: "quote",
        type: "tuple",
        components: [
          { name: "node", type: "bytes32" },
          { name: "parentNode", type: "bytes32" },
          { name: "payer", type: "address" },
          { name: "subdomainOwner", type: "address" },
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
      { name: "quoteSignature", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "renewWithQuote",
    stateMutability: "payable",
    inputs: [
      { name: "parentName", type: "string" },
      { name: "label", type: "string" },
      {
        name: "quote",
        type: "tuple",
        components: [
          { name: "node", type: "bytes32" },
          { name: "parentNode", type: "bytes32" },
          { name: "payer", type: "address" },
          { name: "subdomainOwner", type: "address" },
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
      { name: "quoteSignature", type: "bytes" }
    ],
    outputs: []
  }
] as const;

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

export const pricingPolicyV2Abi = [
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
    name: "priceUsdMicros",
    stateMutability: "view",
    inputs: [
      { name: "product", type: "uint8" },
      { name: "labelLength", type: "uint256" },
      { name: "years_", type: "uint256" }
    ],
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
        { name: "twoCharacterAnnualUsdMicros", type: "uint64" },
        { name: "threeCharacterAnnualUsdMicros", type: "uint64" },
        { name: "fourCharacterAnnualUsdMicros", type: "uint64" },
        { name: "standardAnnualUsdMicros", type: "uint64" },
        { name: "subdomainAnnualUsdMicros", type: "uint64" },
        { name: "premiumSubdomainAnnualUsdMicros", type: "uint64" },
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
        { name: "twoCharacterAnnualUsdMicros", type: "uint64" },
        { name: "threeCharacterAnnualUsdMicros", type: "uint64" },
        { name: "fourCharacterAnnualUsdMicros", type: "uint64" },
        { name: "standardAnnualUsdMicros", type: "uint64" },
        { name: "subdomainAnnualUsdMicros", type: "uint64" },
        { name: "premiumSubdomainAnnualUsdMicros", type: "uint64" },
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

export const legacyPricingPolicyAbi = [
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
    name: "priceUsdMicros",
    stateMutability: "view",
    inputs: [
      { name: "product", type: "uint8" },
      { name: "labelLength", type: "uint256" },
      { name: "years_", type: "uint256" }
    ],
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

const configuredPricingPolicyGeneration =
  process.env.NEXT_PUBLIC_XNS_PRICING_POLICY_VERSION?.trim().toLowerCase();

export const pricingPolicyGeneration =
  configuredPricingPolicyGeneration === "legacy" ||
  configuredPricingPolicyGeneration === "1"
    ? "legacy"
    : configuredPricingPolicyGeneration === "v2" ||
        configuredPricingPolicyGeneration === "2" ||
        isTestnetEnvironment ||
        addresses.pricingPolicy.toLowerCase() ===
          mainnetPricingPolicyV2.toLowerCase()
      ? "v2"
      : "legacy";

// Both policy generations expose the same operational methods. Keep the
// environment-specific ABI behind this shared export so dev can use V2 while
// the current mainnet signed registrar continues to use its legacy policy.
export const pricingPolicyAbi = (
  pricingPolicyGeneration === "v2"
    ? pricingPolicyV2Abi
    : legacyPricingPolicyAbi
) as typeof pricingPolicyV2Abi;
