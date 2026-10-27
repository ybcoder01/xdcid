import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("wallet badge never infers a display name from owned subdomains", async () => {
  const walletButton = await readFile("frontend/components/WalletButton.tsx", "utf8");

  assert.match(walletButton, /\/api\/v1\/reverse\//);
  assert.doesNotMatch(walletButton, /\/api\/v1\/addresses\/\$\{address\}\/subdomains/);
  assert.doesNotMatch(walletButton, /names\.length === 1/);
  assert.doesNotMatch(walletButton, /Owned subdomain/);
  assert.match(walletButton, /isPrimary: true/);
  assert.match(walletButton, /setIdentity\(EMPTY_IDENTITY\)/);
});
