import { ethers } from "hardhat";

const XDC_MAINNET_CHAIN_ID = 50n;

function requiredAddress(name: string): string {
  const value = process.env[name];
  if (!value || !ethers.isAddress(value)) {
    throw new Error("Set " + name + " to a valid address");
  }
  return ethers.getAddress(value);
}

async function requireContract(name: string): Promise<string> {
  const address = requiredAddress(name);
  if ((await ethers.provider.getCode(address)) === "0x") {
    throw new Error(name + " does not contain deployed contract code");
  }
  return address;
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== XDC_MAINNET_CHAIN_ID) {
    throw new Error("Refusing to activate outside XDC mainnet (chain ID 50)");
  }

  const registryAddress = await requireContract("REGISTRY_ADDRESS");
  const registrarAddress = await requireContract("NEW_SIGNED_REGISTRAR");
  const pricingPolicyAddress = await requireContract("PRICING_POLICY_ADDRESS");
  const legacyRegistryAddress = await requireContract("LEGACY_REGISTRY_ADDRESS");
  const expectedSigner = requiredAddress("QUOTE_SIGNER");
  const expectedUsdc = await requireContract("USDC_ADDRESS");
  const expectedTreasury = requiredAddress("TREASURY_ADDRESS");

  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error("No registry-owner signer is configured");

  const registry = await ethers.getContractAt("XNSRegistry", registryAddress);
  const registrar = await ethers.getContractAt(
    "XNSSignedQuoteRegistrar",
    registrarAddress,
  );
  const policy = await ethers.getContractAt(
    "XNSPricingPolicy",
    pricingPolicyAddress,
  );

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

  if (ethers.getAddress(registryOwner) !== ethers.getAddress(signer.address)) {
    throw new Error("The connected signer is not the registry owner");
  }
  if (ethers.getAddress(targetRegistry) !== registryAddress) {
    throw new Error("Registrar points to a different registry");
  }
  if (ethers.getAddress(targetLegacy) !== legacyRegistryAddress) {
    throw new Error("Registrar points to a different legacy registry");
  }
  if (ethers.getAddress(targetPolicy) !== pricingPolicyAddress) {
    throw new Error("Registrar points to a different pricing policy");
  }
  if (ethers.getAddress(config.quoteSigner) !== expectedSigner) {
    throw new Error("Pricing policy quote signer does not match QUOTE_SIGNER");
  }
  if (ethers.getAddress(config.usdcToken) !== expectedUsdc) {
    throw new Error("Pricing policy USDC token does not match USDC_ADDRESS");
  }
  if (ethers.getAddress(config.treasury) !== expectedTreasury) {
    throw new Error("Pricing policy treasury does not match TREASURY_ADDRESS");
  }
  if (!config.xdcPaymentsEnabled || !config.usdcPaymentsEnabled) {
    throw new Error("Both production payment methods must be enabled at launch");
  }

  const preflight = {
    chainId: network.chainId.toString(),
    registry: registryAddress,
    registryOwner,
    currentRegistrar,
    proposedRegistrar: registrarAddress,
    pricingPolicy: pricingPolicyAddress,
    policyOwner,
    policyVersion: policyVersion.toString(),
    quoteSigner: config.quoteSigner,
    usdcToken: config.usdcToken,
    treasury: config.treasury,
    rollbackRegistrar: currentRegistrar,
  };
  console.log(preflight);

  if (process.env.CONFIRM_SIGNED_REGISTRAR_ACTIVATION !== "ACTIVATE_XDC_MAINNET") {
    console.log(
      "Preflight only. Set CONFIRM_SIGNED_REGISTRAR_ACTIVATION=ACTIVATE_XDC_MAINNET to send the activation transaction.",
    );
    return;
  }

  const transaction = await registry.setRegistrar(registrarAddress);
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("Registrar activation transaction failed");
  }
  if (ethers.getAddress(await registry.registrar()) !== registrarAddress) {
    throw new Error("Registry did not retain the new registrar");
  }

  console.log({
    activatedRegistrar: registrarAddress,
    transactionHash: transaction.hash,
    rollbackRegistrar: currentRegistrar,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
