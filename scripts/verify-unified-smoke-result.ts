import { ethers } from "hardhat";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

async function main() {
  const parentName = required("SMOKE_PARENT_NAME");
  const childName = `child.${parentName}`;
  const owner = ethers.getAddress(required("PROTOCOL_OWNER"));
  const registryAddress = ethers.getAddress(required("UNIFIED_REGISTRY_ADDRESS"));
  const resolverAddress = ethers.getAddress(required("UNIFIED_RESOLVER_ADDRESS"));
  const registrarAddress = ethers.getAddress(required("UNIFIED_REGISTRAR_ADDRESS"));
  const registry = await ethers.getContractAt("XNSRegistryV3", registryAddress);
  const resolver = await ethers.getContractAt("XNSUniversalResolver", resolverAddress);
  const registrar = await ethers.getContractAt("XNSUnifiedRegistrar", registrarAddress);
  const parentNode = ethers.keccak256(ethers.toUtf8Bytes(parentName));
  const childNode = ethers.keccak256(ethers.toUtf8Bytes(childName));

  const [
    parentRecord,
    childRecord,
    parentOwner,
    childOwner,
    parentGeneration,
    childGeneration,
    primary,
    reverse,
    forward,
    nonce,
  ] = await Promise.all([
    registry.records(parentNode),
    registry.records(childNode),
    registry.ownerOf(parentNode),
    registry.ownerOf(childNode),
    registry.ownershipGenerations(parentNode),
    registry.ownershipGenerations(childNode),
    resolver.primaryNames(owner),
    resolver.reverse(owner, 50),
    resolver.addressFor(childNode, 50),
    registrar.nonces(owner),
  ]);

  const checks: Array<[string, boolean, unknown]> = [
    ["Parent owner", ethers.getAddress(parentOwner) === owner, parentOwner],
    ["Child owner", ethers.getAddress(childOwner) === owner, childOwner],
    ["Parent kind", parentRecord.kind === 1n, parentRecord.kind],
    ["Child kind", childRecord.kind === 2n, childRecord.kind],
    ["Child parent", childRecord.parentNode === parentNode, childRecord.parentNode],
    ["Parent ownership generation", parentGeneration === 1n, parentGeneration],
    ["Child ownership generation", childGeneration === 1n, childGeneration],
    ["Child is selected Primary ID", primary === childName, primary],
    ["Reverse resolution", reverse === childName, reverse],
    ["Forward resolution", ethers.getAddress(forward) === owner, forward],
    ["Four signed quotes consumed", nonce === 4n, nonce],
    ["Child expires before parent", childRecord.expiry < parentRecord.expiry, `${childRecord.expiry}/${parentRecord.expiry}`],
  ];

  for (const [label, passed, actual] of checks) {
    console.log(`${passed ? "PASS" : "FAIL"} ${label}: ${String(actual)}`);
  }
  const failed = checks.filter(([, passed]) => !passed);
  if (failed.length > 0) throw new Error(`${failed.length} smoke-result check(s) failed`);
  console.log(`Wallet-signed smoke result verified for ${parentName} and ${childName}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
