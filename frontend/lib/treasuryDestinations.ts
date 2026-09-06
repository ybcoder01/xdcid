import { getAddress, isAddress, zeroAddress, type Address } from "viem";

export type TreasuryDestinationStatus = "matched" | "mismatched" | "missing";

export type TreasuryDestination = {
  id: "registration" | "archive" | "forwarding";
  label: string;
  address: Address | null;
  scope: string;
  status: TreasuryDestinationStatus;
};

export type TreasuryDestinationReport = {
  designatedTreasury: Address | null;
  aligned: boolean;
  destinations: TreasuryDestination[];
};

export function buildTreasuryDestinationReport(input: {
  registrationTreasury: string | null | undefined;
  archiveTreasury: string | null | undefined;
  forwardingFeeRecipient: string | null | undefined;
}): TreasuryDestinationReport {
  const designatedTreasury = normalizeTreasury(input.registrationTreasury);
  const definitions = [
    {
      id: "registration" as const,
      label: "Domain and subdomain revenue",
      address: normalizeTreasury(input.registrationTreasury),
      scope: "XDC Network",
    },
    {
      id: "archive" as const,
      label: "Archive subscriptions",
      address: normalizeTreasury(input.archiveTreasury),
      scope: "Configured subscription network",
    },
    {
      id: "forwarding" as const,
      label: "Cross-chain convenience fees",
      address: normalizeTreasury(input.forwardingFeeRecipient),
      scope: "Each supported source network",
    },
  ];

  const destinations = definitions.map((destination) => ({
    ...destination,
    status: destinationStatus(designatedTreasury, destination.address),
  }));

  return {
    designatedTreasury,
    aligned:
      designatedTreasury !== null &&
      destinations.every((destination) => destination.status === "matched"),
    destinations,
  };
}

function normalizeTreasury(value: string | null | undefined): Address | null {
  if (!value || !isAddress(value) || value === zeroAddress) return null;
  return getAddress(value);
}

function destinationStatus(
  designatedTreasury: Address | null,
  destination: Address | null,
): TreasuryDestinationStatus {
  if (!destination) return "missing";
  if (!designatedTreasury) return "mismatched";
  return destination === designatedTreasury ? "matched" : "mismatched";
}
