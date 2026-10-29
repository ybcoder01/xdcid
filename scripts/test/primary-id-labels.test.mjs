import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("owner-facing identity controls use Primary ID terminology", async () => {
  const dashboard = await readFile("frontend/app/dashboard/page.tsx", "utf8");
  const namePage = await readFile("frontend/app/name/[name]/page.tsx", "utf8");

  assert.match(dashboard, /Set Primary ID/);
  assert.match(dashboard, /is now the Primary ID/);
  assert.doesNotMatch(dashboard, /Set display name/);
  assert.doesNotMatch(dashboard, /Primary display name/);
  assert.match(namePage, /Set as Primary ID/);
});
