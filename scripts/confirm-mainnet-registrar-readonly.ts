import { ethers } from "hardhat";

const REGISTRY = "0x05fa64a05bc205DeDF47e023d2D90c2d119cd097";
const EXPECTED = "0xa1584cb17523CEb991155328EdFAD2293b66bd94";

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 50n) throw new Error("Wrong chain");
  const registry = await ethers.getContractAt("XNSRegistry", REGISTRY);
  const active = ethers.getAddress(await registry.registrar());
  if (active !== ethers.getAddress(EXPECTED)) {
    throw new Error(`Active registrar mismatch: ${active}`);
  }
  console.log(JSON.stringify({ status: "PASS", chainId: "50", registry: REGISTRY, activeRegistrar: active }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
