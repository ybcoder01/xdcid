import { ethers } from "hardhat";

function requiredAddress(name: string): string {
  const value = process.env[name];
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`Set ${name} to a valid address`);
  }
  return ethers.getAddress(value);
}

async function expectRevert(label: string, action: () => Promise<unknown>) {
  try {
    await action();
  } catch {
    console.log(`PASS ${label}`);
    return;
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

function check(label: string, passed: boolean, actual: unknown) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}: ${String(actual)}`);
  if (!passed) throw new Error(`${label} failed`);
}

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  check("Apothem chain", chainId === 51n, chainId);

  const registryAddress = requiredAddress("UNIFIED_REGISTRY_ADDRESS");
  const resolverAddress = requiredAddress("UNIFIED_RESOLVER_ADDRESS");
  const registrarAddress = requiredAddress("UNIFIED_REGISTRAR_ADDRESS");
  const policyAddress = requiredAddress("PRICING_POLICY_ADDRESS");
  const protocolOwner = requiredAddress("PROTOCOL_OWNER");

  const registry = await ethers.getContractAt("XNSRegistryV3", registryAddress);
  const resolver = await ethers.getContractAt(
    "XNSUniversalResolver",
    resolverAddress,
  );
  const registrar = await ethers.getContractAt(
    "XNSUnifiedRegistrar",
    registrarAddress,
  );
  const policy = await ethers.getContractAt("XNSPricingPolicyV2", policyAddress);

  const label = `smoke-${Date.now().toString(36)}`;
  const rawName = `${label.toUpperCase()}.XDC`;
  const canonicalName = `${label}.xdc`;
  const node = ethers.keccak256(ethers.toUtf8Bytes(canonicalName));
  const childName = `child.${canonicalName}`;
  const childNode = ethers.keccak256(ethers.toUtf8Bytes(childName));

  check(
    "Top-level canonicalization",
    (await registrar.canonicalizeTopLevel(rawName)) === canonicalName,
    canonicalName,
  );
  check("Top-level node derivation", (await registrar.nodeFor(rawName)) === node, node);
  check(
    "Subdomain node derivation",
    (await registrar.subdomainNodeFor(rawName, "CHILD")) === childNode,
    childNode,
  );
  check("Fresh top-level availability", await registrar.available(rawName), rawName);
  check("Fresh owner is empty", (await registry.ownerOf(node)) === ethers.ZeroAddress, node);
  check(
    "Fresh forward resolution is empty",
    (await resolver.addressFor(node, 50)) === ethers.ZeroAddress,
    node,
  );

  const policyVersion = await policy.version();
  const registrationUsdMicros = await registrar.priceUsdMicrosForVersion(
    0,
    label.length,
    1,
    policyVersion,
  );
  const subdomainUsdMicros = await registrar.priceUsdMicrosForVersion(
    2,
    5,
    1,
    policyVersion,
  );
  check("Registration quote is nonzero", registrationUsdMicros > 0n, registrationUsdMicros);
  check("Subdomain quote is nonzero", subdomainUsdMicros > 0n, subdomainUsdMicros);

  const latest = await ethers.provider.getBlock("latest");
  if (!latest) throw new Error("Latest block unavailable");
  const nonce = await registrar.nonces(protocolOwner);
  const quote = {
    node,
    parentNode: ethers.ZeroHash,
    payer: protocolOwner,
    nameOwner: protocolOwner,
    product: 0,
    termYears: 1,
    paymentToken: ethers.ZeroAddress,
    paymentAmount: 1,
    usdMicros: registrationUsdMicros,
    policyVersion,
    nonce,
    issuedAt: latest.timestamp,
    deadline: latest.timestamp + 600,
  };
  check(
    "Quote digest is available",
    (await registrar.quoteDigest(quote)) !== ethers.ZeroHash,
    await registrar.quoteDigest(quote),
  );

  await expectRevert("Unsigned registration is rejected", async () => {
    const data = registrar.interface.encodeFunctionData("register", [
      rawName,
      quote,
      "0x",
    ]);
    await ethers.provider.call({
      to: registrarAddress,
      from: protocolOwner,
      data,
      value: 1n,
    });
  });
  await expectRevert("Direct Registry write is rejected", async () => {
    const data = registry.interface.encodeFunctionData("registerTopLevel", [
      node,
      protocolOwner,
      latest.timestamp + 365 * 24 * 60 * 60,
    ]);
    await ethers.provider.call({
      to: registryAddress,
      from: protocolOwner,
      data,
    });
  });
  await expectRevert("Legacy migration is disabled", async () => {
    const data = registrar.interface.encodeFunctionData("migrateSubdomain", [
      childNode,
    ]);
    await ethers.provider.call({
      to: registrarAddress,
      from: protocolOwner,
      data,
    });
  });

  check("Smoke test did not mutate availability", await registrar.available(rawName), rawName);
  console.log(
    "Unified protocol non-mutating Apothem smoke test passed. Wallet-signed write smoke remains a separate cutover gate.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
