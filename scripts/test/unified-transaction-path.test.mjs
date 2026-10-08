import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("unified quotes and writes are generation gated while legacy remains available", async () => {
  const [topQuote, childQuote, registration, renewal, childRegistration, childRenewal, config] =
    await Promise.all([
      readFile("frontend/app/api/v1/registrar/quote/route.ts", "utf8"),
      readFile("frontend/app/api/v1/subdomain/quote/route.ts", "utf8"),
      readFile("frontend/components/SignedRegistrationControls.tsx", "utf8"),
      readFile("frontend/components/SignedRenewalControls.tsx", "utf8"),
      readFile("frontend/components/SubdomainRegistration.tsx", "utf8"),
      readFile("frontend/components/SubdomainRenewalControls.tsx", "utf8"),
      readFile("frontend/config/contracts.ts", "utf8"),
    ]);

  assert.match(topQuote, /unifiedTopLevelQuote/);
  assert.match(childQuote, /unifiedSubdomainQuote/);
  assert.match(topQuote, /protocolGeneration: unified \? "unified-v3" : "legacy"/);
  assert.match(childQuote, /protocolGeneration: unified \? "unified-v3" : "legacy"/);
  assert.match(registration, /functionName: "registerWithDiscount"/);
  assert.match(registration, /functionName: "register"/);
  assert.match(registration, /functionName: "registerWithDiscountQuote"/);
  assert.match(renewal, /unifiedProtocolEnabled \? "renew" : "renewWithQuote"/);
  assert.match(childRegistration, /"registerSubdomain"/);
  assert.match(childRegistration, /"registerWithQuote"/);
  assert.match(childRenewal, /"renewSubdomain" : "renewWithQuote"/);
  assert.match(config, /NEXT_PUBLIC_XNS_PROTOCOL_GENERATION === "unified-v3"/);
  assert.match(config, /unifiedSubdomainRegistryAddress = activeRegistryAddress/);
});
