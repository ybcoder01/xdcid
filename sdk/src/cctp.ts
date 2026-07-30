import {
  getAddress,
  isAddress,
  parseUnits,
  zeroAddress,
  type Address,
  type Hex
} from "viem";

export const CCTP_TESTNET_IRIS_API = "https://iris-api-sandbox.circle.com";
export const CCTP_STANDARD_FINALITY_THRESHOLD = 2_000;
export const CCTP_USDC_DECIMALS = 6;
export const CCTP_MAX_TRANSFER_AMOUNT = 10_000_000n * 10n ** 6n;
export const CCTP_TOKEN_MESSENGER_V2_TESTNET =
  "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as const;
export const CCTP_MESSAGE_TRANSMITTER_V2_TESTNET =
  "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as const;
export const CCTP_TOKEN_MINTER_V2_TESTNET =
  "0xb43db544E2c27092c107639Ad201b3dEfAbcF192" as const;
export const CCTP_ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export type CctpTestnet = {
  key: string;
  name: string;
  chainId: number;
  domain: number;
  usdc: Address;
  tokenMessenger: Address;
  messageTransmitter: Address;
  tokenMinter: Address;
  explorerUrl: string;
};

export const CCTP_TESTNETS = {
  arbitrumSepolia: {
    key: "arbitrumSepolia",
    name: "Arbitrum Sepolia",
    chainId: 421_614,
    domain: 3,
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    tokenMessenger: CCTP_TOKEN_MESSENGER_V2_TESTNET,
    messageTransmitter: CCTP_MESSAGE_TRANSMITTER_V2_TESTNET,
    tokenMinter: CCTP_TOKEN_MINTER_V2_TESTNET,
    explorerUrl: "https://sepolia.arbiscan.io"
  },
  xdcApothem: {
    key: "xdcApothem",
    name: "XDC Apothem",
    chainId: 51,
    domain: 18,
    usdc: "0xb5AB69F7bBada22B28e79C8FFAECe55eF1c771D4",
    tokenMessenger: CCTP_TOKEN_MESSENGER_V2_TESTNET,
    messageTransmitter: CCTP_MESSAGE_TRANSMITTER_V2_TESTNET,
    tokenMinter: CCTP_TOKEN_MINTER_V2_TESTNET,
    explorerUrl: "https://testnet.xdcscan.com"
  }
} as const satisfies Record<string, CctpTestnet>;

export type CctpTestnetKey = keyof typeof CCTP_TESTNETS;

export type CctpErrorCode =
  | "INVALID_DIRECTION"
  | "INVALID_AMOUNT"
  | "INVALID_ADDRESS"
  | "INVALID_MAX_FEE"
  | "INVALID_TRANSACTION_HASH"
  | "INVALID_MESSAGE";

export class CctpTestnetError extends Error {
  readonly code: CctpErrorCode;

  constructor(code: CctpErrorCode, message: string) {
    super(message);
    this.name = "CctpTestnetError";
    this.code = code;
  }
}

export const cctpUsdcAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ type: "bool" }]
  }
] as const;

export const cctpTokenMessengerV2Abi = [
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

export const cctpMessageTransmitterV2Abi = [
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

export type CctpApprovalRequest = {
  chainId: number;
  address: Address;
  abi: typeof cctpUsdcAbi;
  functionName: "approve";
  args: readonly [Address, bigint];
};

export type CctpBurnRequest = {
  chainId: number;
  address: Address;
  abi: typeof cctpTokenMessengerV2Abi;
  functionName: "depositForBurn";
  args: readonly [bigint, number, Hex, Address, Hex, bigint, number];
};

export type CctpReceiveRequest = {
  chainId: number;
  address: Address;
  abi: typeof cctpMessageTransmitterV2Abi;
  functionName: "receiveMessage";
  args: readonly [Hex, Hex];
};

export type CctpBurnPlan = {
  source: (typeof CCTP_TESTNETS)[CctpTestnetKey];
  destination: (typeof CCTP_TESTNETS)[CctpTestnetKey];
  amount: bigint;
  recipient: Address;
  maxFee: bigint;
  approvalRequest: CctpApprovalRequest;
  burnRequest: CctpBurnRequest;
};

export function parseCctpUsdcAmount(value: string): bigint {
  const amount = value.trim();
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(amount)) {
    throw new CctpTestnetError(
      "INVALID_AMOUNT",
      "USDC amount must be a decimal number with no more than 6 decimal places"
    );
  }

  const units = parseUnits(amount, CCTP_USDC_DECIMALS);
  if (units <= 0n) {
    throw new CctpTestnetError("INVALID_AMOUNT", "USDC amount must be greater than zero");
  }
  if (units > CCTP_MAX_TRANSFER_AMOUNT) {
    throw new CctpTestnetError(
      "INVALID_AMOUNT",
      "USDC amount exceeds the CCTP per-transfer limit"
    );
  }
  return units;
}

export function addressToCctpBytes32(value: string): Hex {
  if (!isAddress(value)) {
    throw new CctpTestnetError("INVALID_ADDRESS", "Recipient must be a valid EVM address");
  }
  const address = getAddress(value);
  if (address === zeroAddress) {
    throw new CctpTestnetError("INVALID_ADDRESS", "Recipient must be a non-zero address");
  }
  return ("0x" + address.slice(2).toLowerCase().padStart(64, "0")) as Hex;
}

export function prepareCctpBurn(params: {
  source: CctpTestnetKey;
  destination: CctpTestnetKey;
  amount: string | bigint;
  recipient: string;
  maxFee?: bigint;
}): CctpBurnPlan {
  if (params.source === params.destination) {
    throw new CctpTestnetError(
      "INVALID_DIRECTION",
      "Source and destination CCTP networks must be different"
    );
  }

  const source = CCTP_TESTNETS[params.source];
  const destination = CCTP_TESTNETS[params.destination];
  const amount =
    typeof params.amount === "string" ? parseCctpUsdcAmount(params.amount) : params.amount;
  assertCctpAmount(amount);

  const recipient = normalizeRecipient(params.recipient);
  const maxFee = params.maxFee ?? 0n;
  if (maxFee < 0n || maxFee >= amount) {
    throw new CctpTestnetError(
      "INVALID_MAX_FEE",
      "Maximum fee must be zero or a positive amount smaller than the transfer amount"
    );
  }

  const recipientBytes32 = addressToCctpBytes32(recipient);
  return {
    source,
    destination,
    amount,
    recipient,
    maxFee,
    approvalRequest: {
      chainId: source.chainId,
      address: source.usdc,
      abi: cctpUsdcAbi,
      functionName: "approve",
      args: [source.tokenMessenger, amount]
    },
    burnRequest: {
      chainId: source.chainId,
      address: source.tokenMessenger,
      abi: cctpTokenMessengerV2Abi,
      functionName: "depositForBurn",
      args: [
        amount,
        destination.domain,
        recipientBytes32,
        source.usdc,
        CCTP_ZERO_BYTES32,
        maxFee,
        CCTP_STANDARD_FINALITY_THRESHOLD
      ]
    }
  };
}

export function buildCctpAttestationUrl(
  source: CctpTestnetKey,
  transactionHash: string
): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) {
    throw new CctpTestnetError(
      "INVALID_TRANSACTION_HASH",
      "Transaction hash must be 32-byte hex"
    );
  }
  return CCTP_TESTNET_IRIS_API + "/v2/messages/" + CCTP_TESTNETS[source].domain +
    "?transactionHash=" + transactionHash;
}

export function prepareCctpReceive(
  destination: CctpTestnetKey,
  message: string,
  attestation: string
): CctpReceiveRequest {
  if (!isNonEmptyHexBytes(message) || !isNonEmptyHexBytes(attestation)) {
    throw new CctpTestnetError(
      "INVALID_MESSAGE",
      "CCTP message and attestation must be non-empty byte-aligned hex"
    );
  }
  const network = CCTP_TESTNETS[destination];
  return {
    chainId: network.chainId,
    address: network.messageTransmitter,
    abi: cctpMessageTransmitterV2Abi,
    functionName: "receiveMessage",
    args: [message as Hex, attestation as Hex]
  };
}

function assertCctpAmount(amount: bigint): void {
  if (amount <= 0n || amount > CCTP_MAX_TRANSFER_AMOUNT) {
    throw new CctpTestnetError(
      "INVALID_AMOUNT",
      "USDC amount must be greater than zero and within the CCTP per-transfer limit"
    );
  }
}

function normalizeRecipient(value: string): Address {
  if (!isAddress(value)) {
    throw new CctpTestnetError("INVALID_ADDRESS", "Recipient must be a valid EVM address");
  }
  const address = getAddress(value);
  if (address === zeroAddress) {
    throw new CctpTestnetError("INVALID_ADDRESS", "Recipient must be a non-zero address");
  }
  return address;
}

function isNonEmptyHexBytes(value: string): boolean {
  return /^0x(?:[0-9a-fA-F]{2})+$/.test(value);
}
