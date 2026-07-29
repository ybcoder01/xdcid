import { ethers } from "hardhat";

async function main() {
  const registryAddress = process.env.XNS_REGISTRY_ADDRESS;
  if (!registryAddress || !ethers.isAddress(registryAddress)) {
    throw new Error("Set XNS_REGISTRY_ADDRESS to the deployed XNS Registry address");
  }

  const Resolver = await ethers.getContractFactory("XNSMultichainResolver");
  const resolver = await Resolver.deploy(registryAddress);
  await resolver.waitForDeployment();

  console.log({
    multichainResolver: await resolver.getAddress(),
    registry: registryAddress
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
