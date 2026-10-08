import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("owned-name discovery follows the active registry and preserves registrar history", async () => {
  const contents = await source("frontend/lib/ownedNames.ts");

  assert.match(contents, /activeRegistryAddress/);
  assert.doesNotMatch(
    contents,
    /const APOTHEM_REGISTRY\s*=/,
    "the Dashboard must not pin ownership reads to a retired registry",
  );
  assert.match(contents, /0x506B82DaD0cf55d909D9C6F0edD5A7939339256d/);
  assert.match(contents, /0xE35722cB7d04Ba36ed284910528A64B1dE855a20/);
  assert.match(contents, /apothemRegistration\.registrar/);
});

test("admin health exposes only the quote signer's public address", async () => {
  const route = await source("frontend/app/api/admin/health/route.ts");
  const operations = await source("frontend/components/AdminOperations.tsx");

  assert.match(route, /privateKeyToAccount/);
  assert.match(route, /quoteSigner:\s*\{/);
  assert.match(route, /address: quoteSignerAddress/);
  assert.doesNotMatch(route, /address:\s*normalizedQuoteSignerKey/);
  assert.match(operations, /Server signing account \(public address only\)/);
});

test("registrar quote health reports signer authorization without exposing secrets", async () => {
  const route = await source("frontend/app/api/v1/registrar/quote/route.ts");

  assert.match(route, /export async function GET\(\)/);
  assert.match(route, /configuredSigner: account\.address/);
  assert.match(route, /activeSigner: getAddress\(config\.quoteSigner\)/);
  assert.match(route, /ready: authorized/);
  assert.doesNotMatch(route, /configuredSigner:.*PRIVATE_KEY/);
});

test("the Apothem subdomain test surface follows the configured registrar", async () => {
  const contents = await source(
    "frontend/app/testing/apothem-subdomains/ApothemSubdomainTestingClient.tsx",
  );

  assert.match(contents, /activeSubdomainRegistrarAddress/);
  assert.doesNotMatch(contents, /0xa2135729ce122ef93158FCc4C69683155e6707d3/i);
});

test("retired Apothem deployment consoles lead to the guarded activation page", async () => {
  const retiredPages = [
    "apothem-multichain-resolver",
    "apothem-primary-resolution-activation",
    "apothem-primary-resolution",
    "apothem-registrar-v2",
    "apothem-registrar-v2-activation",
    "apothem-registry-v2",
    "apothem-resolver-v2",
    "apothem-subdomain",
  ];

  for (const route of retiredPages) {
    const contents = await source(`frontend/app/deployment/${route}/page.tsx`);
    assert.match(
      contents,
      /redirect\("\/deployment\/apothem-registry-v2-activation"\)/,
      `${route} must not expose a repeat deployment action`,
    );
  }

  const previousActivation = await source(
    "frontend/app/deployment/apothem-registry-v2-activation/page.tsx",
  );
  assert.match(
    previousActivation,
    /redirect\("\/deployment\/apothem-pricing-compatibility"\)/,
  );
});

test("the unified Apothem deployment console is preview-gated and never activates the app", async () => {
  const page = await source("frontend/app/deployment/apothem-unified-v3/page.tsx");
  const client = await source(
    "frontend/app/deployment/apothem-unified-v3/ApothemUnifiedDeploymentClient.tsx",
  );
  assert.match(page, /ENABLE_APOTHEM_UNIFIED_V3_DEPLOYMENT/);
  assert.match(client, /Deploy clean V3 stack/);
  assert.match(client, /Deploy Pricing Policy V2/);
  assert.match(client, /args: \[OWNER, ZERO_ADDRESS\]/);
  assert.match(client, /ZERO_ADDRESS,\s+deployment\.pricingPolicy/s);
  assert.match(client, /setRegistrar/);
  assert.doesNotMatch(client, /NEXT_PUBLIC_XNS_PROTOCOL_GENERATION.*writeContract/s);
  assert.match(client, /Do not apply these values/);
});

test("the pricing compatibility recovery is preview-only and proposes both delays", async () => {
  const page = await source(
    "frontend/app/deployment/apothem-pricing-compatibility/page.tsx",
  );
  const client = await source(
    "frontend/app/deployment/apothem-registry-v2/ApothemRegistryV2DeploymentClient.tsx",
  );

  assert.match(page, /VERCEL_ENV !== "preview"/);
  assert.match(page, /ENABLE_APOTHEM_REGISTRY_V2_DEPLOYMENT/);
  assert.match(page, /notFound\(\)/);
  assert.match(client, /functionName: "proposeRegistrar"/);
  assert.match(client, /functionName: "proposeConfiguration"/);
  assert.match(client, /functionName: "activateRegistrar"/);
  assert.match(client, /functionName: "activatePendingConfiguration"/);
  assert.match(client, /pricing-compatible Registrar/);
  assert.match(client, /pricing-compatible Subdomain Registrar/);
  assert.match(client, /REGISTRY_ACTIVATION_TIME = 1790591244n/);
  assert.match(client, /DISCOUNT_ACTIVATION_TIME = 1790591254n/);
  assert.match(client, /REGISTRAR_PROPOSAL_TRANSACTION/);
  assert.match(client, /DISCOUNT_PROPOSAL_TRANSACTION/);
  assert.match(client, /setActivationStage\(activation\.stage\)/);
  assert.match(client, /activationStage !== "ready"/);
});

test("the pricing compatibility recovery hands off public and server quote targets", async () => {
  const client = await source(
    "frontend/app/deployment/apothem-registry-v2/ApothemRegistryV2DeploymentClient.tsx",
  );

  assert.match(client, /NEXT_PUBLIC_XNS_REGISTRAR: deployment\?\.registrar/);
  assert.match(client, /XNS_SIGNED_QUOTE_REGISTRAR: deployment\?\.registrar/);
  assert.match(
    client,
    /NEXT_PUBLIC_XNS_SUBDOMAIN_REGISTRAR: deployment\?\.subdomainRegistrar/,
  );
  assert.match(client, /XNS_SUBDOMAIN_REGISTRAR: deployment\?\.subdomainRegistrar/);
});

test("Apothem verification prefers the dedicated XDCScan key and pins the recovery modules", async () => {
  const config = await source("hardhat.config.ts");
  const verifier = await source(
    "scripts/verify-apothem-pricing-compatibility.ts",
  );

  assert.match(
    config,
    /process\.env\.XDCSCAN_API_KEY \|\| process\.env\.ETHERSCAN_API_KEY/,
  );
  assert.match(verifier, /0x28fbEfF349909A99232b771aaE40541500cC7050/);
  assert.match(verifier, /0xCc3395928DFD31a27c764fc97356800eeD4C936a/);
  assert.match(verifier, /network\.chainId !== 51n/);
});

test("the activation handoff includes public and server-side quote targets", async () => {
  const contents = await source(
    "frontend/app/deployment/apothem-registry-v2/ApothemRegistryV2DeploymentClient.tsx",
  );

  assert.match(contents, /XNS_SIGNED_QUOTE_REGISTRAR: deployment\?\.registrar/);
  assert.match(contents, /XNS_SUBDOMAIN_REGISTRAR: deployment\?\.subdomainRegistrar/);
  assert.match(contents, /functionName: "activateRegistrar"/);
  assert.match(contents, /functionName: "activatePendingConfiguration"/);
});

test("the compatibility preflight and smoke test pin the final reviewed modules", async () => {
  const preflight = await source("scripts/preflight-apothem-registry-v2-activation.ts");
  const smoke = await source("scripts/smoke-apothem-registry-v2.mjs");

  for (const contents of [preflight, smoke]) {
    assert.match(contents, /0x28fbEfF349909A99232b771aaE40541500cC7050/);
    assert.match(contents, /0xCc3395928DFD31a27c764fc97356800eeD4C936a/);
  }
  assert.match(preflight, /registryActivation: 1790591244n/);
  assert.match(preflight, /discountActivation: 1790591254n/);
});

test("the post-activation smoke test exercises both signed quote APIs", async () => {
  const contents = await source("scripts/smoke-apothem-registry-v2.mjs");

  assert.match(contents, /postData\("\/api\/v1\/registrar\/quote"/);
  assert.match(contents, /postData\("\/api\/v1\/subdomain\/quote"/);
  assert.match(contents, /registration quote registrar/);
  assert.match(contents, /subdomain quote registrar/);
});
