import { ethers } from "hardhat";

const XDC_MAINNET_CHAIN_ID = 50n;

function requiredAddress(name: string): string {
  const value = process.env[name];
  if (!value || !ethers.isAddress(value)) {
    throw new Error("Set " + name + " to a valid address");
  }
  return ethers.getAddress(value);
}

function requiredPositiveInteger(name: string, fallback?: number): number {
  const raw = process.env[name];
  const value = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) {
    throw new Error("Set " + name + " to a positive integer");
  }
  return value as number;
}

async function requireContract(name: string): Promise<string> {
  const address = requiredAddress(name);
  if ((await ethers.provider.getCode(address)) === "0x") {
    throw new Error(name + " does not contain contract code");
  }
  return address;
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== XDC_MAINNET_CHAIN_ID) {
    throw new Error("Refusing to deploy outside XDC mainnet (chain ID 50)");
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployment signer is configured");

  const registry = await requireContract("REGISTRY_ADDRESS");
  const legacyRegistry = await requireContract("LEGACY_REGISTRY_ADDRESS");
  const policyOwner = requiredAddress("POLICY_OWNER");
  const quoteSigner = requiredAddress("QUOTE_SIGNER");
  const usdcToken = await requireContract("USDC_ADDRESS");
  const treasury = requiredAddress("TREASURY_ADDRESS");

  const config = {
    threeCharacterAnnualUsdMicros: requiredPositiveInteger(
      "THREE_CHARACTER_ANNUAL_USD_MICROS",
      20_000_000,
    ),
    fourCharacterAnnualUsdMicros: requiredPositiveInteger(
      "FOUR_CHARACTER_ANNUAL_USD_MICROS",
      10_000_000,
    ),
    standardAnnualUsdMicros: requiredPositiveInteger(
      "STANDARD_ANNUAL_USD_MICROS",
      5_000_000,
    ),
    subdomainAnnualUsdMicros: requiredPositiveInteger(
      "SUBDOMAIN_ANNUAL_USD_MICROS",
      1_000_000,
    ),
    migrationUsdMicros: requiredPositiveInteger(
      "MIGRATION_USD_MICROS",
      3_000_000,
    ),
    threeYearDiscountBps: requiredPositiveInteger(
      "THREE_YEAR_DISCOUNT_BPS",
      1_000,
    ),
    fiveYearDiscountBps: requiredPositiveInteger(
      "FIVE_YEAR_DISCOUNT_BPS",
      1_500,
    ),
    tenYearDiscountBps: requiredPositiveInteger(
      "TEN_YEAR_DISCOUNT_BPS",
      2_000,
    ),
    xdcQuoteBufferBps: requiredPositiveInteger("XDC_QUOTE_BUFFER_BPS", 200),
    quoteSigner,
    usdcToken,
    treasury,
    xdcPaymentsEnabled: true,
    usdcPaymentsEnabled: true,
  };

  console.log({
    action: "deploy XDCID mainnet pricing stack",
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    registry,
    legacyRegistry,
    policyOwner,
    quoteSigner,
    usdcToken,
    treasury,
    pricesUsdMicros: {
      threeCharacter: config.threeCharacterAnnualUsdMicros,
      fourCharacter: config.fourCharacterAnnualUsdMicros,
      standard: config.standardAnnualUsdMicros,
      subdomain: config.subdomainAnnualUsdMicros,
      migration: config.migrationUsdMicros,
    },
  });

  const Policy = await ethers.getContractFactory("XNSPricingPolicy");
  const policy = await Policy.deploy(config, policyOwner);
  await policy.waitForDeployment();

  const Registrar = await ethers.getContractFactory("XNSSignedQuoteRegistrar");
  const registrar = await Registrar.deploy(
    registry,
    legacyRegistry,
    await policy.getAddress(),
  );
  await registrar.waitForDeployment();

  const result = {
    pricingPolicy: await policy.getAddress(),
    registrar: await registrar.getAddress(),
    registry,
    legacyRegistry,
    policyOwner: await policy.owner(),
    policyVersion: (await policy.version()).toString(),
    activationRequired: true,
  };
  console.log(result);
  console.log(
    "Do not activate. Verify both contracts, run the preflight, and obtain explicit approval first.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
