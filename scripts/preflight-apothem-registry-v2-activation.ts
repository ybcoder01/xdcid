import { ethers } from "hardhat";

const EXPECTED = {
  chainId: 51n,
  owner: "0x9c67d6cfE6A73497e7348b6b852495CA6236C29a",
  registry: "0xA601b5e9114c0DfeCea4E0ef99D6Fc020B330512",
  registrar: "0x28fbEfF349909A99232b771aaE40541500cC7050",
  forwardResolver: "0x5F20A2eb2E3c81b4ecc5d5bA3177225d7E3E1a94",
  reverseResolver: "0xD3909DC7461D06D0Eb57A3b23685cB6f11D474aD",
  multichainResolver: "0x05Efa9641b03eEe2a4624F2974e1E1192019d363",
  subdomainRegistrar: "0xCc3395928DFD31a27c764fc97356800eeD4C936a",
  previousRegistry: "0x2BeD8EB404e1BD8D690e3dD2Fd06F287e5A92Eb1",
  collisionRegistry: "0xe7CfeC8729686CcB2FB25B8275D6bd6Bc68A4bf0",
  pricingPolicy: "0x90a719bCAD35EB1048b30e43CA3fC804A35e5c81",
  discountAuthorization: "0x37A013d55393f0824eFD40C648111f39D18C5F46",
  previousRegistrar: "0xd51EdbE27BffA0993D9CFf672613a2d6eC0a5D7b",
  registryActivation: 1790591244n,
  discountActivation: 1790591254n,
} as const;

const registryAbi = [
  "function owner() view returns (address)",
  "function legacyRegistry() view returns (address)",
  "function registrar() view returns (address)",
  "function pendingRegistrar() view returns (address)",
  "function pendingRegistrarActivationTime() view returns (uint256)",
] as const;
const registrarAbi = [
  "function owner() view returns (address)",
  "function registry() view returns (address)",
  "function legacyRegistry() view returns (address)",
  "function pricingPolicy() view returns (address)",
  "function discountAuthorization() view returns (address)",
  "function primaryNameResolver() view returns (address)",
] as const;
const resolverAbi = ["function registry() view returns (address)"] as const;
const multichainAbi = [
  "function registry() view returns (address)",
  "function reverseResolver() view returns (address)",
] as const;
const subdomainAbi = [
  "function owner() view returns (address)",
  "function registry() view returns (address)",
  "function pricingPolicy() view returns (address)",
] as const;
const discountAbi = [
  "function owner() view returns (address)",
  "function authorizationSigner() view returns (address)",
  "function consumer() view returns (address)",
  "function pendingAuthorizationSigner() view returns (address)",
  "function pendingConsumer() view returns (address)",
  "function pendingActivationTime() view returns (uint256)",
  "function hasPendingConfiguration() view returns (bool)",
] as const;
const ownedAbi = ["function owner() view returns (address)"] as const;

function same(actual: string, expected: string) {
  return ethers.getAddress(actual) === ethers.getAddress(expected);
}

function assertAddress(label: string, actual: string, expected: string) {
  if (!same(actual, expected)) {
    throw new Error(`${label}: expected ${ethers.getAddress(expected)}, received ${ethers.getAddress(actual)}`);
  }
  console.log(`PASS ${label}: ${ethers.getAddress(actual)}`);
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== EXPECTED.chainId) throw new Error(`Refusing chain ${network.chainId}; expected Apothem (51)`);

  const deployed = [
    EXPECTED.registry, EXPECTED.registrar, EXPECTED.forwardResolver, EXPECTED.reverseResolver,
    EXPECTED.multichainResolver, EXPECTED.subdomainRegistrar, EXPECTED.previousRegistry,
    EXPECTED.collisionRegistry, EXPECTED.pricingPolicy, EXPECTED.discountAuthorization,
    EXPECTED.previousRegistrar,
  ];
  const code = await Promise.all(deployed.map((address) => ethers.provider.getCode(address)));
  const missing = deployed.filter((_, index) => code[index] === "0x");
  if (missing.length > 0) throw new Error(`Missing contract code: ${missing.join(", ")}`);
  console.log(`PASS deployed bytecode: ${deployed.length} reviewed contracts`);

  const registry = new ethers.Contract(EXPECTED.registry, registryAbi, ethers.provider);
  const registrar = new ethers.Contract(EXPECTED.registrar, registrarAbi, ethers.provider);
  const forward = new ethers.Contract(EXPECTED.forwardResolver, resolverAbi, ethers.provider);
  const reverse = new ethers.Contract(EXPECTED.reverseResolver, resolverAbi, ethers.provider);
  const multichain = new ethers.Contract(EXPECTED.multichainResolver, multichainAbi, ethers.provider);
  const subdomain = new ethers.Contract(EXPECTED.subdomainRegistrar, subdomainAbi, ethers.provider);
  const pricing = new ethers.Contract(EXPECTED.pricingPolicy, ownedAbi, ethers.provider);
  const discount = new ethers.Contract(EXPECTED.discountAuthorization, discountAbi, ethers.provider);

  const [
    registryOwner, registryLegacy, registryRegistrar, pendingRegistrar, pendingRegistrarTime,
    registrarOwner, registrarRegistry,
    registrarLegacy, registrarPolicy, registrarDiscount, registrarReverse, forwardRegistry,
    reverseRegistry, multichainRegistry, multichainReverse, subdomainOwner, subdomainRegistry,
    subdomainPolicy, pricingOwner, discountOwner, signer, consumer, pendingSigner,
    pendingConsumer, pendingTime, hasPending, block,
  ] = await Promise.all([
    registry.owner(), registry.legacyRegistry(), registry.registrar(), registry.pendingRegistrar(),
    registry.pendingRegistrarActivationTime(), registrar.owner(), registrar.registry(),
    registrar.legacyRegistry(), registrar.pricingPolicy(), registrar.discountAuthorization(), registrar.primaryNameResolver(),
    forward.registry(), reverse.registry(), multichain.registry(), multichain.reverseResolver(), subdomain.owner(),
    subdomain.registry(), subdomain.pricingPolicy(), pricing.owner(), discount.owner(), discount.authorizationSigner(),
    discount.consumer(), discount.pendingAuthorizationSigner(), discount.pendingConsumer(), discount.pendingActivationTime(),
    discount.hasPendingConfiguration(), ethers.provider.getBlock("latest"),
  ]);
  if (!block) throw new Error("Unable to read latest Apothem block");

  for (const [label, actual] of [
    ["Registry owner", registryOwner], ["Registrar owner", registrarOwner], ["Subdomain owner", subdomainOwner],
    ["Pricing owner", pricingOwner], ["Discount owner", discountOwner], ["Authorization signer", signer],
  ] as const) assertAddress(label, actual, EXPECTED.owner);

  for (const [label, actual, expected] of [
    ["Registry legacy source", registryLegacy, EXPECTED.previousRegistry],
    ["Registrar Registry", registrarRegistry, EXPECTED.registry], ["Registrar collision Registry", registrarLegacy, EXPECTED.collisionRegistry],
    ["Registrar Pricing Policy", registrarPolicy, EXPECTED.pricingPolicy], ["Registrar Discount Authorization", registrarDiscount, EXPECTED.discountAuthorization],
    ["Registrar primary resolver", registrarReverse, EXPECTED.reverseResolver], ["Forward resolver Registry", forwardRegistry, EXPECTED.registry],
    ["Reverse resolver Registry", reverseRegistry, EXPECTED.registry], ["Multichain resolver Registry", multichainRegistry, EXPECTED.registry],
    ["Multichain reverse resolver", multichainReverse, EXPECTED.reverseResolver], ["Subdomain Registry", subdomainRegistry, EXPECTED.registry],
    ["Subdomain Pricing Policy", subdomainPolicy, EXPECTED.pricingPolicy],
  ] as const) assertAddress(label, actual, expected);

  const zero = ethers.ZeroAddress;
  const registryActive = same(registryRegistrar, EXPECTED.registrar);
  const registryPending =
    same(registryRegistrar, EXPECTED.previousRegistrar) &&
    same(pendingRegistrar, EXPECTED.registrar) &&
    pendingRegistrarTime === EXPECTED.registryActivation;
  const registryCleared =
    registryActive && same(pendingRegistrar, zero) && pendingRegistrarTime === 0n;

  const discountActive = same(consumer, EXPECTED.registrar) && !hasPending;
  const discountPending =
    same(consumer, EXPECTED.previousRegistrar) && hasPending &&
    same(pendingConsumer, EXPECTED.registrar) && same(pendingSigner, EXPECTED.owner) &&
    pendingTime === EXPECTED.discountActivation;
  const discountCleared =
    discountActive && same(pendingConsumer, zero) && same(pendingSigner, zero) && pendingTime === 0n;

  if (!(registryPending || registryCleared) || !(discountPending || discountCleared)) {
    throw new Error("Registry or Discount Authorization state does not match the reviewed compatibility rollout");
  }

  const stage = registryActive && discountActive
    ? "ACTIVE"
    : block.timestamp >= EXPECTED.registryActivation && block.timestamp >= EXPECTED.discountActivation
      ? "READY"
      : "WAITING";

  console.log(`PASS activation stage: ${stage}`);
  console.log(`Latest block: ${block.number} (${block.timestamp})`);
  console.log(`Registry activation time: ${EXPECTED.registryActivation}`);
  console.log(`Discount activation time: ${EXPECTED.discountActivation}`);
  console.log(stage === "ACTIVE" ? "Post-activation preflight passed." : "Pre-activation preflight passed; no state was changed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
