import { ethers } from "hardhat";
import { XDC_MAINNET_DEPLOYMENT } from "../sdk/src/deployment/deployments";
import { ownershipTargets } from "./lib/ownership-targets";

const LEGACY_GAS_LIMIT = 100_000n;
const CONFIRMATION = "TRANSFER_XDC_MAINNET_OWNERSHIP";
const ownableAbi = [
  "function owner() view returns (address)",
  "function transferOwnership(address newOwner)",
] as const;

const governedContracts = ownershipTargets(XDC_MAINNET_DEPLOYMENT);

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== BigInt(XDC_MAINNET_DEPLOYMENT.chainId)) {
    throw new Error("Refusing to inspect or transfer ownership outside XDC mainnet");
  }

  const newOwner = process.env.NEW_OWNER;
  if (
    !newOwner ||
    !ethers.isAddress(newOwner) ||
    newOwner === ethers.ZeroAddress
  ) {
    throw new Error(
      "Set NEW_OWNER to the non-zero wallet or multisig address that should own XDCID.",
    );
  }

  const targetOwner = ethers.getAddress(newOwner);
  const [signer] = await ethers.getSigners();
  const signerAddress = signer
    ? ethers.getAddress(await signer.getAddress())
    : null;

  const contracts = await Promise.all(
    governedContracts.map(async ({ label, address }) => {
      if ((await ethers.provider.getCode(address)) === "0x") {
        throw new Error(`${label} has no deployed code at ${address}.`);
      }
      const contract = new ethers.Contract(
        address,
        ownableAbi,
        signer ?? ethers.provider,
      );
      const currentOwner = ethers.getAddress(await contract.owner());
      return {
        label,
        address,
        contract,
        currentOwner,
        requiresTransfer: currentOwner !== targetOwner,
      };
    }),
  );

  console.log(
    JSON.stringify(
      {
        action: "XDCID mainnet ownership migration",
        chainId: Number(network.chainId),
        signer: signerAddress,
        targetOwner,
        confirmationRequired: CONFIRMATION,
        contracts: contracts.map(
          ({ label, address, currentOwner, requiresTransfer }) => ({
            label,
            address,
            currentOwner,
            targetOwner,
            requiresTransfer,
          }),
        ),
      },
      null,
      2,
    ),
  );

  const pending = contracts.filter((entry) => entry.requiresTransfer);
  if (pending.length === 0) {
    console.log("Every governed contract already belongs to the target owner.");
    return;
  }

  if (process.env.CONFIRM_OWNERSHIP_TRANSFER !== CONFIRMATION) {
    console.log(
      `Preflight only. Set CONFIRM_OWNERSHIP_TRANSFER=${CONFIRMATION} to send ${pending.length} ownership transfer(s).`,
    );
    return;
  }

  if (!signerAddress) throw new Error("No ownership-transfer signer is configured.");
  const unauthorized = pending.filter(
    ({ currentOwner }) => currentOwner !== signerAddress,
  );
  if (unauthorized.length > 0) {
    throw new Error(
      `Configured signer ${signerAddress} does not own: ${unauthorized
        .map(({ label }) => label)
        .join(", ")}.`,
    );
  }

  const feeData = await ethers.provider.getFeeData();
  if (feeData.gasPrice === null) {
    throw new Error("The XDC RPC did not return a legacy gas price.");
  }

  for (const entry of pending) {
    const transaction = await entry.contract.transferOwnership(targetOwner, {
      type: 0,
      gasPrice: feeData.gasPrice,
      gasLimit: LEGACY_GAS_LIMIT,
    });
    console.log(`${entry.label} ownership transfer submitted: ${transaction.hash}`);

    const receipt = await transaction.wait();
    if (!receipt || receipt.status !== 1) {
      throw new Error(
        `${entry.label} ownership transfer reverted: ${transaction.hash}`,
      );
    }

    const confirmedOwner = ethers.getAddress(await entry.contract.owner());
    if (confirmedOwner !== targetOwner) {
      throw new Error(
        `${entry.label} ownership verification failed: expected ${targetOwner}, received ${confirmedOwner}.`,
      );
    }
    console.log(`${entry.label} ownership confirmed: ${confirmedOwner}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
