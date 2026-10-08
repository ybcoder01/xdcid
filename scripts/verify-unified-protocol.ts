import { artifacts, ethers, run } from "hardhat";

const SOURCIFY_API = "https://sourcify.dev/server";
const SOURCIFY_HEADERS = {
  "content-type": "application/json",
  "user-agent": "XDCID-deployment-verifier/1.0 (+https://xdcid.xyz)",
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

async function verify(
  address: string,
  constructorArguments: unknown[],
  contract: string,
) {
  if (process.env.XDCSCAN_API_KEY || process.env.ETHERSCAN_API_KEY) {
    await run("verify:verify", { address, constructorArguments, contract });
    return;
  }

  console.log(
    `No XDCScan API key configured; publishing ${contract} to Sourcify instead.`,
  );
  await verifyWithSourcifyV2(address, contract);
}

async function verifiedOnSourcify(
  chainId: bigint,
  address: string,
): Promise<boolean> {
  const response = await fetch(
    `${SOURCIFY_API}/v2/contract/${chainId}/${address}`,
    { headers: SOURCIFY_HEADERS },
  );
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(
      `Sourcify lookup failed (${response.status}): ${await response.text()}`,
    );
  }
  const result = (await response.json()) as { runtimeMatch?: string | null };
  return result.runtimeMatch === "match" || result.runtimeMatch === "exact_match";
}

async function verifyWithSourcifyV2(address: string, contract: string) {
  const { chainId } = await ethers.provider.getNetwork();
  if (await verifiedOnSourcify(chainId, address)) {
    console.log(`Already verified on Sourcify: ${address}`);
    return;
  }

  const buildInfo = await artifacts.getBuildInfo(contract);
  if (!buildInfo) throw new Error(`No build information found for ${contract}`);
  const response = await fetch(
    `${SOURCIFY_API}/v2/verify/${chainId}/${address}`,
    {
      method: "POST",
      headers: SOURCIFY_HEADERS,
      body: JSON.stringify({
        stdJsonInput: buildInfo.input,
        compilerVersion: buildInfo.solcLongVersion,
        contractIdentifier: contract,
      }),
    },
  );
  if (response.status !== 202 && response.status !== 409) {
    throw new Error(
      `Sourcify verification submission failed (${response.status}): ${await response.text()}`,
    );
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await verifiedOnSourcify(chainId, address)) {
      console.log(
        `Successfully verified ${contract} on Sourcify: ` +
          `https://repo.sourcify.dev/${chainId}/${address}`,
      );
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Sourcify verification did not complete for ${address}`);
}

async function main() {
  const registry = required("UNIFIED_REGISTRY_ADDRESS");
  const resolver = required("UNIFIED_RESOLVER_ADDRESS");
  const registrar = required("UNIFIED_REGISTRAR_ADDRESS");
  const legacyRegistry = required("LEGACY_REGISTRY_ADDRESS");
  const legacySubdomains = required("LEGACY_SUBDOMAIN_REGISTRAR_ADDRESS");
  const pricingPolicy = required("PRICING_POLICY_ADDRESS");
  const protocolOwner = required("PROTOCOL_OWNER");
  const authorizationSigner = required("AUTHORIZATION_SIGNER");
  const usdcToken = required("USDC_TOKEN_ADDRESS");
  const treasury = required("TREASURY_ADDRESS");

  const pricingConfig = {
    twoCharacterAnnualUsdMicros: 50_000_000n,
    threeCharacterAnnualUsdMicros: 20_000_000n,
    fourCharacterAnnualUsdMicros: 10_000_000n,
    standardAnnualUsdMicros: 5_000_000n,
    subdomainAnnualUsdMicros: 1_000_000n,
    premiumSubdomainAnnualUsdMicros: 5_000_000n,
    migrationUsdMicros: 3_000_000n,
    threeYearDiscountBps: 1_000,
    fiveYearDiscountBps: 1_500,
    tenYearDiscountBps: 2_000,
    xdcQuoteBufferBps: 200,
    quoteSigner: authorizationSigner,
    usdcToken,
    treasury,
    xdcPaymentsEnabled: true,
    usdcPaymentsEnabled: true,
  };

  await verify(
    pricingPolicy,
    [pricingConfig, protocolOwner],
    "contracts/XNSPricingPolicyV2.sol:XNSPricingPolicyV2",
  );
  await verify(
    registry,
    [protocolOwner, legacyRegistry],
    "contracts/XNSRegistryV3.sol:XNSRegistryV3",
  );
  await verify(
    resolver,
    [registry],
    "contracts/XNSUniversalResolver.sol:XNSUniversalResolver",
  );
  await verify(registrar, [
    registry,
    resolver,
    legacySubdomains,
    pricingPolicy,
    authorizationSigner,
    protocolOwner,
  ], "contracts/XNSUnifiedRegistrar.sol:XNSUnifiedRegistrar");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
