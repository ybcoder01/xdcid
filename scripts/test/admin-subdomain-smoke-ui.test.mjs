import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the administrator smoke-test route bypasses only the public UI flag", async () => {
  const [page, registration, admin] = await Promise.all([
    readFile("frontend/app/admin/subdomains/page.tsx", "utf8"),
    readFile("frontend/components/SubdomainRegistration.tsx", "utf8"),
    readFile("frontend/app/admin/page.tsx", "utf8"),
  ]);

  assert.match(page, /requireAdminSession\(request\)/);
  assert.match(page, /if \(!session\) redirect\("\/admin"\)/);
  assert.match(page, /<SubdomainRegistration allowDisabledEnvironment \/>/);
  assert.match(registration, /subdomainRegistrationEnabled \|\| allowDisabledEnvironment/);
  assert.match(admin, /href="\/admin\/subdomains"/);
});
