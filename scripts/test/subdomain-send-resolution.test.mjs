import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseResolvableXnsName } from "../../frontend/lib/names.ts";

test("payment names accept top-level names and one subdomain level", () => {
  assert.deepEqual(parseResolvableXnsName("alice"), {
    input: "alice",
    label: "alice",
    name: "alice.xdc",
    isValid: true,
    kind: "top-level",
  });

  assert.deepEqual(parseResolvableXnsName("Treasury.XDCID"), {
    input: "Treasury.XDCID",
    label: "treasury.xdcid",
    name: "treasury.xdcid.xdc",
    isValid: true,
    kind: "subdomain",
    parentName: "xdcid.xdc",
    subdomainLabel: "treasury",
  });

  assert.equal(parseResolvableXnsName("treasury.xdcid.xdc").isValid, true);
  assert.equal(parseResolvableXnsName("too.deep.xdcid.xdc").isValid, false);
  assert.equal(parseResolvableXnsName("-bad.xdcid").isValid, false);
});

test("the Send page resolves subdomains through the subdomain registrar", async () => {
  const source = await readFile("frontend/app/send/page.tsx", "utf8");

  assert.match(source, /parseResolvableXnsName/);
  assert.match(source, /address: activeSubdomainRegistrarAddress/);
  assert.match(source, /functionName: "records"/);
  assert.match(source, /functionName: "addressOf"/);
  assert.match(source, /source: "subdomain"/);
});
