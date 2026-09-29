import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const activationClientPath = new URL(
  "../../frontend/app/deployment/mainnet-primary-resolution-activation/MainnetPrimaryResolutionActivationClient.tsx",
  import.meta.url,
);
const deploymentManifestPath = new URL(
  "../../docs/mainnet-deployment-manifest.md",
  import.meta.url,
);

test("mainnet activation handoff includes both browser and quote registrar configuration", async () => {
  const [activationClient, deploymentManifest] = await Promise.all([
    readFile(activationClientPath, "utf8"),
    readFile(deploymentManifestPath, "utf8"),
  ]);

  assert.match(
    activationClient,
    /NEXT_PUBLIC_XNS_REGISTRAR=\$\{CANDIDATE_REGISTRAR\}\\nXNS_SIGNED_QUOTE_REGISTRAR=\$\{CANDIDATE_REGISTRAR\}/,
  );
  assert.match(
    deploymentManifest,
    /NEXT_PUBLIC_XNS_REGISTRAR=0x3D87B064a06f62cc4a24EAff13A591C9Ba791135\nXNS_SIGNED_QUOTE_REGISTRAR=0x3D87B064a06f62cc4a24EAff13A591C9Ba791135/,
  );
});
