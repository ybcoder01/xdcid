import { ethers, run } from "hardhat";

const OWNER = "0x9c67d6cfE6A73497e7348b6b852495CA6236C29a";
const CURRENT_REGISTRY = "0x2BeD8EB404e1BD8D690e3dD2Fd06F287e5A92Eb1";
const ORIGINAL_LEGACY_REGISTRY = "0xe7CfeC8729686CcB2FB25B8275D6bd6Bc68A4bf0";
const PRICING_POLICY = "0x90a719bCAD35EB1048b30e43CA3fC804A35e5c81";
const DISCOUNT_AUTHORIZATION = "0x37A013d55393f0824eFD40C648111f39D18C5F46";

function requiredAddress(name: string): string {
  const value = process.env[name];
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`${name} must contain a valid deployed address`);
  }
  return ethers.getAddress(value);
}

async function verify(
  address: string,
  constructorArguments: readonly unknown[],
  contract: string,
) {
  console.log(`Verifying ${contract} at ${address}`);
  try {
    await run("verify:verify", {
      address,
      constructorArguments: [...constructorArguments],
      contract,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already verified/i.test(message)) {
      console.log("Already verified");
      return;
    }
    throw error;
  }
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 51n) {
    throw new Error("Refusing to verify outside XDC Apothem");
  }

  const registry = requiredAddress("REGISTRY_V2_ADDRESS");
  const forwardResolver = requiredAddress("FORWARD_RESOLVER_V2_ADDRESS");
  const reverseResolver = requiredAddress("REVERSE_RESOLVER_V3_ADDRESS");
  const registrar = requiredAddress("PRIMARY_REGISTRAR_ADDRESS");
  const multichainResolver = requiredAddress("MULTICHAIN_RESOLVER_V2_ADDRESS");
  const subdomainRegistrar = requiredAddress("SUBDOMAIN_REGISTRAR_V2_ADDRESS");

  await verify(
    registry,
    [OWNER, CURRENT_REGISTRY],
    "contracts/XNSRegistryV2.sol:XNSRegistryV2",
  );
  await verify(
    forwardResolver,
    [registry],
    "contracts/XNSResolverV2.sol:XNSResolverV2",
  );
  await verify(
    reverseResolver,
    [registry],
    "contracts/XNSReverseResolverV3.sol:XNSReverseResolverV3",
  );
  await verify(
    registrar,
    [
      registry,
      ORIGINAL_LEGACY_REGISTRY,
      PRICING_POLICY,
      DISCOUNT_AUTHORIZATION,
      reverseResolver,
      OWNER,
    ],
    "contracts/XNSPrimaryRegistrar.sol:XNSPrimaryRegistrar",
  );
  await verify(
    multichainResolver,
    [registry, reverseResolver],
    "contracts/XNSMultichainResolverV2.sol:XNSMultichainResolverV2",
  );
  await verify(
    subdomainRegistrar,
    [registry, PRICING_POLICY, OWNER],
    "contracts/XNSSubdomainRegistrar.sol:XNSSubdomainRegistrar",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
