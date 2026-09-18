import { getAddress, isAddress, zeroAddress, type Address } from "viem";
import {
  getPaymentNetwork,
  multichainRecordChainId
} from "../config/paymentNetworks";

export type PaymentAddressSource = "multichain" | "registry-owner";

export type PaymentDestination = {
  address: Address;
  source: PaymentAddressSource;
};

function validAddress(value: string | undefined): Address | null {
  if (!value || !isAddress(value) || value === zeroAddress) return null;
  return getAddress(value);
}

export function selectPaymentDestination(input: {
  destinationChainId: number;
  multichainAddress?: string;
  currentOwner?: string;
}): PaymentDestination | null {
  const multichainAddress = validAddress(input.multichainAddress);
  if (multichainAddress) {
    return { address: multichainAddress, source: "multichain" };
  }

  if (!getPaymentNetwork(input.destinationChainId)) return null;

  // The registry owner is the legacy/default XDC destination only. Falling
  // back to it for Ethereum, Base, Arbitrum or Polygon can send funds to the
  // wrong address when that network-specific record is unset or unreadable.
  if (multichainRecordChainId(input.destinationChainId) !== 50) return null;

  const currentOwner = validAddress(input.currentOwner);
  return currentOwner
    ? { address: currentOwner, source: "registry-owner" }
    : null;
}
