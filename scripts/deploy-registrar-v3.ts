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
  const newOwner = process.env.NEW_OWNER;

  if (!newOwner || !ethers.isAddress(newOwner)) {
    throw new Error("Set NEW_OWNER to the registrar owner address");
  }

  const Registrar = await ethers.getContractFactory("XNSRegistrarV3");
  const registrar = await Registrar.deploy(
    registryAddress,
    legacyRegistryAddress,
    newOwner,
  );
  await registrar.waitForDeployment();

  console.log({
    registry: registryAddress,
    legacyRegistry: legacyRegistryAddress,
    registrar: await registrar.getAddress(),
    owner: newOwner,
    nextStep: "Activate this registrar from the registry owner wallet",
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
