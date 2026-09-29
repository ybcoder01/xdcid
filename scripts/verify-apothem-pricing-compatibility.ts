import { ethers, run } from "hardhat";

const OWNER = "0x9c67d6cfE6A73497e7348b6b852495CA6236C29a";
const REGISTRY = "0xA601b5e9114c0DfeCea4E0ef99D6Fc020B330512";
const LEGACY_REGISTRY = "0xe7CfeC8729686CcB2FB25B8275D6bd6Bc68A4bf0";
const PRICING_POLICY = "0x90a719bCAD35EB1048b30e43CA3fC804A35e5c81";
const DISCOUNT_AUTHORIZATION = "0x37A013d55393f0824eFD40C648111f39D18C5F46";
const REVERSE_RESOLVER = "0xD3909DC7461D06D0Eb57A3b23685cB6f11D474aD";
const REGISTRAR = "0x28fbEfF349909A99232b771aaE40541500cC7050";
const SUBDOMAIN_REGISTRAR = "0xCc3395928DFD31a27c764fc97356800eeD4C936a";

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
  await verify(
    SUBDOMAIN_REGISTRAR,
    [REGISTRY, PRICING_POLICY, OWNER],
    "contracts/XNSSubdomainRegistrar.sol:XNSSubdomainRegistrar",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
