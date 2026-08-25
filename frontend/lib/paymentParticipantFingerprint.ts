import { createHmac } from "node:crypto";
import { getAddress } from "viem";

const FINGERPRINT_DOMAIN = "xdcid:payment-participant:v1";
const NAME_FINGERPRINT_DOMAIN = "xdcid:payment-name:v1";

function fingerprintSecret(): string {
  const dedicatedSecret = process.env.PAYMENT_PARTICIPANT_FINGERPRINT_KEY?.trim();
  if (dedicatedSecret) return dedicatedSecret;

  const legacySecret = process.env.PAYMENT_RECORD_ENCRYPTION_KEY?.trim();
  if (!legacySecret) {
    throw new Error("Payment participant fingerprinting is not configured");
  }
  return legacySecret;
}

export function paymentParticipantFingerprint(rawAddress: string): string {
  const address = getAddress(rawAddress).toLowerCase();
  return createHmac("sha256", fingerprintSecret())
    .update(FINGERPRINT_DOMAIN)
    .update("\0")
    .update(address)
    .digest("hex");
}

export function paymentNameFingerprint(rawName: string): string {
  const name = rawName.trim().toLowerCase();
  return createHmac("sha256", fingerprintSecret())
    .update(NAME_FINGERPRINT_DOMAIN)
    .update("\0")
    .update(name)
    .digest("hex");
}
