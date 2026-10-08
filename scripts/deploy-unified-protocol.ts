import { ethers } from "hardhat";

const SUPPORTED_CHAIN_IDS = new Set([50n, 51n]);

function requiredAddress(name: string): string {
  const value = process.env[name];
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`Set ${name} to a valid address`);
  }
  return ethers.getAddress(value);
}

async function requireContract(name: string): Promise<string> {
  const address = requiredAddress(name);
  if ((await ethers.provider.getCode(address)) === "0x") {
    throw new Error(`${name} does not contain contract code`);
  }
  return address;
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (!SUPPORTED_CHAIN_IDS.has(network.chainId)) {
    throw new Error(`Unsupported deployment chain ${network.chainId}`);
  }
  const expectedChainId = process.env.UNIFIED_DEPLOYMENT_CHAIN_ID;
  if (!expectedChainId || BigInt(expectedChainId) !== network.chainId) {
    throw new Error(
      `Set UNIFIED_DEPLOYMENT_CHAIN_ID=${network.chainId} to acknowledge the target chain`,
    );
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployment signer is configured");

  const legacyRegistry = await requireContract("LEGACY_REGISTRY_ADDRESS");
  const legacySubdomainRegistrar = await requireContract(
    "LEGACY_SUBDOMAIN_REGISTRAR_ADDRESS",
  );
  const pricingPolicy = await requireContract("PRICING_POLICY_ADDRESS");
  const protocolOwner = requiredAddress("PROTOCOL_OWNER");
  const authorizationSigner = requiredAddress("AUTHORIZATION_SIGNER");

  console.log({
    action: "deploy unified XDCID protocol without frontend activation",
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    protocolOwner,
    legacyRegistry,
    legacySubdomainRegistrar,
    pricingPolicy,
    authorizationSigner,
  });

  // Registry ownership remains with the deployment signer only for the atomic
  // registrar bootstrap. A distinct protocol owner must accept the pending
  // Ownable2Step transfer before the deployment can pass preflight.
  const Registry = await ethers.getContractFactory("XNSRegistryV3");
  const registry = await Registry.deploy(deployer.address, legacyRegistry);
  await registry.waitForDeployment();

  const Resolver = await ethers.getContractFactory("XNSUniversalResolver");
  const resolver = await Resolver.deploy(await registry.getAddress());
  await resolver.waitForDeployment();

  const Registrar = await ethers.getContractFactory("XNSUnifiedRegistrar");
  const registrar = await Registrar.deploy(
    await registry.getAddress(),
    await resolver.getAddress(),
    legacySubdomainRegistrar,
    pricingPolicy,
    authorizationSigner,
    protocolOwner,
  );
  await registrar.waitForDeployment();

  const initialize = await registry.setRegistrar(await registrar.getAddress());
  await initialize.wait();

  let ownershipAcceptanceRequired = false;
  if (ethers.getAddress(deployer.address) !== protocolOwner) {
    const transfer = await registry.transferOwnership(protocolOwner);
    await transfer.wait();
    ownershipAcceptanceRequired = true;
  }

  console.log({
    chainId: network.chainId.toString(),
    registry: await registry.getAddress(),
    resolver: await resolver.getAddress(),
    unifiedRegistrar: await registrar.getAddress(),
    pricingPolicy,
    legacyRegistry,
    legacySubdomainRegistrar,
    protocolOwner,
    authorizationSigner,
    ownershipAcceptanceRequired,
    frontendActivationRequired: true,
  });
  console.log(
    "Do not activate the frontend. Verify bytecode, accept pending ownership if required, run unified preflight, reconcile migrated records, and obtain explicit approval.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
