import type { Address } from "viem";

export type XdcidMainnetDeployment = {
  environment: "production";
  chainId: 50;
  protocolOwner: Address;
  dependencies: { legacyRegistry: Address; usdcToken: Address };
  operations: {
    quoteSigner: Address;
    discountAuthorizationSigner: Address;
    treasury: Address;
  };
  products: { subdomains: "upcoming" | "active" };
  active: {
    registry: Address;
    registrar: Address;
    pricingPolicy: Address;
    pricingPolicyVersion: number;
    discountAuthorization: Address;
    subdomainRegistrar: Address;
    legacyForwardResolver: Address;
    legacyReverseResolver: Address;
    ownerBoundForwardResolver: Address | null;
    ownerVerifiedReverseResolver: Address | null;
    multichainResolver: Address;
    historicalRegistrars: readonly Address[];
  };
  candidate: {
    primaryRegistrar: Address | null;
    ownerBoundForwardResolver: Address | null;
    ownerVerifiedReverseResolver: Address | null;
    primaryAwareMultichainResolver: Address | null;
  };
};

/**
 * Public XDC mainnet deployment state. This is the single checked-in source of
 * truth for application defaults, SDK defaults, release preflight checks, and
 * operator tooling. Secrets and private RPC URLs never belong here.
 */
export const XDC_MAINNET_DEPLOYMENT = {
  environment: "production",
  chainId: 50,
  protocolOwner: "0xe82a4267CC310FC6Db334601671A043DFc8Ce06A",
  dependencies: {
    legacyRegistry: "0x295a7aB79368187a6CD03c464cfaAb04d799784E",
    usdcToken: "0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1",
  },
  operations: {
    quoteSigner: "0x910eD0599F05651C1C2526BcF5F92bD40802D349",
    discountAuthorizationSigner: "0xe82a4267CC310FC6Db334601671A043DFc8Ce06A",
    treasury: "0xa654124E8f9fFafA45FBA864B8Fd36f3FC56F624",
  },
  products: { subdomains: "active" },
  active: {
    registry: "0x05fa64a05bc205DeDF47e023d2D90c2d119cd097",
    registrar: "0xdEaf1742614908a8d170f4c9520c3cd1e967ef36",
    pricingPolicy: "0x8aE4b7E57b6693c70FD40F5De17974CA5AB6DB94",
    pricingPolicyVersion: 2,
    discountAuthorization: "0x9EE907230d351264403555fA6967EA44Ba31A5d1",
    subdomainRegistrar: "0x27b6Ef20912B50F7b86f6C0Aed75d0ddFD7DA1C7",
    legacyForwardResolver: "0x52bfa70B30190050F77033Fe427De8B3d4A8F453",
    legacyReverseResolver: "0x8b1a236845b0CC84094578cEd97844b8dC5f139f",
    ownerBoundForwardResolver: null,
    ownerVerifiedReverseResolver: null,
    multichainResolver: "0x978d46Ba080Ae71b5cB39691106A1cCf6C6c7240",
    historicalRegistrars: [
      "0x31c41237A551FCadf22F8B231D8accA2c16f669b",
      "0x6955Be33d0B414784F9d3a6E71BAc1bb9B376cD7",
      "0xa1584cb17523CEb991155328EdFAD2293b66bd94",
      "0xdEaf1742614908a8d170f4c9520c3cd1e967ef36",
    ],
  },
  candidate: {
    primaryRegistrar: "0x3D87B064a06f62cc4a24EAff13A591C9Ba791135",
    ownerBoundForwardResolver: "0x9d3CcAF4Db85F845B1B72972211356C6C4BB8661",
    ownerVerifiedReverseResolver: "0x2E17282219BB55359f5D07fAFfc406eE4EC97440",
    primaryAwareMultichainResolver: "0xf4B040A2519E8BFdA62eDC3FDd1b6F9867F97232",
  },
} as const satisfies XdcidMainnetDeployment;
