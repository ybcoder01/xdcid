import { ethers, run } from "hardhat";

const OWNER = "0x9c67d6cfE6A73497e7348b6b852495CA6236C29a";
const REGISTRY = "0x2BeD8EB404e1BD8D690e3dD2Fd06F287e5A92Eb1";
const PRICING_POLICY = "0x90a719bCAD35EB1048b30e43CA3fC804A35e5c81";

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 51n) {
    throw new Error("Refusing to verify outside XDC Apothem");
  }

  const address = process.env.SUBDOMAIN_REGISTRAR_ADDRESS;
  if (!address || !ethers.isAddress(address)) {
    throw new Error("Set SUBDOMAIN_REGISTRAR_ADDRESS to a valid address");
  }

  await run("verify:verify", {
    address: ethers.getAddress(address),
    constructorArguments: [REGISTRY, PRICING_POLICY, OWNER],
    contract:
      "contracts/XNSSubdomainRegistrar.sol:XNSSubdomainRegistrar",
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
