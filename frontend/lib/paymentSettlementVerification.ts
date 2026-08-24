import {
  createPublicClient,
  defineChain,
  fallback,
  getAddress,
  http,
  keccak256,
  stringToHex,
  type Address,
  type Hash,
  type Log
} from "viem";
import {
  CCTP_TOKEN_MESSENGER_V2,
  getPaymentNetwork,
  type PaymentNetwork
} from "../config/paymentNetworks";

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
  const payer = getAddress(sourceTransaction.from);
  const recipient = getAddress(input.recipient);

  if (input.token === "NATIVE") {
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
    return { payer, sourceTransactionHash: input.sourceTransactionHash };
  }

  if (input.token !== "USDC") throw new Error("Unsupported settlement token");

  if (source.chainId === destination.chainId) {
    if (!hasTransfer(sourceReceipt.logs, source.usdcAddress, payer, recipient, input.amountAtomic, true)) {
      throw new Error("USDC transfer does not match the payment");
    }
    return { payer, sourceTransactionHash: input.sourceTransactionHash };
  }

  if (
    !sourceTransaction.to ||
    getAddress(sourceTransaction.to) !== getAddress(CCTP_TOKEN_MESSENGER_V2)
  ) {
    throw new Error("Source transaction is not a CCTP burn");
  }
  if (!hasTransfer(sourceReceipt.logs, source.usdcAddress, payer, undefined, input.amountAtomic, false)) {
    throw new Error("CCTP burn amount does not cover the payment");
  }
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
    payer,
    sourceTransactionHash: input.sourceTransactionHash,
    destinationTransactionHash: input.destinationTransactionHash
  };
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
  const tokenAddress = getAddress(token);
  return logs.some((log) => {
    if (getAddress(log.address) !== tokenAddress || log.topics[0] !== TRANSFER_TOPIC) {
      return false;
    }
    if (log.topics.length < 3 || !log.topics[1] || !log.topics[2]) return false;
    const from = topicAddress(log.topics[1]);
    const to = topicAddress(log.topics[2]);
    const amount = BigInt(log.data || "0x0");
    return (
      (!expectedFrom || from === getAddress(expectedFrom)) &&
      (!expectedTo || to === getAddress(expectedTo)) &&
      (exactAmount ? amount === expectedAmount : amount >= expectedAmount)
    );
  });
}

function topicAddress(topic: string): Address {
  return getAddress(("0x" + topic.slice(-40)) as Address);
}
