import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSecureNodeVersion,
  isSecureNodeVersion,
} from "../check-node-security-version.mjs";

test("accepts patched Node 24 releases", () => {
  assert.equal(isSecureNodeVersion("24.22.1"), true);
  assert.equal(isSecureNodeVersion("v24.22.1"), true);
  assert.equal(isSecureNodeVersion("24.23.0"), true);
});

test("rejects vulnerable or unsupported releases", () => {
  assert.equal(isSecureNodeVersion("24.22.0"), false);
  assert.equal(isSecureNodeVersion("24.19.0"), false);
  assert.equal(isSecureNodeVersion("22.23.4"), false);
  assert.equal(isSecureNodeVersion("26.12.1"), false);
  assert.throws(
    () => assertSecureNodeVersion("24.22.0"),
    /requires Node\.js 24\.22\.1 or newer/,
  );
});

test("rejects malformed version strings", () => {
  assert.throws(() => isSecureNodeVersion("24"), /Could not parse Node\.js version/);
});
