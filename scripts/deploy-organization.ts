import { ethers } from "hardhat";

async function main() {
  const registryAddress = process.env.REGISTRY_ADDRESS;
  const initialOwner = process.env.NEW_OWNER;
  const annualFeeInput = process.env.ORGANIZATION_ANNUAL_FEE_XDC;

  if (!registryAddress || !ethers.isAddress(registryAddress)) {
    throw new Error("Set REGISTRY_ADDRESS to the existing XNSRegistry address");
  }

  if (!initialOwner || !ethers.isAddress(initialOwner)) {
    throw new Error("Set NEW_OWNER to the organization contract owner or multisig");
  }

  if (!annualFeeInput) {
    throw new Error("Set ORGANIZATION_ANNUAL_FEE_XDC to the reviewed annual workspace price");
  }

  const annualFee = ethers.parseEther(annualFeeInput);
  if (annualFee === 0n) {
    throw new Error("ORGANIZATION_ANNUAL_FEE_XDC must be greater than zero");
  }

  const Organization = await ethers.getContractFactory("XNSOrganization");
  const organization = await Organization.deploy(
    registryAddress,
    initialOwner,
    annualFee
  );
  await organization.waitForDeployment();

  console.log({
    registry: registryAddress,
    organization: await organization.getAddress(),
    owner: initialOwner,
    annualFeeXdc: annualFeeInput,
    nextStep: "Verify the source, then configure NEXT_PUBLIC_XNS_ORGANIZATION"
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
