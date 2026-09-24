import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("the shared Registry ABI exposes explicit legacy-name migration", async () => {
  const contents = await source("frontend/config/contracts.ts");

  assert.match(contents, /name: "ownershipGenerations"/);
  assert.match(contents, /name: "migrateName"/);
});

test("owned-name discovery reports generation-zero names as migration-required", async () => {
  const contents = await source("frontend/lib/ownedNames.ts");

  assert.match(contents, /functionName: "ownershipGenerations"/);
  assert.match(contents, /migrationRequired: ownershipGeneration === 0n/);
});

test("owner surfaces gate record controls and expose the migration action", async () => {
  const [dashboard, namePage, action] = await Promise.all([
    source("frontend/app/dashboard/page.tsx"),
    source("frontend/app/name/[name]/page.tsx"),
    source("frontend/components/RegistryV2MigrationAction.tsx"),
  ]);

  assert.match(dashboard, /selectedRecord\.migrationRequired/);
  assert.match(dashboard, /RegistryV2MigrationAction/);
  assert.match(namePage, /ownerRecordsEnabled/);
  assert.match(namePage, /RegistryV2MigrationAction/);
  assert.match(action, /functionName: "migrateName"/);
  assert.match(action, /walletActionErrorMessage/);
});
