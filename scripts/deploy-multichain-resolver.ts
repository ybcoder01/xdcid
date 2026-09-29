import { ethers } from "hardhat";

async function main() {
  const registryAddress = process.env.XNS_REGISTRY_ADDRESS;
  const reverseResolverAddress = process.env.XNS_REVERSE_RESOLVER_ADDRESS;
  if (!registryAddress || !ethers.isAddress(registryAddress)) {
    throw new Error("Set XNS_REGISTRY_ADDRESS to the deployed XNS Registry address");
  }
  if (!reverseResolverAddress || !ethers.isAddress(reverseResolverAddress)) {
    throw new Error(
      "Set XNS_REVERSE_RESOLVER_ADDRESS to the deployed verified reverse resolver address"
    );
  }

  const Resolver = await ethers.getContractFactory("XNSMultichainResolverV2");
  const resolver = await Resolver.deploy(registryAddress, reverseResolverAddress);
  await resolver.waitForDeployment();

  console.log({
    multichainResolver: await resolver.getAddress(),
    registry: registryAddress,
    reverseResolver: reverseResolverAddress
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
