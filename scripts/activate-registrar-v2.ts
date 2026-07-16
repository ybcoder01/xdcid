import { ethers } from "hardhat";

async function main() {
  const registryAddress = process.env.REGISTRY_ADDRESS;
  const registrarAddress = process.env.NEW_REGISTRAR;

  if (!registryAddress || !ethers.isAddress(registryAddress)) {
    throw new Error("Set REGISTRY_ADDRESS to the existing XNSRegistry address");
  }

  if (!registrarAddress || !ethers.isAddress(registrarAddress)) {
    throw new Error("Set NEW_REGISTRAR to the deployed registrar v2 address");
  }

  const [signer] = await ethers.getSigners();
  const registry = await ethers.getContractAt("XNSRegistry", registryAddress);
  const registrar = await ethers.getContractAt("XNSRegistrar", registrarAddress);

  const registryOwner = await registry.owner();
  if (registryOwner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error("The configured signer is not the registry owner");
  }

  const registrarRegistry = await registrar.registry();
  if (registrarRegistry.toLowerCase() !== registryAddress.toLowerCase()) {
    throw new Error("The new registrar points to a different registry");
  }

  const transaction = await registry.setRegistrar(registrarAddress);
  await transaction.wait();

  console.log({
    registry: registryAddress,
    registrar: await registry.registrar(),
    transactionHash: transaction.hash
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
