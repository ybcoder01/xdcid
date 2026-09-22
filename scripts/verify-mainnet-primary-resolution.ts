import { ethers, run } from "hardhat";

const OWNER = "0xe82a4267CC310FC6Db334601671A043DFc8Ce06A";
const REGISTRY = "0x05fa64a05bc205DeDF47e023d2D90c2d119cd097";
const LEGACY_REGISTRY = "0x295a7aB79368187a6CD03c464cfaAb04d799784E";
const PRICING_POLICY = "0x8aE4b7E57b6693c70FD40F5De17974CA5AB6DB94";
const DISCOUNT_AUTHORIZATION = "0x9EE907230d351264403555fA6967EA44Ba31A5d1";

const PRIMARY_REGISTRAR = "0x3D87B064a06f62cc4a24EAff13A591C9Ba791135";
const FORWARD_RESOLVER = "0x9d3CcAF4Db85F845B1B72972211356C6C4BB8661";
const REVERSE_RESOLVER = "0x2E17282219BB55359f5D07fAFfc406eE4EC97440";
const MULTICHAIN_RESOLVER = "0xf4B040A2519E8BFdA62eDC3FDd1b6F9867F97232";

async function verify(
  address: string,
  constructorArguments: readonly unknown[],
  contract: string,
) {
  console.log(`Verifying ${contract} at ${address}`);
  await run("verify:verify", {
    address,
    constructorArguments: [...constructorArguments],
    contract,
  });
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 50n) {
    throw new Error("Refusing to verify outside XDC mainnet");
  }
  if (!process.env.ETHERSCAN_API_KEY && !process.env.XDCSCAN_API_KEY) {
    throw new Error("Set ETHERSCAN_API_KEY or XDCSCAN_API_KEY before verification");
  }

  await verify(
    FORWARD_RESOLVER,
    [REGISTRY],
    "contracts/XNSResolverV2.sol:XNSResolverV2",
  );
  await verify(
    REVERSE_RESOLVER,
    [REGISTRY],
    "contracts/XNSReverseResolverV3.sol:XNSReverseResolverV3",
  );
  await verify(
    MULTICHAIN_RESOLVER,
    [REGISTRY, REVERSE_RESOLVER],
    "contracts/XNSMultichainResolverV2.sol:XNSMultichainResolverV2",
  );
  await verify(
    PRIMARY_REGISTRAR,
    [
      REGISTRY,
      LEGACY_REGISTRY,
      PRICING_POLICY,
      DISCOUNT_AUTHORIZATION,
      REVERSE_RESOLVER,
      OWNER,
    ],
    "contracts/XNSPrimaryRegistrar.sol:XNSPrimaryRegistrar",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
