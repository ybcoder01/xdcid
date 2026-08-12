import { ethers } from "hardhat";

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 50n) {
    throw new Error("Refusing to roll back outside XDC mainnet");
  }

  const registryAddress = process.env.REGISTRY_ADDRESS;
  const activeRegistrar = process.env.EXPECTED_ACTIVE_REGISTRAR;
  const rollbackRegistrar = process.env.ROLLBACK_REGISTRAR;
  for (const [name, value] of Object.entries({
    REGISTRY_ADDRESS: registryAddress,
    EXPECTED_ACTIVE_REGISTRAR: activeRegistrar,
    ROLLBACK_REGISTRAR: rollbackRegistrar,
  })) {
    if (!value || !ethers.isAddress(value)) {
      throw new Error("Set " + name + " to a valid address");
    }
    if ((await ethers.provider.getCode(value)) === "0x") {
      throw new Error(name + " does not contain contract code");
    }
  }

  const [signer] = await ethers.getSigners();
  const registry = await ethers.getContractAt("XNSRegistry", registryAddress!);
  if (ethers.getAddress(await registry.owner()) !== ethers.getAddress(signer.address)) {
    throw new Error("The connected signer is not the registry owner");
  }
  if (
    ethers.getAddress(await registry.registrar()) !==
    ethers.getAddress(activeRegistrar!)
  ) {
    throw new Error("The active registrar does not match EXPECTED_ACTIVE_REGISTRAR");
  }

  console.log({
    registry: registryAddress,
    activeRegistrar,
    rollbackRegistrar,
  });
  if (process.env.CONFIRM_REGISTRAR_ROLLBACK !== "ROLLBACK_XDC_MAINNET") {
    console.log(
      "Preflight only. Set CONFIRM_REGISTRAR_ROLLBACK=ROLLBACK_XDC_MAINNET to send the rollback transaction.",
    );
    return;
  }

  const transaction = await registry.setRegistrar(rollbackRegistrar!);
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) throw new Error("Rollback failed");
  console.log({ transactionHash: transaction.hash, registrar: await registry.registrar() });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
