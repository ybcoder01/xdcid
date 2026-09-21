import { ethers } from "hardhat";
import { XDC_MAINNET_DEPLOYMENT } from "../sdk/src/deployment/deployments";

type Check = {
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
};

const primaryRegistrarAbi = [
  "function owner() view returns (address)",
  "function registry() view returns (address)",
  "function legacyRegistry() view returns (address)",
  "function pricingPolicy() view returns (address)",
  "function discountAuthorization() view returns (address)",
  "function primaryNameResolver() view returns (address)",
] as const;

const resolverAbi = ["function registry() view returns (address)"] as const;
const multichainResolverV2Abi = [
  "function registry() view returns (address)",
  "function reverseResolver() view returns (address)",
] as const;

function sameAddress(actual: string, expected: string) {
  return ethers.getAddress(actual) === ethers.getAddress(expected);
}

function addressCheck(name: string, actual: string, expected: string): Check {
  return {
    name,
    expected: ethers.getAddress(expected),
    actual: ethers.getAddress(actual),
    passed: sameAddress(actual, expected),
  };
}

function valueCheck(name: string, actual: unknown, expected: unknown): Check {
  return {
    name,
    expected: String(expected),
    actual: String(actual),
    passed: actual === expected,
  };
}

async function requireCode(label: string, address: string, checks: Check[]) {
  const code = await ethers.provider.getCode(address);
  checks.push({
    name: `${label} bytecode`,
    expected: "deployed bytecode",
    actual: code === "0x" ? "0x" : `${(code.length - 2) / 2} bytes`,
    passed: code !== "0x",
  });
}

async function main() {
  const manifest = XDC_MAINNET_DEPLOYMENT;
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== BigInt(manifest.chainId)) {
    throw new Error(
      `Refusing to inspect chain ${network.chainId}; expected XDC mainnet (${manifest.chainId}).`,
    );
  }

  const checks: Check[] = [];
  const activeContracts = [
    ["Registry", manifest.active.registry],
    ["Legacy Registry", manifest.dependencies.legacyRegistry],
    ["Registrar V2", manifest.active.registrar],
    ["Pricing Policy V2", manifest.active.pricingPolicy],
    ["Discount Authorization", manifest.active.discountAuthorization],
    ["Subdomain Registrar", manifest.active.subdomainRegistrar],
    ["Legacy Forward Resolver", manifest.active.legacyForwardResolver],
    ["Legacy Reverse Resolver", manifest.active.legacyReverseResolver],
    ["Multichain Resolver", manifest.active.multichainResolver],
    ["USDC", manifest.dependencies.usdcToken],
  ] as const;
  await Promise.all(
    activeContracts.map(([label, address]) =>
      requireCode(label, address, checks),
    ),
  );

  const registry = await ethers.getContractAt(
    "XNSRegistry",
    manifest.active.registry,
  );
  const registrar = await ethers.getContractAt(
    "XNSRegistrarV2",
    manifest.active.registrar,
  );
  const policy = await ethers.getContractAt(
    "XNSPricingPolicyV2",
    manifest.active.pricingPolicy,
  );
  const discount = await ethers.getContractAt(
    "XNSDiscountAuthorization",
    manifest.active.discountAuthorization,
  );
  const subdomain = await ethers.getContractAt(
    "XNSSubdomainRegistrar",
    manifest.active.subdomainRegistrar,
  );
  const forwardResolver = await ethers.getContractAt(
    "XNSResolver",
    manifest.active.legacyForwardResolver,
  );
  const reverseResolver = await ethers.getContractAt(
    "XNSReverseResolver",
    manifest.active.legacyReverseResolver,
  );
  const multichainResolver = await ethers.getContractAt(
    "XNSMultichainResolver",
    manifest.active.multichainResolver,
  );
  const usdc = new ethers.Contract(
    manifest.dependencies.usdcToken,
    ["function decimals() view returns (uint8)"],
    ethers.provider,
  );

  const [
    block,
    registryOwner,
    activeRegistrar,
    registrarOwner,
    registrarRegistry,
    registrarLegacyRegistry,
    registrarPolicy,
    registrarDiscount,
    registrationsPaused,
    renewalsPaused,
    policyOwner,
    policyVersion,
    policyConfig,
    discountOwner,
    discountSigner,
    discountConsumer,
    discountPending,
    subdomainOwner,
    subdomainRegistry,
    subdomainPolicy,
    subdomainRegistrationsPaused,
    forwardRegistry,
    reverseRegistry,
    multichainRegistry,
    usdcDecimals,
  ] = await Promise.all([
    ethers.provider.getBlock("latest"),
    registry.owner(),
    registry.registrar(),
    registrar.owner(),
    registrar.registry(),
    registrar.legacyRegistry(),
    registrar.pricingPolicy(),
    registrar.discountAuthorization(),
    registrar.registrationsPaused(),
    registrar.renewalsPaused(),
    policy.owner(),
    policy.version(),
    policy.config(),
    discount.owner(),
    discount.authorizationSigner(),
    discount.consumer(),
    discount.hasPendingConfiguration(),
    subdomain.owner(),
    subdomain.registry(),
    subdomain.pricingPolicy(),
    subdomain.registrationsPaused(),
    forwardResolver.registry(),
    reverseResolver.registry(),
    multichainResolver.registry(),
    usdc.decimals(),
  ]);
  if (!block) throw new Error("Unable to read the latest XDC mainnet block.");

  checks.push(
    addressCheck("Registry owner", registryOwner, manifest.protocolOwner),
    addressCheck(
      "Registry active Registrar",
      activeRegistrar,
      manifest.active.registrar,
    ),
    addressCheck("Registrar owner", registrarOwner, manifest.protocolOwner),
    addressCheck("Registrar Registry", registrarRegistry, manifest.active.registry),
    addressCheck(
      "Registrar legacy Registry",
      registrarLegacyRegistry,
      manifest.dependencies.legacyRegistry,
    ),
    addressCheck(
      "Registrar Pricing Policy",
      registrarPolicy,
      manifest.active.pricingPolicy,
    ),
    addressCheck(
      "Registrar Discount Authorization",
      registrarDiscount,
      manifest.active.discountAuthorization,
    ),
    valueCheck("Registrations paused", registrationsPaused, false),
    valueCheck("Renewals paused", renewalsPaused, false),
    addressCheck("Pricing Policy owner", policyOwner, manifest.protocolOwner),
    valueCheck(
      "Pricing Policy version",
      Number(policyVersion),
      manifest.active.pricingPolicyVersion,
    ),
    addressCheck(
      "Pricing Policy quote signer",
      policyConfig.quoteSigner,
      manifest.operations.quoteSigner,
    ),
    addressCheck(
      "Pricing Policy USDC",
      policyConfig.usdcToken,
      manifest.dependencies.usdcToken,
    ),
    addressCheck(
      "Pricing Policy treasury",
      policyConfig.treasury,
      manifest.operations.treasury,
    ),
    valueCheck("XDC payments enabled", policyConfig.xdcPaymentsEnabled, true),
    valueCheck("USDC payments enabled", policyConfig.usdcPaymentsEnabled, true),
    addressCheck(
      "Discount Authorization owner",
      discountOwner,
      manifest.protocolOwner,
    ),
    addressCheck(
      "Discount Authorization signer",
      discountSigner,
      manifest.operations.discountAuthorizationSigner,
    ),
    addressCheck(
      "Discount Authorization consumer",
      discountConsumer,
      manifest.active.registrar,
    ),
    valueCheck("Discount configuration pending", discountPending, false),
    addressCheck("Subdomain owner", subdomainOwner, manifest.protocolOwner),
    addressCheck(
      "Subdomain Registry",
      subdomainRegistry,
      manifest.active.registry,
    ),
    addressCheck(
      "Subdomain Pricing Policy",
      subdomainPolicy,
      manifest.active.pricingPolicy,
    ),
    addressCheck(
      "Legacy Forward Resolver Registry",
      forwardRegistry,
      manifest.active.registry,
    ),
    addressCheck(
      "Legacy Reverse Resolver Registry",
      reverseRegistry,
      manifest.active.registry,
    ),
    addressCheck(
      "Multichain Resolver Registry",
      multichainRegistry,
      manifest.active.registry,
    ),
    valueCheck("USDC decimals", Number(usdcDecimals), 6),
  );

  const candidateEntries = Object.entries(manifest.candidate);
  const releaseBlockers: string[] = candidateEntries
    .filter(([, address]) => address === null)
    .map(([name]) => `Candidate ${name} is not deployed or recorded.`);

  const ownerCode = await ethers.provider.getCode(manifest.protocolOwner);
  if (ownerCode === "0x") {
    releaseBlockers.push(
      "Protocol administration is still controlled by a single EOA rather than a contract multisig.",
    );
  }
  if (
    manifest.products.subdomains === "upcoming" &&
    !subdomainRegistrationsPaused
  ) {
    releaseBlockers.push(
      "Subdomains are marked upcoming but the deployed Subdomain Registrar accepts registrations.",
    );
  }

  const candidate = manifest.candidate;
  if (
    candidate.primaryRegistrar &&
    candidate.ownerBoundForwardResolver &&
    candidate.ownerVerifiedReverseResolver &&
    candidate.primaryAwareMultichainResolver
  ) {
    await Promise.all([
      requireCode("Candidate Primary Registrar", candidate.primaryRegistrar, checks),
      requireCode(
        "Candidate Owner-bound Forward Resolver",
        candidate.ownerBoundForwardResolver,
        checks,
      ),
      requireCode(
        "Candidate Owner-verified Reverse Resolver",
        candidate.ownerVerifiedReverseResolver,
        checks,
      ),
      requireCode(
        "Candidate Primary-aware Multichain Resolver",
        candidate.primaryAwareMultichainResolver,
        checks,
      ),
    ]);

    const primaryRegistrar = new ethers.Contract(
      candidate.primaryRegistrar,
      primaryRegistrarAbi,
      ethers.provider,
    );
    const ownerBoundResolver = new ethers.Contract(
      candidate.ownerBoundForwardResolver,
      resolverAbi,
      ethers.provider,
    );
    const ownerVerifiedReverseResolver = new ethers.Contract(
      candidate.ownerVerifiedReverseResolver,
      resolverAbi,
      ethers.provider,
    );
    const primaryAwareMultichainResolver = new ethers.Contract(
      candidate.primaryAwareMultichainResolver,
      multichainResolverV2Abi,
      ethers.provider,
    );
    const [
      candidateOwner,
      candidateRegistry,
      candidateLegacyRegistry,
      candidatePolicy,
      candidateDiscount,
      candidatePrimaryResolver,
      candidateForwardRegistry,
      candidateReverseRegistry,
      candidateMultichainRegistry,
      candidateMultichainReverse,
    ] = await Promise.all([
      primaryRegistrar.owner(),
      primaryRegistrar.registry(),
      primaryRegistrar.legacyRegistry(),
      primaryRegistrar.pricingPolicy(),
      primaryRegistrar.discountAuthorization(),
      primaryRegistrar.primaryNameResolver(),
      ownerBoundResolver.registry(),
      ownerVerifiedReverseResolver.registry(),
      primaryAwareMultichainResolver.registry(),
      primaryAwareMultichainResolver.reverseResolver(),
    ]);
    checks.push(
      addressCheck("Candidate Registrar owner", candidateOwner, manifest.protocolOwner),
      addressCheck(
        "Candidate Registrar Registry",
        candidateRegistry,
        manifest.active.registry,
      ),
      addressCheck(
        "Candidate Registrar legacy Registry",
        candidateLegacyRegistry,
        manifest.dependencies.legacyRegistry,
      ),
      addressCheck(
        "Candidate Registrar Pricing Policy",
        candidatePolicy,
        manifest.active.pricingPolicy,
      ),
      addressCheck(
        "Candidate Registrar Discount Authorization",
        candidateDiscount,
        manifest.active.discountAuthorization,
      ),
      addressCheck(
        "Candidate Registrar primary resolver",
        candidatePrimaryResolver,
        candidate.ownerVerifiedReverseResolver,
      ),
      addressCheck(
        "Candidate Forward Resolver Registry",
        candidateForwardRegistry,
        manifest.active.registry,
      ),
      addressCheck(
        "Candidate Reverse Resolver Registry",
        candidateReverseRegistry,
        manifest.active.registry,
      ),
      addressCheck(
        "Candidate Multichain Resolver Registry",
        candidateMultichainRegistry,
        manifest.active.registry,
      ),
      addressCheck(
        "Candidate Multichain Resolver reverse resolver",
        candidateMultichainReverse,
        candidate.ownerVerifiedReverseResolver,
      ),
    );
  }

  const failures = checks.filter((check) => !check.passed);
  const summary = {
    chainId: Number(network.chainId),
    blockNumber: block.number,
    blockTimestamp: block.timestamp,
    checkedAt: new Date(block.timestamp * 1_000).toISOString(),
    manifest: XDC_MAINNET_DEPLOYMENT,
    checks,
    releaseBlockers,
    activeDeploymentValid: failures.length === 0,
    readyForProductionCandidate:
      failures.length === 0 && releaseBlockers.length === 0,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (failures.length > 0) {
    throw new Error(
      `Mainnet deployment invariant check failed: ${failures
        .map((check) => check.name)
        .join(", ")}`,
    );
  }
  if (releaseBlockers.length > 0 && process.env.REPORT_ONLY !== "true") {
    throw new Error(
      `Production release blocked: ${releaseBlockers.join(" ")}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
