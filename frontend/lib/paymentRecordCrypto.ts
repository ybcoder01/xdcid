import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedPaymentContext = {
  ciphertext: string;
  iv: string;
  tag: string;
};

function encryptionKey(): Uint8Array {
  const value = process.env.PAYMENT_RECORD_ENCRYPTION_KEY?.trim();
  if (!value) throw new Error("Payment record encryption is not configured");
  const key = /^[0-9a-fA-F]{64}$/.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error("PAYMENT_RECORD_ENCRYPTION_KEY must encode exactly 32 bytes");
  }
  return Uint8Array.from(key);
}

export function encryptPaymentContext(value: unknown): EncryptedPaymentContext {
  const iv = Uint8Array.from(randomBytes(12));
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext =
    cipher.update(JSON.stringify(value), "utf8", "hex") + cipher.final("hex");
  return {
    ciphertext,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  };
}

export function decryptPaymentContext<T>(value: EncryptedPaymentContext): T {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Uint8Array.from(Buffer.from(value.iv, "base64"))
  );
  decipher.setAuthTag(Uint8Array.from(Buffer.from(value.tag, "base64")));
  const plaintext =
    decipher.update(value.ciphertext, "hex", "utf8") + decipher.final("utf8");
  return JSON.parse(plaintext) as T;
}
