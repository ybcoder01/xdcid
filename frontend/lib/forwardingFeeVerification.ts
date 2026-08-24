import {
  getAddress,
  zeroAddress,
  type Address,
  type Hex
} from "viem";

export const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;

export type Erc20TransactionLog = {
  address: string;
  data: Hex;
  topics: readonly Hex[];
};

export function findExactUsdcTransferPayer(
  logs: readonly Erc20TransactionLog[],
  input: {
    usdcAddress: Address;
    feeRecipient: Address;
    feeAmount: bigint;
  }
): Address | null {
  const matches: Address[] = [];

  for (const log of logs) {
    if (
      log.address.toLowerCase() !== input.usdcAddress.toLowerCase() ||
      log.topics.length !== 3 ||
      log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC
    ) {
      continue;
    }

    const payer = topicAddress(log.topics[1]);
    const recipient = topicAddress(log.topics[2]);
    const amount = uint256(log.data);
    if (
      !payer ||
      payer === zeroAddress ||
      !recipient ||
      recipient.toLowerCase() !== input.feeRecipient.toLowerCase() ||
      amount !== input.feeAmount
    ) {
      continue;
    }
    matches.push(payer);
  }

  return matches.length === 1 ? matches[0] : null;
}

function topicAddress(topic: Hex | undefined): Address | null {
  if (!topic || !/^0x[0-9a-fA-F]{64}$/.test(topic)) return null;
  try {
    return getAddress(("0x" + topic.slice(-40)) as Address);
  } catch {
    return null;
  }
}

function uint256(data: Hex): bigint | null {
  if (!/^0x[0-9a-fA-F]{64}$/.test(data)) return null;
  try {
    return BigInt(data);
  } catch {
    return null;
  }
}
