import { ethers } from "hardhat";

async function main() {
  const registryAddress = process.env.REGISTRY_ADDRESS;
  const newOwner = process.env.NEW_OWNER;

  if (!registryAddress || !ethers.isAddress(registryAddress)) {
    throw new Error("Set REGISTRY_ADDRESS to the existing XNSRegistry address");
  }

  if (!newOwner || !ethers.isAddress(newOwner)) {
    throw new Error("Set NEW_OWNER to the registrar owner address");
  }

  const Registrar = await ethers.getContractFactory("XNSRegistrar");
  const registrar = await Registrar.deploy(registryAddress, newOwner);
  await registrar.waitForDeployment();

  const registrarAddress = await registrar.getAddress();
  console.log({
    registry: registryAddress,
    registrar: registrarAddress,
    owner: newOwner,
    nextStep: "Activate this registrar from the registry owner wallet"
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
