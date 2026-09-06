import { ethers, run } from "hardhat";

function address(name: string): string {
  const value = process.env[name];
  if (!value || !ethers.isAddress(value)) throw new Error(`Set ${name} to a valid address`);
  return ethers.getAddress(value);
}

function integer(name: string, fallback: number): number {
  const value = process.env[name] ? Number(process.env[name]) : fallback;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Set ${name} to a positive integer`);
  }
  return value;
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 50n) throw new Error("Refusing to verify outside XDC mainnet");

  const pricingPolicy = address("PRICING_POLICY_V2_ADDRESS");
  const discountAuthorization = address("DISCOUNT_AUTHORIZATION_ADDRESS");
  const registrar = address("REGISTRAR_V2_ADDRESS");
  const subdomainRegistrar = address("SUBDOMAIN_REGISTRAR_ADDRESS");
  const registry = address("REGISTRY_ADDRESS");
  const legacyRegistry = address("LEGACY_REGISTRY_ADDRESS");
  const owner = address("POLICY_OWNER");
  const quoteSigner = address("QUOTE_SIGNER");
  const discountSigner = address("DISCOUNT_SIGNER");
  const usdcToken = address("USDC_ADDRESS");
  const treasury = address("TREASURY_ADDRESS");
  const config = {
    twoCharacterAnnualUsdMicros: integer("TWO_CHARACTER_ANNUAL_USD_MICROS", 50_000_000),
    threeCharacterAnnualUsdMicros: integer("THREE_CHARACTER_ANNUAL_USD_MICROS", 20_000_000),
    fourCharacterAnnualUsdMicros: integer("FOUR_CHARACTER_ANNUAL_USD_MICROS", 10_000_000),
    standardAnnualUsdMicros: integer("STANDARD_ANNUAL_USD_MICROS", 5_000_000),
    subdomainAnnualUsdMicros: integer("SUBDOMAIN_ANNUAL_USD_MICROS", 1_000_000),
    premiumSubdomainAnnualUsdMicros: integer("PREMIUM_SUBDOMAIN_ANNUAL_USD_MICROS", 5_000_000),
    migrationUsdMicros: integer("MIGRATION_USD_MICROS", 3_000_000),
    threeYearDiscountBps: integer("THREE_YEAR_DISCOUNT_BPS", 1_000),
    fiveYearDiscountBps: integer("FIVE_YEAR_DISCOUNT_BPS", 1_500),
    tenYearDiscountBps: integer("TEN_YEAR_DISCOUNT_BPS", 2_000),
    xdcQuoteBufferBps: integer("XDC_QUOTE_BUFFER_BPS", 200),
    quoteSigner,
    usdcToken,
    treasury,
    xdcPaymentsEnabled: true,
    usdcPaymentsEnabled: true,
  };

  await run("verify:verify", {
    address: pricingPolicy,
    constructorArguments: [config, owner],
    contract: "contracts/XNSPricingPolicyV2.sol:XNSPricingPolicyV2",
  });
  await run("verify:verify", {
    address: discountAuthorization,
    constructorArguments: [owner, discountSigner, owner],
    contract: "contracts/XNSDiscountAuthorization.sol:XNSDiscountAuthorization",
  });
  await run("verify:verify", {
    address: registrar,
    constructorArguments: [
      registry,
      legacyRegistry,
      pricingPolicy,
      discountAuthorization,
      owner,
    ],
    contract: "contracts/XNSRegistrarV2.sol:XNSRegistrarV2",
  });
  await run("verify:verify", {
    address: subdomainRegistrar,
    constructorArguments: [registry, pricingPolicy, owner],
    contract: "contracts/XNSSubdomainRegistrar.sol:XNSSubdomainRegistrar",
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
