import { getAddress, isAddress, zeroAddress, type Address } from "viem";

export type PaymentAddressSource = "multichain" | "xdc-default";

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
  xdcDefaultAddress?: string;
}): PaymentDestination | null {
  const multichainAddress = validAddress(input.multichainAddress);
  if (multichainAddress) {
    return { address: multichainAddress, source: "multichain" };
  }

  if (input.destinationChainId !== 50) return null;

  const xdcDefaultAddress = validAddress(input.xdcDefaultAddress);
  return xdcDefaultAddress
    ? { address: xdcDefaultAddress, source: "xdc-default" }
    : null;
}
