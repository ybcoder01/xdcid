import { ethers, run } from "hardhat";

const OWNER = "0x9c67d6cfE6A73497e7348b6b852495CA6236C29a";
const REGISTRY = "0x2BeD8EB404e1BD8D690e3dD2Fd06F287e5A92Eb1";
const LEGACY_REGISTRY = "0xe7CfeC8729686CcB2FB25B8275D6bd6Bc68A4bf0";
const PRICING_POLICY = "0x90a719bCAD35EB1048b30e43CA3fC804A35e5c81";
const DISCOUNT_AUTHORIZATION = "0x37A013d55393f0824eFD40C648111f39D18C5F46";
const REGISTRAR = "0xE35722cB7d04Ba36ed284910528A64B1dE855a20";
const REVERSE_RESOLVER = "0x1ff9B9c9463a2d85029bdD3AFC99a8cf51260Ee2";
const MULTICHAIN_RESOLVER = "0x2212Fc40Feda6e8DD7030E9B70B38c7EB79f6989";

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
  if (network.chainId !== 51n) {
    throw new Error("Refusing to verify outside XDC Apothem");
  }

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
    REGISTRAR,
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
