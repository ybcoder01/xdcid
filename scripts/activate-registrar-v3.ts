import { ethers } from "hardhat";

async function main() {
  const registryAddress = process.env.REGISTRY_ADDRESS;
  const registrarAddress = process.env.NEW_REGISTRAR;
  const legacyRegistryAddress = process.env.LEGACY_REGISTRY_ADDRESS;

  if (!registryAddress || !ethers.isAddress(registryAddress)) {
    throw new Error("Set REGISTRY_ADDRESS to the existing XNSRegistry address");
  }
  if (!registrarAddress || !ethers.isAddress(registrarAddress)) {
    throw new Error("Set NEW_REGISTRAR to the deployed registrar V3 address");
  }
  if (!legacyRegistryAddress || !ethers.isAddress(legacyRegistryAddress)) {
    throw new Error(
      "Set LEGACY_REGISTRY_ADDRESS to the XDCDomains registry address",
    );
  }

  const [signer] = await ethers.getSigners();
  const registry = await ethers.getContractAt("XNSRegistry", registryAddress);
  const registrar = await ethers.getContractAt(
    "XNSRegistrarV3",
    registrarAddress,
  );

  const registryOwner = await registry.owner();
  if (registryOwner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error("The configured signer is not the registry owner");
  }

  const registrarRegistry = await registrar.registry();
  if (registrarRegistry.toLowerCase() !== registryAddress.toLowerCase()) {
    throw new Error("The new registrar points to a different XNSRegistry");
  }

  const registrarLegacyRegistry = await registrar.legacyRegistry();
  if (
    registrarLegacyRegistry.toLowerCase()
      !== legacyRegistryAddress.toLowerCase()
  ) {
    throw new Error("The new registrar points to a different legacy registry");
  }

  const transaction = await registry.setRegistrar(registrarAddress);
  await transaction.wait();

  console.log({
    registry: registryAddress,
    registrar: await registry.registrar(),
    legacyRegistry: registrarLegacyRegistry,
    transactionHash: transaction.hash,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
