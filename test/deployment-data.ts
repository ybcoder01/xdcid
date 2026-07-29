import { ethers } from "hardhat";

const REGISTRY = "0x05fa64a05bc205DeDF47e023d2D90c2d119cd097";

describe("Multichain deployment data", function () {
  it("prints the unsigned constructor transaction", async function () {
    const Resolver = await ethers.getContractFactory("XNSMultichainResolver");
    const transaction = await Resolver.getDeployTransaction(REGISTRY);
    console.log("MULTICHAIN_DEPLOYMENT_DATA=" + transaction.data);
  });
});
