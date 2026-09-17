import { ethers, run } from "hardhat";

type ResolverTarget = {
  label: string;
  address: string;
  contractName: "XNSResolverV2" | "XNSReverseResolverV2";
};

async function main() {
  const registryAddress = process.env.XNS_REGISTRY_ADDRESS;
  const resolverAddress = process.env.RESOLVER_V2_ADDRESS;
  const reverseResolverAddress = process.env.REVERSE_RESOLVER_V2_ADDRESS;

  if (!registryAddress || !ethers.isAddress(registryAddress)) {
    throw new Error("Set XNS_REGISTRY_ADDRESS to the deployed XNS Registry address");
  }
  if (!resolverAddress || !ethers.isAddress(resolverAddress)) {
    throw new Error("Set RESOLVER_V2_ADDRESS to the deployed forward Resolver V2 address");
  }
  if (!reverseResolverAddress || !ethers.isAddress(reverseResolverAddress)) {
    throw new Error(
      "Set REVERSE_RESOLVER_V2_ADDRESS to the deployed Reverse Resolver V2 address"
    );
  }

  const expectedRegistry = ethers.getAddress(registryAddress);
  const targets: ResolverTarget[] = [
    {
      label: "forward resolver",
      address: ethers.getAddress(resolverAddress),
      contractName: "XNSResolverV2"
    },
    {
      label: "reverse resolver",
      address: ethers.getAddress(reverseResolverAddress),
      contractName: "XNSReverseResolverV2"
    }
  ];

  for (const target of targets) {
    const code = await ethers.provider.getCode(target.address);
    if (code === "0x") {
      throw new Error(`${target.label} has no deployed contract code`);
    }

    const resolver = await ethers.getContractAt(target.contractName, target.address);
    const configuredRegistry = ethers.getAddress(await resolver.registry());
    if (configuredRegistry !== expectedRegistry) {
      throw new Error(
        `${target.label} registry mismatch: expected ${expectedRegistry}, received ${configuredRegistry}`
      );
    }

    if (process.env.SKIP_EXPLORER_VERIFICATION !== "true") {
      try {
        await run("verify:verify", {
          address: target.address,
          constructorArguments: [expectedRegistry],
          contract: `contracts/${target.contractName}.sol:${target.contractName}`
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/already verified/i.test(message)) throw error;
      }
    }

    console.log(`${target.label} verified: ${target.address}`);
  }

  console.log({
    registry: expectedRegistry,
    resolverV2: targets[0].address,
    reverseResolverV2: targets[1].address,
    safeToConfigureFrontend: true
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
