import { getAddress, isAddress, zeroAddress, type Address } from "viem";
import { getPaymentNetwork } from "../config/paymentNetworks";

export type PaymentAddressSource = "multichain" | "evm-default";

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
  defaultEvmAddress?: string;
}): PaymentDestination | null {
  const multichainAddress = validAddress(input.multichainAddress);
  if (multichainAddress) {
    return { address: multichainAddress, source: "multichain" };
  }

  if (!getPaymentNetwork(input.destinationChainId)) return null;

  const defaultEvmAddress = validAddress(input.defaultEvmAddress);
  return defaultEvmAddress
    ? { address: defaultEvmAddress, source: "evm-default" }
    : null;
}
