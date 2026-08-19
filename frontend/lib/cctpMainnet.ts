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
  CCTP_IRIS_API,
  CCTP_MESSAGE_TRANSMITTER_V2,
  CCTP_TOKEN_MESSENGER_V2,
  getPaymentNetwork
} from "../config/paymentNetworks";

export const CCTP_MAINNET_IRIS_API = CCTP_IRIS_API;
export const CCTP_STANDARD_FINALITY_THRESHOLD = 2_000;
export const CCTP_FORWARDING_HOOK_DATA =
  "0x636374702d666f72776172640000000000000000000000000000000000000000" as const;
export const XDC_MAINNET_CHAIN_ID = 50;
export const XDCID_CONVENIENCE_FEE_BPS = 10n;
export const XDCID_MIN_CONVENIENCE_FEE = 100_000n;
export const XDCID_MAX_CONVENIENCE_FEE = 5_000_000n;
export const XDCID_FEE_RECIPIENT =
  "0xe82a4267CC310FC6Db334601671A043DFc8Ce06A" as const;
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
  },
  {
    type: "function",
    name: "depositForBurnWithHook",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
      { name: "hookData", type: "bytes" }
    ],
    outputs: []
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

export function calculateXdcidConvenienceFee(amount: bigint): bigint {
  const checkedAmount = validateAmount(amount);
  const percentageFee =
    (checkedAmount * XDCID_CONVENIENCE_FEE_BPS + 9_999n) / 10_000n;
  if (percentageFee < XDCID_MIN_CONVENIENCE_FEE) {
    return XDCID_MIN_CONVENIENCE_FEE;
  }
  if (percentageFee > XDCID_MAX_CONVENIENCE_FEE) {
    return XDCID_MAX_CONVENIENCE_FEE;
  }
  return percentageFee;
}

export function calculateCctpProtocolFee(
  amount: bigint,
  minimumFeeBps: number
): bigint {
  const checkedAmount = validateAmount(amount);
  if (
    !Number.isFinite(minimumFeeBps) ||
    minimumFeeBps < 0 ||
    minimumFeeBps > 10_000
  ) {
    throw new Error("Circle returned an invalid protocol fee");
  }
  const hundredthBasisPoints = BigInt(Math.round(minimumFeeBps * 100));
  return (checkedAmount * hundredthBasisPoints + 999_999n) / 1_000_000n;
}

export function buildMainnetForwardingFeeUrl(
  sourceChainId: number,
  destinationChainId: number
): string {
  const source = requireNetwork(sourceChainId);
  const destination = requireNetwork(destinationChainId);
  if (source.chainId === destination.chainId) {
    throw new Error("Forwarding requires different source and destination networks");
  }
  return (
    CCTP_MAINNET_IRIS_API +
    "/v2/burn/USDC/fees/" +
    source.circleDomain +
    "/" +
    destination.circleDomain +
    "?forward=true"
  );
}

export function parseMainnetForwardingQuote(payload: unknown): {
  forwardFee: bigint;
  minimumFeeBps: number;
} {
  if (!Array.isArray(payload)) {
    throw new Error("Circle returned an invalid forwarding quote");
  }
  const entry = payload.find(
    (value) =>
      isRecord(value) &&
      value.finalityThreshold === CCTP_STANDARD_FINALITY_THRESHOLD
  );
  if (!isRecord(entry) || !isRecord(entry.forwardFee)) {
    throw new Error("Circle did not return a Standard forwarding quote");
  }

  const rawForwardFee = entry.forwardFee.med;
  const forwardFeeText =
    typeof rawForwardFee === "number" && Number.isSafeInteger(rawForwardFee)
      ? String(rawForwardFee)
      : typeof rawForwardFee === "string"
        ? rawForwardFee
        : "";
  if (!/^\d+$/.test(forwardFeeText)) {
    throw new Error("Circle returned an invalid forwarding fee");
  }
  const forwardFee = BigInt(forwardFeeText);
  if (forwardFee <= 0n || forwardFee > 100_000_000n) {
    throw new Error("Circle forwarding fee is outside the supported range");
  }

  const minimumFeeBps =
    typeof entry.minimumFee === "number" ? entry.minimumFee : Number.NaN;
  if (!Number.isFinite(minimumFeeBps) || minimumFeeBps < 0) {
    throw new Error("Circle returned an invalid protocol fee");
  }
  return { forwardFee, minimumFeeBps };
}

export function prepareXdcidConvenienceFeeTransfer(
  sourceChainId: number,
  amount: bigint
) {
  const source = requireNetwork(sourceChainId);
  return {
    chainId: source.chainId,
    address: source.usdcAddress as Address,
    abi: mainnetUsdcAbi,
    functionName: "transfer" as const,
    args: [
      XDCID_FEE_RECIPIENT as Address,
      calculateXdcidConvenienceFee(amount)
    ] as const
  };
}

export function prepareMainnetCctpForwardedBurn(input: {
  sourceChainId: number;
  destinationChainId: number;
  amount: string | bigint;
  recipient: string;
  forwardFee: bigint;
  minimumFeeBps: number;
}) {
  const source = requireNetwork(input.sourceChainId);
  const destination = requireNetwork(input.destinationChainId);
  if (source.chainId === destination.chainId) {
    throw new Error("Forwarding requires different source and destination networks");
  }

  const recipientAmount =
    typeof input.amount === "string"
      ? parseMainnetUsdcAmount(input.amount)
      : validateAmount(input.amount);
  const recipient = requireAddress(input.recipient);
  if (input.forwardFee <= 0n || input.forwardFee > 100_000_000n) {
    throw new Error("Circle forwarding fee is outside the supported range");
  }
  const protocolFee = calculateCctpProtocolFee(
    recipientAmount,
    input.minimumFeeBps
  );
  const maxFee = input.forwardFee + protocolFee;
  const totalBurnAmount = recipientAmount + maxFee;
  if (totalBurnAmount > CCTP_MAX_TRANSFER_AMOUNT) {
    throw new Error("USDC amount plus forwarding fees exceeds the CCTP limit");
  }

  return {
    source,
    destination,
    recipient,
    recipientAmount,
    forwardFee: input.forwardFee,
    protocolFee,
    maxFee,
    totalBurnAmount,
    approvalRequest: {
      chainId: source.chainId,
      address: source.usdcAddress as Address,
      abi: mainnetUsdcAbi,
      functionName: "approve" as const,
      args: [CCTP_TOKEN_MESSENGER_V2 as Address, totalBurnAmount] as const
    },
    burnRequest: {
      chainId: source.chainId,
      address: CCTP_TOKEN_MESSENGER_V2 as Address,
      abi: mainnetTokenMessengerV2Abi,
      functionName: "depositForBurnWithHook" as const,
      args: [
        totalBurnAmount,
        destination.circleDomain,
        addressToBytes32(recipient),
        source.usdcAddress as Address,
        CCTP_ZERO_BYTES32,
        maxFee,
        CCTP_STANDARD_FINALITY_THRESHOLD,
        CCTP_FORWARDING_HOOK_DATA
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHexBytes(value: string): boolean {
  return /^0x(?:[0-9a-fA-F]{2})+$/.test(value);
}
