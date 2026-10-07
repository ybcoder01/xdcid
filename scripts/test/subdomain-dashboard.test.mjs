import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the dashboard discovers active subdomains and exposes renewal", async () => {
  const [dashboard, indexer, route, publicPage, registration] =
    await Promise.all([
      readFile("frontend/app/dashboard/page.tsx", "utf8"),
      readFile("frontend/lib/ownedSubdomains.ts", "utf8"),
      readFile(
        "frontend/app/api/v1/addresses/[address]/subdomains/route.ts",
        "utf8",
      ),
      readFile("frontend/app/subdomains/page.tsx", "utf8"),
      readFile("frontend/components/SubdomainRegistration.tsx", "utf8"),
    ]);

  assert.match(indexer, /event SubdomainRegistered/);
  assert.match(indexer, /getTransaction\(\{ hash \}\)/);
  assert.match(indexer, /functionName: "ownerOf"/);
  assert.match(indexer, /functionName: "records"/);
  assert.match(route, /getOwnedSubdomainsData/);
  assert.match(dashboard, /\/subdomains\?/);
  assert.match(dashboard, />\s*Renew\s*</);
  assert.match(publicPage, /allowRenewalsWhenDisabled/);
  assert.match(
    registration,
    /allowRenewalsWhenDisabled && action === "renewal"/,
  );
});
