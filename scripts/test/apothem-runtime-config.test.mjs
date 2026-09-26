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
});

test("the activation handoff includes public and server-side quote targets", async () => {
  const contents = await source(
    "frontend/app/deployment/apothem-registry-v2-activation/ApothemRegistryV2ActivationClient.tsx",
  );

  assert.match(contents, /XNS_SIGNED_QUOTE_REGISTRAR=\$\{REGISTRAR\}/);
  assert.match(contents, /XNS_SUBDOMAIN_REGISTRAR=\$\{SUBDOMAIN_REGISTRAR\}/);
  assert.match(contents, /XNS_SIGNED_QUOTE_REGISTRAR=\$\{PREVIOUS_CONSUMER\}/);
  assert.match(
    contents,
    /XNS_SUBDOMAIN_REGISTRAR=\$\{PREVIOUS_SUBDOMAIN_REGISTRAR\}/,
  );
});

test("the post-activation smoke test exercises both signed quote APIs", async () => {
  const contents = await source("scripts/smoke-apothem-registry-v2.mjs");

  assert.match(contents, /postData\("\/api\/v1\/registrar\/quote"/);
  assert.match(contents, /postData\("\/api\/v1\/subdomain\/quote"/);
  assert.match(contents, /registration quote registrar/);
  assert.match(contents, /subdomain quote registrar/);
});
