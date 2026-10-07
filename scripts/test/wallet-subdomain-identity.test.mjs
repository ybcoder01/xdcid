import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("wallet badge uses one verified owned subdomain when no primary name exists", async () => {
  const walletButton = await readFile("frontend/components/WalletButton.tsx", "utf8");

  assert.match(walletButton, /\/api\/v1\/reverse\//);
  assert.match(walletButton, /\/api\/v1\/addresses\/\$\{address\}\/subdomains/);
  assert.match(walletButton, /names\.length === 1/);
  assert.match(walletButton, /Owned subdomain/);
  assert.match(walletButton, /isPrimary: true/);
});
