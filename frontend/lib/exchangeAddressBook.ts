import { getAddress, isAddress, type Address } from "viem";
import {
  MAINNET_PAYMENT_NETWORKS,
  type PaymentNetwork,
} from "../config/paymentNetworks";

export const EXCHANGE_ADDRESS_BOOK_ASSETS = ["USDC", "XDC", "ETH", "POL"] as const;
export type ExchangeAddressBookAsset = (typeof EXCHANGE_ADDRESS_BOOK_ASSETS)[number];
export type ExchangeAddressBookStatus = "active" | "reconfirm" | "retired";

const SUPPORTED_CHAIN_IDS = new Set<number>(
  MAINNET_PAYMENT_NETWORKS.map((network) => network.chainId),
);

export type ExchangeAddressBookEntry = {
  id: string;
  exchange: string;
  label: string;
  asset: ExchangeAddressBookAsset;
  chainId: number;
  address: Address;
  memo?: string;
  notes?: string;
  status: ExchangeAddressBookStatus;
  confirmedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ExchangeAddressBookInput = Omit<
  ExchangeAddressBookEntry,
  "id" | "createdAt" | "updatedAt" | "confirmedAt"
>;

export function normalizeExchangeAddressBookInput(value: unknown): ExchangeAddressBookInput {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error("Address-book entry is required");
  }
  const input = value as Record<string, unknown>;
  const exchange = normalizedText(input.exchange, "Exchange", 2, 48);
  const label = normalizedText(input.label, "Label", 2, 64);
  const asset = String(input.asset || "").toUpperCase();
  if (!EXCHANGE_ADDRESS_BOOK_ASSETS.includes(asset as ExchangeAddressBookAsset)) {
    throw new Error("Select a supported asset");
  }
  const chainId = Number(input.chainId);
  if (!Number.isSafeInteger(chainId) || !SUPPORTED_CHAIN_IDS.has(chainId)) {
    throw new Error("Select a supported mainnet network");
  }
  if (typeof input.address !== "string" || !isAddress(input.address)) {
    throw new Error("Enter a valid EVM deposit address");
  }
  const status = input.status === "reconfirm" || input.status === "retired"
    ? input.status
    : "active";
  const memo = optionalText(input.memo, "Memo or tag", 120);
  const notes = optionalText(input.notes, "Notes", 240);
  return {
    exchange,
    label,
    asset: asset as ExchangeAddressBookAsset,
    chainId,
    address: getAddress(input.address),
    memo,
    notes,
    status,
  };
}

export function assetMatchesNetwork(asset: ExchangeAddressBookAsset, chainId: number): boolean {
  if (asset === "USDC") return SUPPORTED_CHAIN_IDS.has(chainId);
  const network = MAINNET_PAYMENT_NETWORKS.find((candidate) => candidate.chainId === chainId);
  return network?.nativeSymbol === asset;
}

export function paymentSelectionForSavedEntry(
  entry: ExchangeAddressBookEntry,
  activeNetworks: readonly PaymentNetwork[],
): { chainId: number; token: "USDC" | "NATIVE" } | null {
  const savedNetwork = MAINNET_PAYMENT_NETWORKS.find(
    (candidate) => candidate.chainId === entry.chainId,
  );
  if (!savedNetwork) return null;

  const activeNetwork = activeNetworks.find(
    (candidate) => candidate.circleDomain === savedNetwork.circleDomain,
  );
  if (!activeNetwork) return null;

  if (entry.asset === "USDC") {
    return { chainId: activeNetwork.chainId, token: "USDC" };
  }
  if (!assetMatchesNetwork(entry.asset, entry.chainId)) return null;
  return { chainId: activeNetwork.chainId, token: "NATIVE" };
}

function normalizedText(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== "string") throw new Error(`${label} is required`);
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < min || normalized.length > max) {
    throw new Error(`${label} must contain ${min}-${max} characters`);
  }
  return normalized;
}

function optionalText(value: unknown, label: string, max: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${label} is invalid`);
  const normalized = value.trim().replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ");
  if (normalized.length > max) throw new Error(`${label} cannot exceed ${max} characters`);
  return normalized || undefined;
}
