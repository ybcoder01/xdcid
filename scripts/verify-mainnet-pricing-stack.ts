import { ethers, run } from "hardhat";

function address(name: string): string {
  const value = process.env[name];
  if (!value || !ethers.isAddress(value)) {
    throw new Error("Set " + name + " to a valid address");
  }
  return ethers.getAddress(value);
}

function integer(name: string, fallback: number): number {
  const value = process.env[name] ? Number(process.env[name]) : fallback;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Set " + name + " to a positive integer");
  }
  return value;
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 50n) {
    throw new Error("Refusing to verify outside XDC mainnet");
  }

  const pricingPolicy = address("PRICING_POLICY_ADDRESS");
  const registrar = address("NEW_SIGNED_REGISTRAR");
  const registry = address("REGISTRY_ADDRESS");
  const legacyRegistry = address("LEGACY_REGISTRY_ADDRESS");
  const policyOwner = address("POLICY_OWNER");
  const config = {
    threeCharacterAnnualUsdMicros: integer("THREE_CHARACTER_ANNUAL_USD_MICROS", 20_000_000),
    fourCharacterAnnualUsdMicros: integer("FOUR_CHARACTER_ANNUAL_USD_MICROS", 10_000_000),
    standardAnnualUsdMicros: integer("STANDARD_ANNUAL_USD_MICROS", 5_000_000),
    subdomainAnnualUsdMicros: integer("SUBDOMAIN_ANNUAL_USD_MICROS", 1_000_000),
    migrationUsdMicros: integer("MIGRATION_USD_MICROS", 3_000_000),
    threeYearDiscountBps: integer("THREE_YEAR_DISCOUNT_BPS", 1_000),
    fiveYearDiscountBps: integer("FIVE_YEAR_DISCOUNT_BPS", 1_500),
    tenYearDiscountBps: integer("TEN_YEAR_DISCOUNT_BPS", 2_000),
    xdcQuoteBufferBps: integer("XDC_QUOTE_BUFFER_BPS", 200),
    quoteSigner: address("QUOTE_SIGNER"),
    usdcToken: address("USDC_ADDRESS"),
    treasury: address("TREASURY_ADDRESS"),
    xdcPaymentsEnabled: true,
    usdcPaymentsEnabled: true,
  };

  await run("verify:verify", {
    address: pricingPolicy,
    constructorArguments: [config, policyOwner],
    contract: "contracts/XNSPricingPolicy.sol:XNSPricingPolicy",
  });
  await run("verify:verify", {
    address: registrar,
    constructorArguments: [registry, legacyRegistry, pricingPolicy],
    contract:
      "contracts/XNSSignedQuoteRegistrar.sol:XNSSignedQuoteRegistrar",
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
