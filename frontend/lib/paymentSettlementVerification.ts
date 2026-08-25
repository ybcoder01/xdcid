import {
  createPublicClient,
  decodeEventLog,
  defineChain,
  fallback,
  getAddress,
  http,
  keccak256,
  padHex,
  stringToHex,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
  type Log
} from "viem";
import {
  CCTP_TOKEN_MESSENGER_V2,
  getPaymentNetwork,
  type PaymentNetwork
} from "../config/paymentNetworks";
import { cctpDepositForBurnEventAbi } from "./forwardingBurnVerification";

const TRANSFER_TOPIC = keccak256(stringToHex("Transfer(address,address,uint256)"));

const RPC_URLS: Record<number, readonly string[]> = {
  1: ["https://rpc.mevblocker.io", "https://rpc.mevblocker.io/fullprivacy"],
  50: ["https://rpc.xdcrpc.com", "https://earpc.xinfin.network"],
  137: ["https://polygon.drpc.org", "https://polygon.publicnode.com"],
  8453: ["https://mainnet.base.org", "https://base-rpc.publicnode.com"],
  42161: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"],
  51: ["https://erpc.apothem.network", "https://rpc.apothem.network"],
  11155111: ["https://ethereum-sepolia-rpc.publicnode.com", "https://rpc.sepolia.org"],
  80002: ["https://rpc-amoy.polygon.technology", "https://polygon-amoy-bor-rpc.publicnode.com"],
  84532: ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"],
  421614: ["https://sepolia-rollup.arbitrum.io/rpc", "https://arbitrum-sepolia-rpc.publicnode.com"]
};

export type SettlementVerificationInput = {
  sourceChainId: number;
  destinationChainId: number;
  token: string;
  amountAtomic: bigint;
  recipient: Address;
  sourceTransactionHash: Hash;
  destinationTransactionHash?: Hash;
  circleFeeAtomic: bigint;
};

export type VerifiedSettlement = {
  payer: Address;
  sourceTransactionHash: Hash;
  destinationTransactionHash?: Hash;
};

export async function verifySettlement(
  input: SettlementVerificationInput
): Promise<VerifiedSettlement> {
  const source = requiredNetwork(input.sourceChainId);
  const destination = requiredNetwork(input.destinationChainId);
  if (input.amountAtomic <= 0n) throw new Error("Payment amount must be positive");

  const sourceClient = clientFor(source);
  const [sourceReceipt, sourceTransaction] = await Promise.all([
    sourceClient.getTransactionReceipt({ hash: input.sourceTransactionHash }),
    sourceClient.getTransaction({ hash: input.sourceTransactionHash })
  ]);
  if (sourceReceipt.status !== "success") throw new Error("Source transaction failed");
  const recipient = getAddress(input.recipient);

  if (input.token === "NATIVE") {
    const payer = getAddress(sourceTransaction.from);
    if (source.chainId !== destination.chainId) {
      throw new Error("Native cross-chain settlement is unsupported");
    }
    if (
      !sourceTransaction.to ||
      getAddress(sourceTransaction.to) !== recipient ||
      sourceTransaction.value !== input.amountAtomic
    ) {
      throw new Error("Native transfer does not match the payment");
    }
    return {
      payer,
      sourceTransactionHash: input.sourceTransactionHash,
      circleFeeAtomic: 0n
    };
  }

  if (input.token !== "USDC") throw new Error("Unsupported settlement token");

  if (source.chainId === destination.chainId) {
    const payer = findUniqueUsdcTransferPayer(
      sourceReceipt.logs,
      source.usdcAddress,
      recipient,
      input.amountAtomic
    );
    if (!payer) throw new Error("USDC transfer does not match the payment");
    return {
      payer,
      sourceTransactionHash: input.sourceTransactionHash,
      circleFeeAtomic: 0n
    };
  }

  const deposit = findUniqueCctpDeposit(sourceReceipt.logs, {
    tokenMessenger: CCTP_TOKEN_MESSENGER_V2,
    burnToken: source.usdcAddress,
    recipient,
    recipientAmount: input.amountAtomic,
    destinationDomain: destination.circleDomain
  });
  if (!deposit) throw new Error("Source transaction is not a matching CCTP burn");
  if (!input.destinationTransactionHash) {
    throw new Error("Completed cross-chain settlement requires a destination transaction");
  }

  const destinationReceipt = await clientFor(destination).getTransactionReceipt({
    hash: input.destinationTransactionHash
  });
  if (destinationReceipt.status !== "success") {
    throw new Error("Destination transaction failed");
  }
  if (!hasTransfer(destinationReceipt.logs, destination.usdcAddress, undefined, recipient, input.amountAtomic, true)) {
    throw new Error("Destination USDC mint does not match the payment");
  }
  return {
    payer: deposit.depositor,
    sourceTransactionHash: input.sourceTransactionHash,
    destinationTransactionHash: input.destinationTransactionHash,
    circleFeeAtomic: deposit.amount - input.amountAtomic
  };
}

export function findUniqueUsdcTransferPayer(
  logs: readonly Log[],
  token: Address,
  recipient: Address,
  amount: bigint
): Address | undefined {
  const matches = matchingTransfers(logs, token, undefined, recipient, amount, true)
    .filter((match) => match.from !== zeroAddress);
  if (matches.length !== 1) return undefined;
  return matches[0].from;
}

export function findUniqueCctpDepositor(
  logs: readonly Log[],
  input: {
    tokenMessenger: Address;
    burnToken: Address;
    recipient: Address;
    recipientAmount: bigint;
    destinationDomain: number;
  }
): Address | undefined {
  return findUniqueCctpDeposit(logs, input)?.depositor;
}

export function findUniqueCctpDeposit(
  logs: readonly Log[],
  input: {
    tokenMessenger: Address;
    burnToken: Address;
    recipient: Address;
    recipientAmount: bigint;
    destinationDomain: number;
  }
): { depositor: Address; amount: bigint; maxFee: bigint } | undefined {
  const expectedRecipient = padHex(input.recipient, { size: 32 }).toLowerCase();
  const deposits: Array<{ depositor: Address; amount: bigint; maxFee: bigint }> = [];
  for (const log of logs) {
    if (
      getAddress(log.address) !== getAddress(input.tokenMessenger) ||
      !log.topics[0]
    ) continue;
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
        args.amount < input.recipientAmount ||
        args.destinationDomain !== input.destinationDomain ||
        args.mintRecipient.toLowerCase() !== expectedRecipient
      ) continue;
      const depositor = getAddress(args.depositor);
      if (depositor !== zeroAddress) {
        deposits.push({
          depositor,
          amount: args.amount,
          maxFee: args.maxFee
        });
      }
    } catch {
      continue;
    }
  }
  return deposits.length === 1 ? deposits[0] : undefined;
}

function requiredNetwork(chainId: number): PaymentNetwork {
  const network = getPaymentNetwork(chainId);
  if (!network) throw new Error("Unsupported payment network");
  return network;
}

function clientFor(network: PaymentNetwork) {
  const urls = RPC_URLS[network.chainId];
  if (!urls?.length) throw new Error("Settlement RPC is unavailable");
  const chain = defineChain({
    id: network.chainId,
    name: network.name,
    nativeCurrency: {
      name: network.nativeSymbol,
      symbol: network.nativeSymbol,
      decimals: 18
    },
    rpcUrls: { default: { http: [...urls] } }
  });
  return createPublicClient({
    chain,
    transport: fallback(urls.map((url) => http(url, {
      timeout: 8_000,
      retryCount: 1
    })))
  });
}

function hasTransfer(
  logs: readonly Log[],
  token: Address,
  expectedFrom: Address | undefined,
  expectedTo: Address | undefined,
  expectedAmount: bigint,
  exactAmount: boolean
): boolean {
  return matchingTransfers(
    logs,
    token,
    expectedFrom,
    expectedTo,
    expectedAmount,
    exactAmount
  ).length > 0;
}

function matchingTransfers(
  logs: readonly Log[],
  token: Address,
  expectedFrom: Address | undefined,
  expectedTo: Address | undefined,
  expectedAmount: bigint,
  exactAmount: boolean
): Array<{ from: Address; to: Address; amount: bigint }> {
  const tokenAddress = getAddress(token);
  const matches: Array<{ from: Address; to: Address; amount: bigint }> = [];
  for (const log of logs) {
    if (getAddress(log.address) !== tokenAddress || log.topics[0] !== TRANSFER_TOPIC) {
      continue;
    }
    if (log.topics.length < 3 || !log.topics[1] || !log.topics[2]) continue;
    const from = topicAddress(log.topics[1]);
    const to = topicAddress(log.topics[2]);
    const amount = BigInt(log.data || "0x0");
    if (
      (!expectedFrom || from === getAddress(expectedFrom)) &&
      (!expectedTo || to === getAddress(expectedTo)) &&
      (exactAmount ? amount === expectedAmount : amount >= expectedAmount)
    ) {
      matches.push({ from, to, amount });
    }
  }
  return matches;
}

function topicAddress(topic: string): Address {
  return getAddress(("0x" + topic.slice(-40)) as Address);
}
