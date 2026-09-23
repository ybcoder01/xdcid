import { getAddress, isAddress, zeroAddress, type Address } from "viem";

export function isNonZeroAddress(value: string | undefined): value is Address {
  return !!value && isAddress(value) && getAddress(value) !== zeroAddress;
}

export function requireNonZeroAddress(value: string, label: string): Address {
  if (!isNonZeroAddress(value)) {
    throw new Error(`${label} must be a non-zero EVM address`);
  }
  return getAddress(value);
}
