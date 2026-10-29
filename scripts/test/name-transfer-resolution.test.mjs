import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile("frontend/app/name/[name]/page.tsx", "utf8");

test("top-level ownership transfer resolves wallet addresses and XDCIDs", () => {
  assert.match(source, /parseResolvableXnsName/);
  assert.match(source, /functionName: "ownerOf"/);
  assert.match(source, /functionName: "expiryOf"/);
  assert.match(source, /address: unifiedSubdomainRegistryAddress/);
  assert.match(source, /address: activeSubdomainRegistrarAddress/);
  assert.match(source, /Wallet address or XDCID/);
  assert.match(source, /transferBusy \|\| ownerResolutionPending \|\| !resolvedNewOwner/);
});

test("top-level ownership transfer revalidates an XDCID before submission", () => {
  assert.match(source, /const latest = await resolveOwnerInput\(newOwner\)/);
  assert.match(source, /XDCID ownership changed before submission/);
  assert.match(source, /args: \[node, latest\.address\]/);
  assert.doesNotMatch(source, /!isNonZeroAddress\(newOwner\)/);
});
