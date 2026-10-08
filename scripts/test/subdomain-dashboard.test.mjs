import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the dashboard discovers active subdomains and exposes owner controls", async () => {
  const [dashboard, indexer, route, publicPage, registration, renewal, manager] =
    await Promise.all([
      readFile("frontend/app/dashboard/page.tsx", "utf8"),
      readFile("frontend/lib/ownedSubdomains.ts", "utf8"),
      readFile(
        "frontend/app/api/v1/addresses/[address]/subdomains/route.ts",
        "utf8",
      ),
      readFile("frontend/app/subdomains/page.tsx", "utf8"),
      readFile("frontend/components/SubdomainRegistration.tsx", "utf8"),
      readFile("frontend/components/SubdomainRenewalControls.tsx", "utf8"),
      readFile("frontend/components/SubdomainAddressManager.tsx", "utf8"),
    ]);

  assert.match(indexer, /event SubdomainRegistered/);
  assert.match(indexer, /getTransaction\(\{ hash \}\)/);
  assert.match(indexer, /functionName: "ownerOf"/);
  assert.match(indexer, /functionName: "records"/);
  assert.match(route, /getOwnedSubdomainsData/);
  assert.match(dashboard, /\/subdomains\/manage\?/);
  assert.match(dashboard, /<SubdomainRenewalControls/);
  assert.match(dashboard, /subdomainsByParent\.get\(record\.name\)/);
  assert.match(dashboard, /parentExpiryTimestamp=\{record\.expiry\.timestamp\}/);
  assert.doesNotMatch(dashboard, /Child identities/);
  assert.match(
    renewal,
    /unifiedProtocolEnabled \? "renewSubdomain" : "renewWithQuote"/,
  );
  assert.match(renewal, /Parent limit:/);
  assert.match(manager, /functionName: "setAddress"/);
  assert.match(manager, /functionName: "transferSubdomain"/);
  assert.match(manager, /functionName: "assignSubdomain"/);
  assert.match(manager, /functionName: "reclaimSubdomain"/);
  assert.match(manager, /Reclaim to parent owner/);
  assert.match(publicPage, /allowRenewalsWhenDisabled/);
  assert.match(
    registration,
    /allowRenewalsWhenDisabled && action === "renewal"/,
  );
});
