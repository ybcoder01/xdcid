import { ethers } from "hardhat";

async function requireContractAddress(
  value: string | undefined,
  variableName: string,
): Promise<string> {
  if (!value || !ethers.isAddress(value)) {
    throw new Error("Set " + variableName + " to a valid contract address");
  }
  if ((await ethers.provider.getCode(value)) === "0x") {
    throw new Error(variableName + " does not contain deployed contract code");
  }
  return value;
}

async function main() {
  const registryAddress = await requireContractAddress(
    process.env.REGISTRY_ADDRESS,
    "REGISTRY_ADDRESS",
  );
  const legacyRegistryAddress = await requireContractAddress(
    process.env.LEGACY_REGISTRY_ADDRESS,
    "LEGACY_REGISTRY_ADDRESS",
  );
  const pricingPolicyAddress = await requireContractAddress(
    process.env.PRICING_POLICY_ADDRESS,
    "PRICING_POLICY_ADDRESS",
  );

  const Registrar = await ethers.getContractFactory(
    "XNSSignedQuoteRegistrar",
  );
  const registrar = await Registrar.deploy(
    registryAddress,
    legacyRegistryAddress,
    pricingPolicyAddress,
  );
  await registrar.waitForDeployment();

  console.log({
    registry: registryAddress,
    legacyRegistry: legacyRegistryAddress,
    pricingPolicy: pricingPolicyAddress,
    registrar: await registrar.getAddress(),
    nextSteps: [
      "Verify the contract through Hardhat CLI",
      "Test signed registration and renewal without activating it",
      "Activate only from the registry owner wallet after approval",
    ],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
