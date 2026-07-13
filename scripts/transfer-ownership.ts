import { ethers } from "hardhat";
import { xnsAddresses } from "../frontend/config/addresses";

async function main() {
  const newOwner = process.env.NEW_OWNER;
  if (!newOwner || !ethers.isAddress(newOwner)) {
    throw new Error("Set NEW_OWNER to the wallet or multisig address that should own XDCID.");
  }

  const registry = await ethers.getContractAt("XNSRegistry", xnsAddresses.registry);
  const registrar = await ethers.getContractAt("XNSRegistrar", xnsAddresses.registrar);

  await (await registry.transferOwnership(newOwner)).wait();
  await (await registrar.transferOwnership(newOwner)).wait();

  console.log({
    registry: xnsAddresses.registry,
    registrar: xnsAddresses.registrar,
    newOwner
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
