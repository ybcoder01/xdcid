import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  const network = await ethers.provider.getNetwork();

  console.log({
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    balance: ethers.formatEther(balance)
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
