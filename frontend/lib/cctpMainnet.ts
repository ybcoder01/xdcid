import {
  getAddress,
  isAddress,
  parseUnits,
  zeroAddress,
  type Address,
  type Hash,
  type Hex
} from "viem";
import {
  CCTP_MESSAGE_TRANSMITTER_V2,
  CCTP_TOKEN_MESSENGER_V2,
  getPaymentNetwork
} from "../config/paymentNetworks";

export const CCTP_MAINNET_IRIS_API = "https://iris-api.circle.com";
export const CCTP_STANDARD_FINALITY_THRESHOLD = 2_000;
export const CCTP_MAX_TRANSFER_AMOUNT = 10_000_000n * 10n ** 6n;
export const CCTP_ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export const mainnetUsdcAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ type: "bool" }]
  }
] as const;

export const mainnetTokenMessengerV2Abi = [
  {
    type: "function",
    name: "depositForBurn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" }
    ],
    outputs: [{ type: "uint64" }]
  }
] as const;

export const mainnetMessageTransmitterV2Abi = [
  {
    type: "function",
    name: "receiveMessage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" }
    ],
    outputs: [{ type: "bool" }]
  }
] as const;

export function parseMainnetUsdcAmount(value: string): bigint {
  const amount = value.trim();
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(amount)) {
    throw new Error("USDC amount must use no more than 6 decimal places");
  }
  const units = parseUnits(amount, 6);
  if (units <= 0n || units > CCTP_MAX_TRANSFER_AMOUNT) {
    throw new Error("USDC amount must be greater than zero and at most 10 million");
  }
  return units;
}

export function addressToBytes32(value: string): Hex {
  if (!isAddress(value)) throw new Error("Recipient must be a valid EVM address");
  const address = getAddress(value);
  if (address === zeroAddress) throw new Error("Recipient must be a non-zero address");
  return ("0x" + address.slice(2).toLowerCase().padStart(64, "0")) as Hex;
}

export function prepareMainnetUsdcTransfer(input: {
  chainId: number;
  amount: string | bigint;
  recipient: string;
}) {
  const network = requireNetwork(input.chainId);
  const amount =
    typeof input.amount === "string"
      ? parseMainnetUsdcAmount(input.amount)
      : validateAmount(input.amount);
  const recipient = requireAddress(input.recipient);

  return {
    chainId: network.chainId,
    address: network.usdcAddress as Address,
    abi: mainnetUsdcAbi,
    functionName: "transfer" as const,
    args: [recipient, amount] as const
  };
}

export function prepareMainnetCctpBurn(input: {
  sourceChainId: number;
  destinationChainId: number;
  amount: string | bigint;
  recipient: string;
}) {
  if (input.sourceChainId === input.destinationChainId) {
    throw new Error("CCTP source and destination networks must be different");
  }

  const source = requireNetwork(input.sourceChainId);
  const destination = requireNetwork(input.destinationChainId);
  const amount =
    typeof input.amount === "string"
      ? parseMainnetUsdcAmount(input.amount)
      : validateAmount(input.amount);
  const recipient = requireAddress(input.recipient);

  return {
    source,
    destination,
    amount,
    recipient,
    approvalRequest: {
      chainId: source.chainId,
      address: source.usdcAddress as Address,
      abi: mainnetUsdcAbi,
      functionName: "approve" as const,
      args: [CCTP_TOKEN_MESSENGER_V2 as Address, amount] as const
    },
    burnRequest: {
      chainId: source.chainId,
      address: CCTP_TOKEN_MESSENGER_V2 as Address,
      abi: mainnetTokenMessengerV2Abi,
      functionName: "depositForBurn" as const,
      args: [
        amount,
        destination.circleDomain,
        addressToBytes32(recipient),
        source.usdcAddress as Address,
        CCTP_ZERO_BYTES32,
        0n,
        CCTP_STANDARD_FINALITY_THRESHOLD
      ] as const
    }
  };
}

export function prepareMainnetCctpReceive(
  destinationChainId: number,
  message: string,
  attestation: string
) {
  const destination = requireNetwork(destinationChainId);
  if (!isHexBytes(message) || !isHexBytes(attestation)) {
    throw new Error("CCTP message and attestation must be non-empty hex bytes");
  }

  return {
    chainId: destination.chainId,
    address: CCTP_MESSAGE_TRANSMITTER_V2 as Address,
    abi: mainnetMessageTransmitterV2Abi,
    functionName: "receiveMessage" as const,
    args: [message as Hex, attestation as Hex] as const
  };
}

export function buildMainnetAttestationUrl(
  sourceChainId: number,
  transactionHash: string
): string {
  const source = requireNetwork(sourceChainId);
  if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) {
    throw new Error("Burn transaction hash must be 32-byte hex");
  }
  return (
    CCTP_MAINNET_IRIS_API +
    "/v2/messages/" +
    source.circleDomain +
    "?transactionHash=" +
    transactionHash
  );
}

export function isCctpTransactionHash(value: string): value is Hash {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function requireNetwork(chainId: number) {
  const network = getPaymentNetwork(chainId);
  if (!network) throw new Error("Unsupported CCTP mainnet");
  return network;
}

function validateAmount(amount: bigint): bigint {
  if (amount <= 0n || amount > CCTP_MAX_TRANSFER_AMOUNT) {
    throw new Error("USDC amount must be greater than zero and at most 10 million");
  }
  return amount;
}

function requireAddress(value: string): Address {
  if (!isAddress(value)) throw new Error("Recipient must be a valid EVM address");
  const address = getAddress(value);
  if (address === zeroAddress) throw new Error("Recipient must be a non-zero address");
  return address;
}

function isHexBytes(value: string): boolean {
  return /^0x(?:[0-9a-fA-F]{2})+$/.test(value);
}
