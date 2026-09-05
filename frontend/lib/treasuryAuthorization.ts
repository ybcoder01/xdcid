import { getAddress, isAddress, type Address } from "viem";

type TreasurySources = {
  archiveTreasury?: string | null;
  registrationTreasury?: string | null;
};

export function authorizedTreasuryAddresses({
  archiveTreasury,
  registrationTreasury,
}: TreasurySources): Address[] {
  const addresses = new Set<Address>();

  for (const candidate of [archiveTreasury, registrationTreasury]) {
    if (candidate && isAddress(candidate)) {
      addresses.add(getAddress(candidate));
    }
  }

  return [...addresses];
}
