import { pathToFileURL } from "node:url";

export const requiredNodeVersion = "24.22.1";

function parseVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) {
    throw new Error(`Could not parse Node.js version: ${version}`);
  }

  return match.slice(1).map(Number);
}

export function isSecureNodeVersion(version) {
  const [major, minor, patch] = parseVersion(version);
  const [requiredMajor, requiredMinor, requiredPatch] = parseVersion(requiredNodeVersion);

  if (major !== requiredMajor) return false;
  if (minor !== requiredMinor) return minor > requiredMinor;
  return patch >= requiredPatch;
}

export function assertSecureNodeVersion(version = process.versions.node) {
  if (!isSecureNodeVersion(version)) {
    throw new Error(
      `XDCID requires Node.js ${requiredNodeVersion} or newer on the Node 24 release line. Current runtime: v${version.replace(/^v/, "")}.`,
    );
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  try {
    assertSecureNodeVersion();
    console.log(
      `Node.js v${process.versions.node} satisfies the XDCID security baseline (>=${requiredNodeVersion} <25).`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
