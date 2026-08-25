import { createHmac } from "node:crypto";
import { getAddress } from "viem";

const FINGERPRINT_DOMAIN = "xdcid:payment-participant:v1";

export function paymentParticipantFingerprint(rawAddress: string): string {
  const secret = process.env.PAYMENT_RECORD_ENCRYPTION_KEY;
  if (!secret) throw new Error("Payment record encryption is not configured");
  const address = getAddress(rawAddress).toLowerCase();
  return createHmac("sha256", secret)
    .update(FINGERPRINT_DOMAIN)
    .update("\0")
    .update(address)
    .digest("hex");
}
