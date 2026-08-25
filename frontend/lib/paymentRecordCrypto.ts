import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const DEFAULT_KEY_VERSION = 1;

export type EncryptedPaymentContext = {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: number;
};

function decodeKey(value: string, variableName: string): Uint8Array {
  const normalized = value.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(normalized)
    ? Buffer.from(normalized, "hex")
    : Buffer.from(normalized, "base64");
  if (key.length !== 32) {
    throw new Error(`${variableName} must encode exactly 32 bytes`);
  }
  return Uint8Array.from(key);
}

function activeKeyVersion(): number {
  const raw = process.env.PAYMENT_RECORD_ENCRYPTION_KEY_VERSION?.trim();
  if (!raw) return DEFAULT_KEY_VERSION;
  const version = Number(raw);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error("PAYMENT_RECORD_ENCRYPTION_KEY_VERSION must be a positive integer");
  }
  return version;
}

function currentEncryptionKey(): Uint8Array {
  const value = process.env.PAYMENT_RECORD_ENCRYPTION_KEY?.trim();
  if (!value) throw new Error("Payment record encryption is not configured");
  return decodeKey(value, "PAYMENT_RECORD_ENCRYPTION_KEY");
}

function decryptionKey(version: number): Uint8Array {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error("Payment record encryption key version is invalid");
  }
  if (version === activeKeyVersion()) return currentEncryptionKey();

  const encodedKeyring = process.env.PAYMENT_RECORD_DECRYPTION_KEYS?.trim();
  if (!encodedKeyring) {
    throw new Error(`Payment record decryption key version ${version} is not configured`);
  }

  let keyring: unknown;
  try {
    keyring = JSON.parse(encodedKeyring);
  } catch {
    throw new Error("PAYMENT_RECORD_DECRYPTION_KEYS must be a JSON object");
  }
  if (!keyring || Array.isArray(keyring) || typeof keyring !== "object") {
    throw new Error("PAYMENT_RECORD_DECRYPTION_KEYS must be a JSON object");
  }
  const value = (keyring as Record<string, unknown>)[String(version)];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Payment record decryption key version ${version} is not configured`);
  }
  return decodeKey(value, `PAYMENT_RECORD_DECRYPTION_KEYS[${version}]`);
}

export function encryptPaymentContext(value: unknown): EncryptedPaymentContext {
  const iv = Uint8Array.from(randomBytes(12));
  const cipher = createCipheriv("aes-256-gcm", currentEncryptionKey(), iv);
  const ciphertext =
    cipher.update(JSON.stringify(value), "utf8", "hex") + cipher.final("hex");
  return {
    ciphertext,
    iv: Buffer.from(iv).toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    keyVersion: activeKeyVersion()
  };
}

export function decryptPaymentContext<T>(value: EncryptedPaymentContext): T {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    decryptionKey(value.keyVersion),
    Uint8Array.from(Buffer.from(value.iv, "base64"))
  );
  decipher.setAuthTag(Uint8Array.from(Buffer.from(value.tag, "base64")));
  const plaintext =
    decipher.update(value.ciphertext, "hex", "utf8") + decipher.final("utf8");
  return JSON.parse(plaintext) as T;
}
