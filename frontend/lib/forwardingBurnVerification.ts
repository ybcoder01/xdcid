import {
  decodeEventLog,
  getAddress,
  type Address,
  type Hex
} from "viem";

export type CctpTransactionLog = {
  address: string;
  data: Hex;
  topics: readonly Hex[];
};

export const cctpDepositForBurnEventAbi = [
  {
    type: "event",
    name: "DepositForBurn",
    inputs: [
      { name: "burnToken", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "depositor", type: "address", indexed: true },
      { name: "mintRecipient", type: "bytes32", indexed: false },
      { name: "destinationDomain", type: "uint32", indexed: false },
      {
        name: "destinationTokenMessenger",
        type: "bytes32",
        indexed: false
      },
      { name: "destinationCaller", type: "bytes32", indexed: false },
      { name: "maxFee", type: "uint256", indexed: false },
      {
        name: "minFinalityThreshold",
        type: "uint32",
        indexed: true
      },
      { name: "hookData", type: "bytes", indexed: false }
    ]
  }
] as const;

export function hasExactCctpForwardingBurn(
  logs: readonly CctpTransactionLog[],
  input: {
    tokenMessenger: Address;
    burnToken: Address;
    depositor: Address;
    recipientAmount: bigint;
    destinationDomain: number;
    mintRecipient: Hex;
    destinationCaller: Hex;
    minimumFinalityThreshold: number;
    hookData: Hex;
  }
): boolean {
  let matches = 0;

  for (const log of logs) {
    if (
      log.address.toLowerCase() !== input.tokenMessenger.toLowerCase() ||
      log.topics.length === 0
    ) {
      continue;
    }

    try {
      const decoded = decodeEventLog({
        abi: cctpDepositForBurnEventAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
        strict: true
      });
      const args = decoded.args;
      if (
        getAddress(args.burnToken) !== getAddress(input.burnToken) ||
        getAddress(args.depositor) !== getAddress(input.depositor) ||
        args.amount <= args.maxFee ||
        args.amount - args.maxFee !== input.recipientAmount ||
        args.destinationDomain !== input.destinationDomain ||
        args.mintRecipient.toLowerCase() !== input.mintRecipient.toLowerCase() ||
        args.destinationCaller.toLowerCase() !==
          input.destinationCaller.toLowerCase() ||
        args.minFinalityThreshold !== input.minimumFinalityThreshold ||
        args.hookData.toLowerCase() !== input.hookData.toLowerCase()
      ) {
        continue;
      }
      matches += 1;
    } catch {
      continue;
    }
  }

  return matches === 1;
}
