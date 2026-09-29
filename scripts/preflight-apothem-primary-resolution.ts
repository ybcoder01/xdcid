import { ethers } from "hardhat";

const EXPECTED = {
  chainId: 51n,
  owner: "0x9c67d6cfE6A73497e7348b6b852495CA6236C29a",
  registry: "0x2BeD8EB404e1BD8D690e3dD2Fd06F287e5A92Eb1",
  legacyRegistry: "0xe7CfeC8729686CcB2FB25B8275D6bd6Bc68A4bf0",
  pricingPolicy: "0x90a719bCAD35EB1048b30e43CA3fC804A35e5c81",
  discountAuthorization: "0x37A013d55393f0824eFD40C648111f39D18C5F46",
  previousRegistrar: "0x506B82DaD0cf55d909D9C6F0edD5A7939339256d",
  registrar: "0xE35722cB7d04Ba36ed284910528A64B1dE855a20",
  reverseResolver: "0x1ff9B9c9463a2d85029bdD3AFC99a8cf51260Ee2",
  multichainResolver: "0x2212Fc40Feda6e8DD7030E9B70B38c7EB79f6989",
} as const;

const registryAbi = [
  "function owner() view returns (address)",
  "function registrar() view returns (address)",
] as const;

const ownableAbi = ["function owner() view returns (address)"] as const;

const registrarAbi = [
  "function owner() view returns (address)",
  "function registry() view returns (address)",
  "function legacyRegistry() view returns (address)",
  "function pricingPolicy() view returns (address)",
  "function discountAuthorization() view returns (address)",
  "function primaryNameResolver() view returns (address)",
] as const;

const reverseResolverAbi = [
  "function registry() view returns (address)",
] as const;

const multichainResolverAbi = [
  "function registry() view returns (address)",
  "function reverseResolver() view returns (address)",
] as const;

const authorizationAbi = [
  "function owner() view returns (address)",
  "function authorizationSigner() view returns (address)",
  "function consumer() view returns (address)",
  "function pendingAuthorizationSigner() view returns (address)",
  "function pendingConsumer() view returns (address)",
  "function pendingActivationTime() view returns (uint256)",
  "function hasPendingConfiguration() view returns (bool)",
] as const;

type Check = {
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
};

function sameAddress(actual: string, expected: string) {
  return ethers.getAddress(actual) === ethers.getAddress(expected);
}

function addressCheck(name: string, actual: string, expected: string): Check {
  return {
    name,
    expected: ethers.getAddress(expected),
    actual: ethers.getAddress(actual),
    passed: sameAddress(actual, expected),
  };
}

function valueCheck(name: string, actual: string, expected: string): Check {
  return { name, expected, actual, passed: actual === expected };
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== EXPECTED.chainId) {
    throw new Error(
      `Refusing to inspect chain ${network.chainId}; expected XDC Apothem (51)`,
    );
  }

  const addresses = [
    EXPECTED.registry,
    EXPECTED.legacyRegistry,
    EXPECTED.pricingPolicy,
    EXPECTED.discountAuthorization,
    EXPECTED.previousRegistrar,
    EXPECTED.registrar,
    EXPECTED.reverseResolver,
    EXPECTED.multichainResolver,
  ];
  const code = await Promise.all(
    addresses.map((address) => ethers.provider.getCode(address)),
  );
  const missingCode = addresses.filter((_, index) => code[index] === "0x");
  if (missingCode.length > 0) {
    throw new Error(`No contract code at: ${missingCode.join(", ")}`);
  }

  const registry = new ethers.Contract(
    EXPECTED.registry,
    registryAbi,
    ethers.provider,
  );
  const policy = new ethers.Contract(
    EXPECTED.pricingPolicy,
    ownableAbi,
    ethers.provider,
  );
  const authorization = new ethers.Contract(
    EXPECTED.discountAuthorization,
    authorizationAbi,
    ethers.provider,
  );
  const registrar = new ethers.Contract(
    EXPECTED.registrar,
    registrarAbi,
    ethers.provider,
  );
  const reverseResolver = new ethers.Contract(
    EXPECTED.reverseResolver,
    reverseResolverAbi,
    ethers.provider,
  );
  const multichainResolver = new ethers.Contract(
    EXPECTED.multichainResolver,
    multichainResolverAbi,
    ethers.provider,
  );

  const [
    block,
    registryOwner,
    activeRegistrar,
    policyOwner,
    authorizationOwner,
    authorizationSigner,
    consumer,
    pendingSigner,
    pendingConsumer,
    pendingActivationTime,
    hasPendingConfiguration,
    registrarOwner,
    registrarRegistry,
    registrarLegacyRegistry,
    registrarPolicy,
    registrarAuthorization,
    registrarReverseResolver,
    reverseRegistry,
    multichainRegistry,
    multichainReverseResolver,
  ] = await Promise.all([
    ethers.provider.getBlock("latest"),
    registry.owner(),
    registry.registrar(),
    policy.owner(),
    authorization.owner(),
    authorization.authorizationSigner(),
    authorization.consumer(),
    authorization.pendingAuthorizationSigner(),
    authorization.pendingConsumer(),
    authorization.pendingActivationTime(),
    authorization.hasPendingConfiguration(),
    registrar.owner(),
    registrar.registry(),
    registrar.legacyRegistry(),
    registrar.pricingPolicy(),
    registrar.discountAuthorization(),
    registrar.primaryNameResolver(),
    reverseResolver.registry(),
    multichainResolver.registry(),
    multichainResolver.reverseResolver(),
  ]);

  if (!block) throw new Error("Unable to read the latest Apothem block");

  const checks: Check[] = [
    addressCheck("Registry owner", registryOwner, EXPECTED.owner),
    addressCheck("Pricing Policy owner", policyOwner, EXPECTED.owner),
    addressCheck("Discount Authorization owner", authorizationOwner, EXPECTED.owner),
    addressCheck("Registrar owner", registrarOwner, EXPECTED.owner),
    addressCheck("Registrar Registry", registrarRegistry, EXPECTED.registry),
    addressCheck("Registrar legacy Registry", registrarLegacyRegistry, EXPECTED.legacyRegistry),
    addressCheck("Registrar Pricing Policy", registrarPolicy, EXPECTED.pricingPolicy),
    addressCheck(
      "Registrar Discount Authorization",
      registrarAuthorization,
      EXPECTED.discountAuthorization,
    ),
    addressCheck(
      "Registrar primary resolver",
      registrarReverseResolver,
      EXPECTED.reverseResolver,
    ),
    addressCheck("Reverse Resolver Registry", reverseRegistry, EXPECTED.registry),
    addressCheck("Multichain Resolver Registry", multichainRegistry, EXPECTED.registry),
    addressCheck(
      "Multichain Resolver reverse resolver",
      multichainReverseResolver,
      EXPECTED.reverseResolver,
    ),
  ];

  const normalizedActiveRegistrar = ethers.getAddress(activeRegistrar);
  const normalizedConsumer = ethers.getAddress(consumer);
  const normalizedPendingConsumer = ethers.getAddress(pendingConsumer);
  const normalizedSigner = ethers.getAddress(authorizationSigner);
  const normalizedPendingSigner = ethers.getAddress(pendingSigner);

  const preActivation =
    sameAddress(normalizedActiveRegistrar, EXPECTED.previousRegistrar) &&
    sameAddress(normalizedConsumer, EXPECTED.previousRegistrar) &&
    Boolean(hasPendingConfiguration);
  const discountActivated =
    sameAddress(normalizedActiveRegistrar, EXPECTED.previousRegistrar) &&
    sameAddress(normalizedConsumer, EXPECTED.registrar) &&
    !Boolean(hasPendingConfiguration);
  const fullyActivated =
    sameAddress(normalizedActiveRegistrar, EXPECTED.registrar) &&
    sameAddress(normalizedConsumer, EXPECTED.registrar) &&
    !Boolean(hasPendingConfiguration);

  let phase = "UNEXPECTED";
  if (preActivation) phase = "READY_FOR_DISCOUNT_ACTIVATION";
  if (discountActivated) phase = "READY_FOR_REGISTRY_ACTIVATION";
  if (fullyActivated) phase = "FULLY_ACTIVATED";

  checks.push(
    valueCheck(
      "Safe rollout phase",
      phase,
      "READY_FOR_DISCOUNT_ACTIVATION, READY_FOR_REGISTRY_ACTIVATION, or FULLY_ACTIVATED",
    ),
  );
  checks[checks.length - 1].passed = phase !== "UNEXPECTED";

  if (preActivation) {
    checks.push(
      addressCheck("Pending consumer", normalizedPendingConsumer, EXPECTED.registrar),
      addressCheck("Pending signer", normalizedPendingSigner, normalizedSigner),
    );
  }

  const activationTimestamp = Number(pendingActivationTime);
  const summary = {
    chainId: Number(network.chainId),
    blockNumber: block.number,
    blockTimestamp: block.timestamp,
    checkedAt: new Date(block.timestamp * 1_000).toISOString(),
    phase,
    activeRegistrar: normalizedActiveRegistrar,
    discountConsumer: normalizedConsumer,
    hasPendingConfiguration: Boolean(hasPendingConfiguration),
    pendingConsumer: normalizedPendingConsumer,
    pendingSigner: normalizedPendingSigner,
    activationTimestamp,
    activationTime:
      activationTimestamp > 0
        ? new Date(activationTimestamp * 1_000).toISOString()
        : null,
    delayElapsed:
      activationTimestamp > 0 && block.timestamp >= activationTimestamp,
    checks,
  };

  console.log(JSON.stringify(summary, null, 2));

  const failures = checks.filter((check) => !check.passed);
  if (failures.length > 0) {
    throw new Error(
      `Apothem primary-resolution preflight failed: ${failures
        .map((check) => check.name)
        .join(", ")}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
