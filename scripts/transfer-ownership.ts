import { ethers } from "hardhat";
import { xnsAddresses } from "../frontend/config/addresses";

const LEGACY_GAS_LIMIT = 100_000n;

async function main() {
  const newOwner = process.env.NEW_OWNER;
  if (!newOwner || !ethers.isAddress(newOwner)) {
    throw new Error("Set NEW_OWNER to the wallet or multisig address that should own XDCID.");
  }

  const targetOwner = ethers.getAddress(newOwner);
  const [signer] = await ethers.getSigners();
  const signerAddress = ethers.getAddress(await signer.getAddress());
  const feeData = await ethers.provider.getFeeData();

  if (feeData.gasPrice === null) {
    throw new Error("The XDC RPC did not return a legacy gas price.");
  }

  const registry = await ethers.getContractAt("XNSRegistry", xnsAddresses.registry);
  const registrar = await ethers.getContractAt("XNSRegistrar", xnsAddresses.registrar);
  const contracts = [
    ["registry", registry],
    ["registrar", registrar]
  ] as const;

  for (const [label, contract] of contracts) {
    const currentOwner = ethers.getAddress(await contract.owner());

    if (currentOwner === targetOwner) {
      console.log(`${label} already belongs to ${targetOwner}; skipping.`);
      continue;
    }

    if (currentOwner !== signerAddress) {
      throw new Error(
        `${label} owner is ${currentOwner}, but the configured signer is ${signerAddress}.`
      );
    }

    const transaction = await contract.transferOwnership(targetOwner, {
      type: 0,
      gasPrice: feeData.gasPrice,
      gasLimit: LEGACY_GAS_LIMIT
    });

    console.log(`${label} ownership transfer submitted: ${transaction.hash}`);

    const receipt = await transaction.wait();
    if (!receipt || receipt.status !== 1) {
      throw new Error(`${label} ownership transfer reverted: ${transaction.hash}`);
    }

    const confirmedOwner = ethers.getAddress(await contract.owner());
    if (confirmedOwner !== targetOwner) {
      throw new Error(
        `${label} ownership verification failed: expected ${targetOwner}, received ${confirmedOwner}.`
      );
    }

    console.log(
      `${label} ownership confirmed: ${confirmedOwner} (gas used: ${receipt.gasUsed})`
    );
  }

  console.log({
    registry: xnsAddresses.registry,
    registrar: xnsAddresses.registrar,
    newOwner: targetOwner
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
