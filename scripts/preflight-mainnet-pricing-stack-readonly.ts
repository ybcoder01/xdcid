import { ethers } from "hardhat";

const expected = {
  chainId: 50n,
  registryOwner: ethers.getAddress(process.env.EXPECTED_REGISTRY_OWNER || ""),
  currentRegistrar: ethers.getAddress(process.env.EXPECTED_CURRENT_REGISTRAR || ""),
  registry: ethers.getAddress(process.env.REGISTRY_ADDRESS || ""),
  registrar: ethers.getAddress(process.env.NEW_SIGNED_REGISTRAR || ""),
  policy: ethers.getAddress(process.env.PRICING_POLICY_ADDRESS || ""),
  legacy: ethers.getAddress(process.env.LEGACY_REGISTRY_ADDRESS || ""),
  quoteSigner: ethers.getAddress(process.env.QUOTE_SIGNER || ""),
  usdc: ethers.getAddress(process.env.USDC_ADDRESS || ""),
  treasury: ethers.getAddress(process.env.TREASURY_ADDRESS || ""),
};

async function requireCode(label: string, address: string) {
  if ((await ethers.provider.getCode(address)) === "0x") {
    throw new Error(`${label} has no deployed code at ${address}`);
  }
}

function same(actual: string, wanted: string, label: string) {
  if (ethers.getAddress(actual) !== wanted) {
    throw new Error(`${label} mismatch: got ${actual}, expected ${wanted}`);
  }
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== expected.chainId) {
    throw new Error(`Wrong chain: ${network.chainId}`);
  }

  await Promise.all([
    requireCode("registry", expected.registry),
    requireCode("current registrar", expected.currentRegistrar),
    requireCode("new registrar", expected.registrar),
    requireCode("pricing policy", expected.policy),
    requireCode("legacy registry", expected.legacy),
    requireCode("USDC", expected.usdc),
  ]);

  const registry = await ethers.getContractAt("XNSRegistry", expected.registry);
  const registrar = await ethers.getContractAt("XNSSignedQuoteRegistrar", expected.registrar);
  const policy = await ethers.getContractAt("XNSPricingPolicy", expected.policy);

  const [
    registryOwner,
    currentRegistrar,
    targetRegistry,
    targetLegacy,
    targetPolicy,
    policyOwner,
    policyVersion,
    config,
  ] = await Promise.all([
    registry.owner(),
    registry.registrar(),
    registrar.registry(),
    registrar.legacyRegistry(),
    registrar.pricingPolicy(),
    policy.owner(),
    policy.version(),
    policy.config(),
  ]);

  same(registryOwner, expected.registryOwner, "registry owner");
  same(currentRegistrar, expected.currentRegistrar, "current registrar");
  same(targetRegistry, expected.registry, "new registrar registry");
  same(targetLegacy, expected.legacy, "new registrar legacy registry");
  same(targetPolicy, expected.policy, "new registrar pricing policy");
  same(config.quoteSigner, expected.quoteSigner, "quote signer");
  same(config.usdcToken, expected.usdc, "USDC token");
  same(config.treasury, expected.treasury, "treasury");

  if (!config.xdcPaymentsEnabled || !config.usdcPaymentsEnabled) {
    throw new Error("Both XDC and USDC payments must be enabled");
  }

  console.log(JSON.stringify({
    status: "PASS",
    readOnly: true,
    chainId: network.chainId.toString(),
    registry: expected.registry,
    registryOwner,
    currentRegistrar,
    proposedRegistrar: expected.registrar,
    pricingPolicy: expected.policy,
    policyOwner,
    policyVersion: policyVersion.toString(),
    quoteSigner: config.quoteSigner,
    usdcToken: config.usdcToken,
    treasury: config.treasury,
    xdcPaymentsEnabled: config.xdcPaymentsEnabled,
    usdcPaymentsEnabled: config.usdcPaymentsEnabled,
    rollbackRegistrar: currentRegistrar,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
