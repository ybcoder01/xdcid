import { getAddress, isAddress, parseUnits, zeroAddress, type Address, type Hex } from "viem";

export const CCTP_TESTNET_IRIS_API = "https://iris-api-sandbox.circle.com";
export const CCTP_STANDARD_FINALITY_THRESHOLD = 2_000;
export const CCTP_USDC_DECIMALS = 6;
export const CCTP_MAX_TRANSFER_AMOUNT = 10_000_000n * 10n ** 6n;
export const CCTP_TOKEN_MESSENGER_V2_TESTNET = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as const;
export const CCTP_MESSAGE_TRANSMITTER_V2_TESTNET = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as const;
export const CCTP_TOKEN_MINTER_V2_TESTNET = "0xb43db544E2c27092c107639Ad201b3dEfAbcF192" as const;
export const CCTP_FORWARDING_HOOK_DATA = "0x636374702d666f72776172640000000000000000000000000000000000000000" as const;
export const CCTP_ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

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

const contracts = {
  tokenMessenger: CCTP_TOKEN_MESSENGER_V2_TESTNET,
  messageTransmitter: CCTP_MESSAGE_TRANSMITTER_V2_TESTNET,
  tokenMinter: CCTP_TOKEN_MINTER_V2_TESTNET
} as const;

export const CCTP_TESTNETS = {
  ethereumSepolia: { key: "ethereumSepolia", name: "Ethereum Sepolia", chainId: 11155111, domain: 0, usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", explorerUrl: "https://sepolia.etherscan.io", ...contracts },
  xdcApothem: { key: "xdcApothem", name: "XDC Apothem", chainId: 51, domain: 18, usdc: "0xb5AB69F7bBada22B28e79C8FFAECe55eF1c771D4", explorerUrl: "https://testnet.xdcscan.com", ...contracts },
  polygonAmoy: { key: "polygonAmoy", name: "Polygon Amoy", chainId: 80002, domain: 7, usdc: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", explorerUrl: "https://amoy.polygonscan.com", ...contracts },
  baseSepolia: { key: "baseSepolia", name: "Base Sepolia", chainId: 84532, domain: 6, usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", explorerUrl: "https://sepolia.basescan.org", ...contracts },
  arbitrumSepolia: { key: "arbitrumSepolia", name: "Arbitrum Sepolia", chainId: 421614, domain: 3, usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", explorerUrl: "https://sepolia.arbiscan.io", ...contracts }
} as const satisfies Record<string, CctpTestnet>;

export type CctpTestnetKey = keyof typeof CCTP_TESTNETS;

export class CctpTestnetError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CctpTestnetError";
    this.code = code;
  }
}

export const cctpUsdcAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }
] as const;

export const cctpTokenMessengerV2Abi = [
  { type: "function", name: "depositForBurn", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }, { name: "destinationDomain", type: "uint32" }, { name: "mintRecipient", type: "bytes32" }, { name: "burnToken", type: "address" }, { name: "destinationCaller", type: "bytes32" }, { name: "maxFee", type: "uint256" }, { name: "minFinalityThreshold", type: "uint32" }], outputs: [{ type: "uint64" }] },
  { type: "function", name: "depositForBurnWithHook", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }, { name: "destinationDomain", type: "uint32" }, { name: "mintRecipient", type: "bytes32" }, { name: "burnToken", type: "address" }, { name: "destinationCaller", type: "bytes32" }, { name: "maxFee", type: "uint256" }, { name: "minFinalityThreshold", type: "uint32" }, { name: "hookData", type: "bytes" }], outputs: [] }
] as const;

export const cctpMessageTransmitterV2Abi = [
  { type: "function", name: "receiveMessage", stateMutability: "nonpayable", inputs: [{ name: "message", type: "bytes" }, { name: "attestation", type: "bytes" }], outputs: [{ type: "bool" }] }
] as const;

export function parseCctpUsdcAmount(value: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value.trim())) throw new CctpTestnetError("INVALID_AMOUNT", "USDC amount must use no more than 6 decimal places");
  const amount = parseUnits(value.trim(), CCTP_USDC_DECIMALS);
  assertAmount(amount);
  return amount;
}

export function addressToCctpBytes32(value: string): Hex {
  const address = normalizeAddress(value);
  return ("0x" + address.slice(2).toLowerCase().padStart(64, "0")) as Hex;
}

function requests(source: CctpTestnet, destination: CctpTestnet, amount: bigint, recipient: Address, maxFee: bigint, forwarded: boolean) {
  return {
    approvalRequest: { chainId: source.chainId, address: source.usdc, abi: cctpUsdcAbi, functionName: "approve" as const, args: [source.tokenMessenger, amount] as const },
    burnRequest: forwarded
      ? { chainId: source.chainId, address: source.tokenMessenger, abi: cctpTokenMessengerV2Abi, functionName: "depositForBurnWithHook" as const, args: [amount, destination.domain, addressToCctpBytes32(recipient), source.usdc, CCTP_ZERO_BYTES32, maxFee, CCTP_STANDARD_FINALITY_THRESHOLD, CCTP_FORWARDING_HOOK_DATA] as const }
      : { chainId: source.chainId, address: source.tokenMessenger, abi: cctpTokenMessengerV2Abi, functionName: "depositForBurn" as const, args: [amount, destination.domain, addressToCctpBytes32(recipient), source.usdc, CCTP_ZERO_BYTES32, maxFee, CCTP_STANDARD_FINALITY_THRESHOLD] as const }
  };
}

export function prepareCctpBurn(input: { source: CctpTestnetKey; destination: CctpTestnetKey; amount: string | bigint; recipient: string; maxFee?: bigint }) {
  const { source, destination } = route(input.source, input.destination);
  const amount = typeof input.amount === "string" ? parseCctpUsdcAmount(input.amount) : input.amount;
  assertAmount(amount);
  const recipient = normalizeAddress(input.recipient);
  const maxFee = input.maxFee ?? 0n;
  if (maxFee < 0n || maxFee >= amount) throw new CctpTestnetError("INVALID_MAX_FEE", "Maximum fee must be smaller than the transfer");
  return { source, destination, amount, recipient, maxFee, ...requests(source, destination, amount, recipient, maxFee, false) };
}

export function buildCctpForwardingFeeUrl(sourceKey: CctpTestnetKey, destinationKey: CctpTestnetKey): string {
  const { source, destination } = route(sourceKey, destinationKey);
  return CCTP_TESTNET_IRIS_API + "/v2/burn/USDC/fees/" + source.domain + "/" + destination.domain + "?forward=true";
}

export function parseCctpForwardingQuote(payload: unknown) {
  if (!Array.isArray(payload)) throw new CctpTestnetError("INVALID_QUOTE", "Invalid quote");
  const entry = payload.find((item) => isRecord(item) && item.finalityThreshold === CCTP_STANDARD_FINALITY_THRESHOLD);
  if (!isRecord(entry) || !isRecord(entry.forwardFee)) throw new CctpTestnetError("INVALID_QUOTE", "Standard forwarding is unavailable");
  const raw = entry.forwardFee.med;
  const text = typeof raw === "string" ? raw : Number.isSafeInteger(raw) ? String(raw) : "";
  const minimumFeeBps = typeof entry.minimumFee === "number" ? entry.minimumFee : Number.NaN;
  if (!/^\d+$/.test(text) || !Number.isFinite(minimumFeeBps)) throw new CctpTestnetError("INVALID_QUOTE", "Invalid forwarding fee");
  const forwardFee = BigInt(text);
  if (forwardFee <= 0n || forwardFee > 100_000_000n || minimumFeeBps < 0 || minimumFeeBps > 10_000) throw new CctpTestnetError("INVALID_QUOTE", "Forwarding fee is outside safe limits");
  return { forwardFee, minimumFeeBps };
}

export function calculateCctpProtocolFee(amount: bigint, minimumFeeBps: number): bigint {
  assertAmount(amount);
  if (!Number.isFinite(minimumFeeBps) || minimumFeeBps < 0 || minimumFeeBps > 10_000) throw new CctpTestnetError("INVALID_QUOTE", "Invalid protocol fee");
  return (amount * BigInt(Math.round(minimumFeeBps * 100)) + 999_999n) / 1_000_000n;
}

export function prepareCctpForwardedBurn(input: { source: CctpTestnetKey; destination: CctpTestnetKey; amount: string | bigint; recipient: string; forwardFee: bigint; minimumFeeBps: number }) {
  const { source, destination } = route(input.source, input.destination);
  const recipientAmount = typeof input.amount === "string" ? parseCctpUsdcAmount(input.amount) : input.amount;
  assertAmount(recipientAmount);
  const recipient = normalizeAddress(input.recipient);
  if (input.forwardFee <= 0n || input.forwardFee > 100_000_000n) throw new CctpTestnetError("INVALID_QUOTE", "Forwarding fee is outside safe limits");
  const protocolFee = calculateCctpProtocolFee(recipientAmount, input.minimumFeeBps);
  const maxFee = input.forwardFee + protocolFee;
  const totalBurnAmount = recipientAmount + maxFee;
  assertAmount(totalBurnAmount);
  return { source, destination, recipient, recipientAmount, forwardFee: input.forwardFee, protocolFee, maxFee, totalBurnAmount, ...requests(source, destination, totalBurnAmount, recipient, maxFee, true) };
}

export function buildCctpAttestationUrl(source: CctpTestnetKey, transactionHash: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) throw new CctpTestnetError("INVALID_TRANSACTION_HASH", "Transaction hash must be 32-byte hex");
  return CCTP_TESTNET_IRIS_API + "/v2/messages/" + CCTP_TESTNETS[source].domain + "?transactionHash=" + transactionHash;
}

export function prepareCctpReceive(destination: CctpTestnetKey, message: string, attestation: string) {
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(message) || !/^0x(?:[0-9a-fA-F]{2})+$/.test(attestation)) throw new CctpTestnetError("INVALID_MESSAGE", "Message and attestation must be hex bytes");
  const network = CCTP_TESTNETS[destination];
  return { chainId: network.chainId, address: network.messageTransmitter, abi: cctpMessageTransmitterV2Abi, functionName: "receiveMessage" as const, args: [message as Hex, attestation as Hex] as const };
}

function route(sourceKey: CctpTestnetKey, destinationKey: CctpTestnetKey) {
  if (sourceKey === destinationKey) throw new CctpTestnetError("INVALID_DIRECTION", "Source and destination must be different");
  return { source: CCTP_TESTNETS[sourceKey], destination: CCTP_TESTNETS[destinationKey] };
}

function assertAmount(amount: bigint) {
  if (amount <= 0n || amount > CCTP_MAX_TRANSFER_AMOUNT) throw new CctpTestnetError("INVALID_AMOUNT", "USDC amount is outside the supported range");
}

function normalizeAddress(value: string): Address {
  if (!isAddress(value)) throw new CctpTestnetError("INVALID_ADDRESS", "Invalid recipient");
  const address = getAddress(value);
  if (address === zeroAddress) throw new CctpTestnetError("INVALID_ADDRESS", "Invalid recipient");
  return address;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
