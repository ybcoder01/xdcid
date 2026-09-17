import { ethers } from "hardhat";

async function main() {
  const registryAddress = process.env.XNS_REGISTRY_ADDRESS;
  if (!registryAddress || !ethers.isAddress(registryAddress)) {
    throw new Error("Set XNS_REGISTRY_ADDRESS to the deployed XNS Registry address");
  }

  const registryCode = await ethers.provider.getCode(registryAddress);
  if (registryCode === "0x") {
    throw new Error("XNS_REGISTRY_ADDRESS has no deployed contract code");
  }

  const Resolver = await ethers.getContractFactory("XNSResolverV2");
  const resolver = await Resolver.deploy(registryAddress);
  await resolver.waitForDeployment();

  const ReverseResolver = await ethers.getContractFactory(
    "XNSReverseResolverV2"
  );
  const reverseResolver = await ReverseResolver.deploy(registryAddress);
  await reverseResolver.waitForDeployment();

  const resolverAddress = await resolver.getAddress();
  const reverseResolverAddress = await reverseResolver.getAddress();
  const configuredRegistry = await resolver.registry();
  const configuredReverseRegistry = await reverseResolver.registry();
  if (
    ethers.getAddress(configuredRegistry) !== ethers.getAddress(registryAddress) ||
    ethers.getAddress(configuredReverseRegistry) !== ethers.getAddress(registryAddress)
  ) {
    throw new Error("Resolver bundle registry verification failed");
  }

  console.log({
    resolverV2: resolverAddress,
    reverseResolverV2: reverseResolverAddress,
    registry: ethers.getAddress(registryAddress),
    nextSteps: [
      "Verify the deployment on XDCScan",
      `Set NEXT_PUBLIC_XNS_RESOLVER_V2=${resolverAddress}`,
      `Set NEXT_PUBLIC_XNS_REVERSE_RESOLVER_V2=${reverseResolverAddress}`,
      "Ask current name owners to re-save custom address, profile, and primary-name records"
    ],
    verificationEnvironment: {
      XNS_REGISTRY_ADDRESS: ethers.getAddress(registryAddress),
      RESOLVER_V2_ADDRESS: resolverAddress,
      REVERSE_RESOLVER_V2_ADDRESS: reverseResolverAddress
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
