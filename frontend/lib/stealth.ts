import { secp256k1 } from "@noble/curves/secp256k1";
import {
  bytesToHex,
  getAddress,
  hexToBytes,
  keccak256,
  type Address,
  type Hex
} from "viem";

const META_PREFIX = "st:xdc:0x";
const COMPRESSED_PUBLIC_KEY_BYTES = 33;
const META_PUBLIC_KEY_HEX_LENGTH = COMPRESSED_PUBLIC_KEY_BYTES * 2 * 2;
const CURVE_ORDER = secp256k1.CURVE.n;

type ReceiverSecrets = {
  spendingPrivateKey: Uint8Array;
  viewingPrivateKey: Uint8Array;
};

export type PrivateReceiveSession = {
  readonly stealthMetaAddress: string;
  readonly spendingPublicKey: Hex;
  readonly viewingPublicKey: Hex;
};

export type PrivateReceiveAnnouncement = {
  readonly stealthAddress: Address;
  readonly ephemeralPublicKey: Hex;
  readonly viewTag: Hex;
};

const receiverSecrets = new WeakMap<PrivateReceiveSession, ReceiverSecrets>();

function randomPrivateKey(): Uint8Array {
  return secp256k1.utils.randomPrivateKey();
}

function publicKey(privateKey: Uint8Array): Uint8Array {
  return secp256k1.getPublicKey(privateKey, true);
}

function parseMetaAddress(metaAddress: string): {
  spendingPublicKey: Uint8Array;
  viewingPublicKey: Uint8Array;
} {
  if (!metaAddress.startsWith(META_PREFIX)) {
    throw new Error("Private receive address must start with " + META_PREFIX);
  }

  const payload = metaAddress.slice(META_PREFIX.length);
  if (
    payload.length !== META_PUBLIC_KEY_HEX_LENGTH ||
    !/^[0-9a-f]+$/i.test(payload)
  ) {
    throw new Error("Private receive address has an invalid public-key payload");
  }

  const split = COMPRESSED_PUBLIC_KEY_BYTES * 2;
  const spendingPublicKey = hexToBytes(("0x" + payload.slice(0, split)) as Hex);
  const viewingPublicKey = hexToBytes(("0x" + payload.slice(split)) as Hex);

  secp256k1.ProjectivePoint.fromHex(spendingPublicKey);
  secp256k1.ProjectivePoint.fromHex(viewingPublicKey);
  return { spendingPublicKey, viewingPublicKey };
}

function hashSharedSecret(privateKey: Uint8Array, peerPublicKey: Uint8Array): Uint8Array {
  const sharedPoint = secp256k1.getSharedSecret(privateKey, peerPublicKey, true);
  return hexToBytes(keccak256(bytesToHex(sharedPoint)));
}

function scalarFromHash(hash: Uint8Array): bigint {
  const value = BigInt(bytesToHex(hash)) % CURVE_ORDER;
  if (value === 0n) throw new Error("Derived an invalid zero stealth scalar");
  return value;
}

function addressFromPoint(point: InstanceType<typeof secp256k1.ProjectivePoint>): Address {
  const uncompressed = point.toRawBytes(false);
  const digest = keccak256(bytesToHex(uncompressed.slice(1)));
  return getAddress(("0x" + digest.slice(-40)) as Address);
}

function deriveAddress(
  spendingPublicKey: Uint8Array,
  sharedSecretHash: Uint8Array
): Address {
  const spendingPoint = secp256k1.ProjectivePoint.fromHex(spendingPublicKey);
  const tweakPoint = secp256k1.ProjectivePoint.BASE.multiply(
    scalarFromHash(sharedSecretHash)
  );
  return addressFromPoint(spendingPoint.add(tweakPoint));
}

export function createPrivateReceiveSession(): PrivateReceiveSession {
  const spendingPrivateKey = randomPrivateKey();
  const viewingPrivateKey = randomPrivateKey();
  const spendingPublicKey = publicKey(spendingPrivateKey);
  const viewingPublicKey = publicKey(viewingPrivateKey);
  const session: PrivateReceiveSession = Object.freeze({
    stealthMetaAddress:
      META_PREFIX +
      bytesToHex(spendingPublicKey).slice(2) +
      bytesToHex(viewingPublicKey).slice(2),
    spendingPublicKey: bytesToHex(spendingPublicKey),
    viewingPublicKey: bytesToHex(viewingPublicKey)
  });

  receiverSecrets.set(session, { spendingPrivateKey, viewingPrivateKey });
  return session;
}

export function createPrivateReceiveAddress(
  stealthMetaAddress: string
): PrivateReceiveAnnouncement {
  const { spendingPublicKey, viewingPublicKey } = parseMetaAddress(
    stealthMetaAddress
  );
  const ephemeralPrivateKey = randomPrivateKey();

  try {
    const ephemeralPublicKey = publicKey(ephemeralPrivateKey);
    const sharedSecretHash = hashSharedSecret(
      ephemeralPrivateKey,
      viewingPublicKey
    );

    return Object.freeze({
      stealthAddress: deriveAddress(spendingPublicKey, sharedSecretHash),
      ephemeralPublicKey: bytesToHex(ephemeralPublicKey),
      viewTag: bytesToHex(sharedSecretHash.slice(0, 1))
    });
  } finally {
    ephemeralPrivateKey.fill(0);
  }
}

export function announcementBelongsToSession(
  session: PrivateReceiveSession,
  announcement: PrivateReceiveAnnouncement
): boolean {
  const secrets = receiverSecrets.get(session);
  if (!secrets) return false;

  try {
    const ephemeralPublicKey = hexToBytes(announcement.ephemeralPublicKey);
    const sharedSecretHash = hashSharedSecret(
      secrets.viewingPrivateKey,
      ephemeralPublicKey
    );

    if (bytesToHex(sharedSecretHash.slice(0, 1)) !== announcement.viewTag) {
      return false;
    }

    return (
      deriveAddress(hexToBytes(session.spendingPublicKey), sharedSecretHash) ===
      announcement.stealthAddress
    );
  } catch {
    return false;
  }
}

export function destroyPrivateReceiveSession(
  session: PrivateReceiveSession
): void {
  const secrets = receiverSecrets.get(session);
  if (!secrets) return;

  secrets.spendingPrivateKey.fill(0);
  secrets.viewingPrivateKey.fill(0);
  receiverSecrets.delete(session);
}

export function isPrivateReceiveMetaAddress(value: string): boolean {
  try {
    parseMetaAddress(value);
    return true;
  } catch {
    return false;
  }
}
