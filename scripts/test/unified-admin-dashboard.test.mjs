import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(
  new URL("../../frontend/components/AdminRoleManagement.tsx", import.meta.url),
  "utf8",
);
const contracts = readFileSync(
  new URL("../../frontend/config/contracts.ts", import.meta.url),
  "utf8",
);

test("the unified admin dashboard preserves delayed discount-signer control", () => {
  assert.match(contracts, /NEXT_PUBLIC_XNS_PROTOCOL_GENERATION/);
  assert.match(contracts, /name: "proposeConfiguration"/);
  assert.match(contracts, /name: "cancelPendingConfiguration"/);
  assert.match(contracts, /name: "activatePendingConfiguration"/);
  assert.match(component, /Propose signer rotation/);
  assert.match(component, /Cancel signer rotation/);
  assert.match(component, /Activate signer rotation/);
});

test("two-step protocol ownership is visible and can be accepted", () => {
  assert.match(contracts, /name: "pendingOwner"/);
  assert.match(contracts, /name: "acceptOwnership"/);
  assert.match(component, /Unified-registrar owner/);
  assert.match(component, /Accept ownership/);
});
