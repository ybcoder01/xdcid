import { ethers } from "hardhat";

type Check = {
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
};

function requiredAddress(name: string): string {
  const value = process.env[name];
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`Set ${name} to a valid address`);
  }
  return ethers.getAddress(value);
}

function addressCheck(name: string, actual: string, expected: string): Check {
  const normalizedActual = ethers.getAddress(actual);
  const normalizedExpected = ethers.getAddress(expected);
  return {
    name,
    expected: normalizedExpected,
    actual: normalizedActual,
    passed: normalizedActual === normalizedExpected,
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

async function requireOptionalLegacyCode(
  label: string,
  address: string,
  checks: Check[],
) {
  if (address === ethers.ZeroAddress) {
    checks.push({
      name: `${label} clean bootstrap`,
      expected: ethers.ZeroAddress,
      actual: address,
      passed: true,
    });
    return;
  }
  await requireCode(label, address, checks);
}

async function main() {
  const expectedChainId = process.env.UNIFIED_DEPLOYMENT_CHAIN_ID;
  const network = await ethers.provider.getNetwork();
  if (!expectedChainId || BigInt(expectedChainId) !== network.chainId) {
    throw new Error(
      `Set UNIFIED_DEPLOYMENT_CHAIN_ID=${network.chainId} to acknowledge the inspected chain`,
    );
  }
  if (network.chainId !== 50n && network.chainId !== 51n) {
    throw new Error(`Unsupported preflight chain ${network.chainId}`);
  }

  const registryAddress = requiredAddress("UNIFIED_REGISTRY_ADDRESS");
  const resolverAddress = requiredAddress("UNIFIED_RESOLVER_ADDRESS");
  const registrarAddress = requiredAddress("UNIFIED_REGISTRAR_ADDRESS");
  const legacyRegistry = requiredAddress("LEGACY_REGISTRY_ADDRESS");
  const legacySubdomains = requiredAddress(
    "LEGACY_SUBDOMAIN_REGISTRAR_ADDRESS",
  );
  const pricingPolicy = requiredAddress("PRICING_POLICY_ADDRESS");
  const protocolOwner = requiredAddress("PROTOCOL_OWNER");
  const authorizationSigner = requiredAddress("AUTHORIZATION_SIGNER");
  const checks: Check[] = [];

  await Promise.all([
    requireCode("Registry V3", registryAddress, checks),
    requireCode("Universal Resolver", resolverAddress, checks),
    requireCode("Unified Registrar", registrarAddress, checks),
    requireOptionalLegacyCode("Legacy Registry", legacyRegistry, checks),
    requireOptionalLegacyCode(
      "Legacy Subdomain Registrar",
      legacySubdomains,
      checks,
    ),
    requireCode("Pricing Policy V2", pricingPolicy, checks),
  ]);

  const registry = await ethers.getContractAt("XNSRegistryV3", registryAddress);
  const resolver = await ethers.getContractAt(
    "XNSUniversalResolver",
    resolverAddress,
  );
  const registrar = await ethers.getContractAt(
    "XNSUnifiedRegistrar",
    registrarAddress,
  );
  const policy = await ethers.getContractAt("XNSPricingPolicyV2", pricingPolicy);

  const [
    registryOwner,
    pendingRegistryOwner,
    activeRegistrar,
    registryLegacy,
    resolverRegistry,
    registrarOwner,
    registrarRegistry,
    registrarResolver,
    registrarLegacySubdomains,
    registrarPolicy,
    registrarAuthorizationSigner,
    registrarConsumer,
    pendingConfig,
    topLevelRegistrationsPaused,
    topLevelRenewalsPaused,
    subdomainRegistrationsPaused,
    subdomainRenewalsPaused,
    policyVersion,
  ] = await Promise.all([
    registry.owner(),
    registry.pendingOwner(),
    registry.registrar(),
    registry.legacyRegistry(),
    resolver.registry(),
    registrar.owner(),
    registrar.registry(),
    registrar.resolver(),
    registrar.legacySubdomains(),
    registrar.pricingPolicy(),
    registrar.authorizationSigner(),
    registrar.consumer(),
    registrar.hasPendingConfiguration(),
    registrar.topLevelRegistrationsPaused(),
    registrar.topLevelRenewalsPaused(),
    registrar.subdomainRegistrationsPaused(),
    registrar.subdomainRenewalsPaused(),
    policy.version(),
  ]);

  checks.push(
    addressCheck("Registry owner", registryOwner, protocolOwner),
    valueCheck("Registry pending owner cleared", pendingRegistryOwner, ethers.ZeroAddress),
    addressCheck("Registry active registrar", activeRegistrar, registrarAddress),
    addressCheck("Registry legacy Registry", registryLegacy, legacyRegistry),
    addressCheck("Resolver Registry", resolverRegistry, registryAddress),
    addressCheck("Registrar owner", registrarOwner, protocolOwner),
    addressCheck("Registrar Registry", registrarRegistry, registryAddress),
    addressCheck("Registrar Resolver", registrarResolver, resolverAddress),
    addressCheck(
      "Registrar legacy Subdomains",
      registrarLegacySubdomains,
      legacySubdomains,
    ),
    addressCheck("Registrar Pricing Policy", registrarPolicy, pricingPolicy),
    addressCheck(
      "Registrar authorization signer",
      registrarAuthorizationSigner,
      authorizationSigner,
    ),
    addressCheck("Registrar consumer", registrarConsumer, registrarAddress),
    valueCheck("Pending Registrar configuration", pendingConfig, false),
    valueCheck("Top-level registrations paused", topLevelRegistrationsPaused, false),
    valueCheck("Top-level renewals paused", topLevelRenewalsPaused, false),
    valueCheck("Subdomain registrations paused", subdomainRegistrationsPaused, false),
    valueCheck("Subdomain renewals paused", subdomainRenewalsPaused, false),
    valueCheck("Pricing Policy has an active version", policyVersion > 0n, true),
  );

  for (const check of checks) {
    console.log(`${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.actual}`);
  }
  const failed = checks.filter((check) => !check.passed);
  if (failed.length > 0) {
    throw new Error(`Unified protocol preflight failed ${failed.length} check(s)`);
  }
  console.log("Unified protocol preflight passed. Frontend activation remains separate.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
