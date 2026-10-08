import fs from "node:fs";

const limit = 24_576;
const minimumHeadroom = 512;
const contracts = [
  "XNSRegistryV3",
  "XNSUnifiedRegistrar",
  "XNSUniversalResolver",
  "XNSPricingPolicyV2"
];

let failed = false;
for (const name of contracts) {
  const artifactPath = `artifacts/contracts/${name}.sol/${name}.json`;
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const bytes = (artifact.deployedBytecode.length - 2) / 2;
  const headroom = limit - bytes;
  console.log(`${name}: ${bytes} bytes (${headroom} bytes headroom)`);
  if (bytes > limit || headroom < minimumHeadroom) failed = true;
}

if (failed) {
  console.error(
    `Unified protocol contracts must remain below ${limit} bytes with at least ${minimumHeadroom} bytes of headroom.`
  );
  process.exit(1);
}
