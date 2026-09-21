import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const Registry = await ethers.getContractFactory("XNSRegistry");
  const registry = await Registry.deploy(deployer.address);
  await registry.waitForDeployment();

  const Registrar = await ethers.getContractFactory("XNSRegistrar");
  const registrar = await Registrar.deploy(await registry.getAddress(), deployer.address);
  await registrar.waitForDeployment();

  const Resolver = await ethers.getContractFactory("XNSResolver");
  const resolver = await Resolver.deploy(await registry.getAddress());
  await resolver.waitForDeployment();

  const Reverse = await ethers.getContractFactory("XNSReverseResolver");
  const reverse = await Reverse.deploy(await registry.getAddress());
  await reverse.waitForDeployment();

  await (await registry.setRegistrar(await registrar.getAddress())).wait();

  const addresses = {
    registry: await registry.getAddress(),
    registrar: await registrar.getAddress(),
    resolver: await resolver.getAddress(),
    reverseResolver: await reverse.getAddress()
  };

  console.log(addresses);
  console.log(
    "Deployment complete. Record verified production addresses in " +
      "sdk/src/deployment/deployments.ts through a reviewed pull request; this script " +
      "does not rewrite application defaults.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
