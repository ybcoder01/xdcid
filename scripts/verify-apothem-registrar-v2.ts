import { ethers, run } from "hardhat";

const OWNER = "0x9c67d6cfE6A73497e7348b6b852495CA6236C29a";
const REGISTRY = "0x2BeD8EB404e1BD8D690e3dD2Fd06F287e5A92Eb1";
const LEGACY_REGISTRY = "0xe7CfeC8729686CcB2FB25B8275D6bd6Bc68A4bf0";
const USDC = "0xb5AB69F7bBada22B28e79C8FFAECe55eF1c771D4";

function requiredAddress(name: string): string {
  const value = process.env[name];
  if (!value || !ethers.isAddress(value)) {
    throw new Error("Set " + name + " to a valid address");
  }
  return ethers.getAddress(value);
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 51n) {
    throw new Error("Refusing to verify outside XDC Apothem");
  }

  const pricingPolicy = requiredAddress("PRICING_POLICY_V2_ADDRESS");
  const discountAuthorization = requiredAddress(
    "DISCOUNT_AUTHORIZATION_ADDRESS",
  );
  const registrar = requiredAddress("REGISTRAR_V2_ADDRESS");

  const config = {
    twoCharacterAnnualUsdMicros: 50_000_000,
    threeCharacterAnnualUsdMicros: 20_000_000,
    fourCharacterAnnualUsdMicros: 10_000_000,
    standardAnnualUsdMicros: 5_000_000,
    subdomainAnnualUsdMicros: 1_000_000,
    premiumSubdomainAnnualUsdMicros: 5_000_000,
    migrationUsdMicros: 3_000_000,
    threeYearDiscountBps: 1_000,
    fiveYearDiscountBps: 1_500,
    tenYearDiscountBps: 2_000,
    xdcQuoteBufferBps: 200,
    quoteSigner: OWNER,
    usdcToken: USDC,
    treasury: OWNER,
    xdcPaymentsEnabled: true,
    usdcPaymentsEnabled: true,
  };

  await run("verify:verify", {
    address: pricingPolicy,
    constructorArguments: [config, OWNER],
    contract: "contracts/XNSPricingPolicyV2.sol:XNSPricingPolicyV2",
  });
  await run("verify:verify", {
    address: discountAuthorization,
    constructorArguments: [OWNER, OWNER, OWNER],
    contract:
      "contracts/XNSDiscountAuthorization.sol:XNSDiscountAuthorization",
  });
  await run("verify:verify", {
    address: registrar,
    constructorArguments: [
      REGISTRY,
      LEGACY_REGISTRY,
      pricingPolicy,
      discountAuthorization,
      OWNER,
    ],
    contract: "contracts/XNSRegistrarV2.sol:XNSRegistrarV2",
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
