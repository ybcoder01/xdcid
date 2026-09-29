import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardUrl = new URL(
  "../../frontend/app/dashboard/page.tsx",
  import.meta.url,
);

test("dropdown selection cannot impersonate a confirmed primary-ID update", async () => {
  const source = await readFile(dashboardUrl, "utf8");

  assert.match(source, /const \[submittedPrimary, setSubmittedPrimary\]/);
  assert.match(source, /processedPrimaryHash\.current === primaryHash/);
  assert.match(source, /const nextPrimary = submittedPrimary/);
  assert.match(source, /setPrimaryName\(nextPrimary\)/);
  assert.match(source, /detail: \{ address, name: nextPrimary \}/);
  assert.doesNotMatch(source, /setPrimaryName\(selectedPrimary\)/);
  assert.doesNotMatch(source, /detail: \{ address, name: selectedPrimary \}/);
});

test("the success notice is bound to the confirmed transaction target", async () => {
  const source = await readFile(dashboardUrl, "utf8");

  assert.match(source, /setConfirmedPrimary\(nextPrimary\)/);
  assert.match(source, /\{confirmedPrimary && \(/);
  assert.doesNotMatch(source, /\{primaryReceipt\.isSuccess && \(/);
  assert.match(source, /resetPrimaryWrite\(\)/);
});
