import { getAddress, isAddress, type Address } from "viem";
import { paymentParticipantFingerprint } from "./paymentParticipantFingerprint";

export function configuredArchiveTreasury(): Address | null {
  const value = process.env.ARCHIVE_SUBSCRIPTION_TREASURY_ADDRESS || "";
  return isAddress(value) ? getAddress(value) : null;
}

export function isSameArchiveWallet(wallet: string, treasury: string): boolean {
  if (!isAddress(wallet) || !isAddress(treasury)) return false;
  return getAddress(wallet) === getAddress(treasury);
}

export function isArchiveTreasuryWallet(wallet: string): boolean {
  const treasury = configuredArchiveTreasury();
  return treasury ? isSameArchiveWallet(wallet, treasury) : false;
}

export function isArchiveTreasuryFingerprint(walletFingerprint: string): boolean {
  const treasury = configuredArchiveTreasury();
  return treasury
    ? paymentParticipantFingerprint(treasury) === walletFingerprint
    : false;
}
