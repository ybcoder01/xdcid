import { readFile } from "node:fs/promises";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const manifest = JSON.parse(await readFile(new URL("../deployments/apothem-unified-v3.json", import.meta.url), "utf8"));
const enabled = process.env.NEXT_PUBLIC_PAYMENT_NETWORK_ENV?.trim().toLowerCase() === "testnet" && process.env.NEXT_PUBLIC_XNS_PROTOCOL_GENERATION?.trim().toLowerCase() === "unified-v3";
if (!enabled) {
  console.log("Apothem Unified V3 environment gate skipped for this build target.");
  process.exit(0);
}

const expected = {
  NEXT_PUBLIC_XNS_REGISTRY: manifest.registry, XNS_REGISTRY_ADDRESS: manifest.registry,
  NEXT_PUBLIC_XNS_REGISTRAR: manifest.registrar, XNS_SIGNED_QUOTE_REGISTRAR: manifest.registrar,
  NEXT_PUBLIC_XNS_SUBDOMAIN_REGISTRAR: manifest.registrar, XNS_SUBDOMAIN_REGISTRAR: manifest.registrar,
  NEXT_PUBLIC_XNS_PRICING_POLICY: manifest.pricingPolicy, NEXT_PUBLIC_XNS_ADMIN_PRICING_POLICY: manifest.pricingPolicy,
  XNS_PRICING_POLICY: manifest.pricingPolicy, NEXT_PUBLIC_XNS_RESOLVER: manifest.resolver,
  NEXT_PUBLIC_XNS_RESOLVER_V2: manifest.resolver, NEXT_PUBLIC_XNS_REVERSE_RESOLVER_V2: manifest.resolver,
  NEXT_PUBLIC_XNS_MULTICHAIN_RESOLVER: manifest.resolver, XNS_REVERSE_RESOLVER_ADDRESS: manifest.resolver,
  XNS_QUOTE_CHAIN_ID: String(manifest.chainId), NEXT_PUBLIC_XNS_PRICING_POLICY_VERSION: "v2",
  NEXT_PUBLIC_XNS_ADMIN_PRICING_POLICY_VERSION: "v2", XNS_PRICING_POLICY_VERSION: "v2",
  NEXT_PUBLIC_SIGNED_REGISTRAR_ENABLED: "true", NEXT_PUBLIC_SUBDOMAIN_REGISTRATION_ENABLED: "true",
};
const errors = [];
for (const [key, wanted] of Object.entries(expected)) {
  const actual = process.env[key]?.trim();
  let matches = false;
  try { matches = wanted.startsWith("0x") ? getAddress(actual ?? "") === getAddress(wanted) : actual?.toLowerCase() === wanted.toLowerCase(); } catch {}
  if (!matches) errors.push(`${key} must match the approved Apothem Unified V3 manifest`);
}
let signerAddress = process.env.XNS_QUOTE_SIGNER_ADDRESS?.trim();
try {
  const signerKey = process.env.XNS_QUOTE_SIGNER_PRIVATE_KEY?.trim();
  if (!signerAddress && signerKey) signerAddress = privateKeyToAccount(signerKey.startsWith("0x") ? signerKey : `0x${signerKey}`).address;
  if (!signerAddress || getAddress(signerAddress) !== getAddress(manifest.quoteSigner)) errors.push("The configured quote-signing key must derive the approved quote signer");
} catch { errors.push("The configured quote-signing key is invalid or derives the wrong address"); }
if (errors.length) {
  console.error(`Apothem Unified V3 environment gate failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log("Apothem Unified V3 environment matches the approved deployment manifest.");
