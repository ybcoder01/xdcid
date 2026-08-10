import {
  createPublicClient,
  decodeFunctionData,
  fallback,
  getAddress,
  http,
  type Address,
  type Hash,
  type Hex
} from "viem";
import {
  CCTP_FORWARDING_HOOK_DATA,
  CCTP_STANDARD_FINALITY_THRESHOLD,
  CCTP_ZERO_BYTES32,
  XDCID_FEE_RECIPIENT,
  addressToBytes32,
  calculateXdcidConvenienceFee,
  isCctpTransactionHash,
  mainnetTokenMessengerV2Abi,
  mainnetUsdcAbi
} from "../../../../lib/cctpMainnet";
import {
  FORWARDING_RECOVERY_TTL_SECONDS,
  parseForwardingRecoveryInput,
  recoveryRecordMatches,
  type ForwardingRecoveryInput,
  type ForwardingRecoveryRecord
} from "../../../../lib/forwardingRecovery";
import {
  checkForwardingRecoveryStore,
  createForwardingRecoveryRecord,
  getForwardingRecoveryRecord,
  getForwardingRecoveryUse,
  isForwardingRecoveryStoreConfigured,
  markForwardingRecoveryUsed
} from "../../../../lib/forwardingRecoveryStore";
import {
  CCTP_TOKEN_MESSENGER_V2,
  getPaymentNetwork
} from "../../../../config/paymentNetworks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isForwardingRecoveryStoreConfigured()) {
    return Response.json(
      { configured: false, error: "Forwarding recovery is not configured" },
      { status: 503, headers: noStoreHeaders() }
    );
  }

  const requestUrl = new URL(request.url);
  const feeTransactionHash =
    requestUrl.searchParams.get("feeTransactionHash")?.trim() || "";
  if (!feeTransactionHash) {
    try {
      await checkForwardingRecoveryStore();
      return Response.json(
        { configured: true },
        { headers: noStoreHeaders() }
      );
    } catch {
      return storageUnavailable();
    }
  }
  if (!isCctpTransactionHash(feeTransactionHash)) {
    return Response.json(
      { error: "Fee transaction hash must be 32-byte hex" },
      { status: 400, headers: noStoreHeaders() }
    );
  }

  try {
    const [record, burnTransactionHash] = await Promise.all([
      getForwardingRecoveryRecord(feeTransactionHash),
      getForwardingRecoveryUse(feeTransactionHash)
    ]);
    if (!record) {
      return Response.json(
        { error: "No recovery record was found" },
        { status: 404, headers: noStoreHeaders() }
      );
    }
    return Response.json(
      {
        record,
        status: burnTransactionHash ? "used" : "available",
        burnTransactionHash
      },
      { headers: noStoreHeaders() }
    );
  } catch {
    return storageUnavailable();
  }
}

export async function POST(request: Request) {
  if (!isForwardingRecoveryStoreConfigured()) {
    return storageUnavailable();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Recovery request must be valid JSON" },
      { status: 400, headers: noStoreHeaders() }
    );
  }
  if (!isRecord(body) || (body.action !== "register" && body.action !== "consume")) {
    return Response.json(
      { error: "Recovery action must be register or consume" },
      { status: 400, headers: noStoreHeaders() }
    );
  }

  let input: ForwardingRecoveryInput;
  try {
    input = parseForwardingRecoveryInput(body);
  } catch (cause) {
    return Response.json(
      { error: readError(cause) },
      { status: 400, headers: noStoreHeaders() }
    );
  }

  try {
    if (body.action === "register") {
      return await registerRecovery(input);
    }
    const burnTransactionHash =
      typeof body.burnTransactionHash === "string"
        ? body.burnTransactionHash.trim()
        : "";
    if (!isCctpTransactionHash(burnTransactionHash)) {
      return Response.json(
        { error: "Burn transaction hash must be 32-byte hex" },
        { status: 400, headers: noStoreHeaders() }
      );
    }
    return await consumeRecovery(input, burnTransactionHash);
  } catch (cause) {
    const message = readError(cause);
    const status =
      message.includes("temporarily unavailable") ||
      message.includes("storage")
        ? 503
        : 400;
    return Response.json(
      { error: message },
      { status, headers: noStoreHeaders() }
    );
  }
}

async function registerRecovery(input: ForwardingRecoveryInput) {
  const payer = await verifyFeeTransaction(input);
  const existing = await getForwardingRecoveryRecord(
    input.feeTransactionHash
  );
  if (existing) {
    if (!recoveryRecordMatches(existing, input) || existing.payer !== payer) {
      return Response.json(
        { error: "This fee transaction is registered for different transfer details" },
        { status: 409, headers: noStoreHeaders() }
      );
    }
    const burnTransactionHash = await getForwardingRecoveryUse(
      input.feeTransactionHash
    );
    return Response.json(
      {
        record: existing,
        status: burnTransactionHash ? "used" : "available",
        burnTransactionHash
      },
      { headers: noStoreHeaders() }
    );
  }

  const createdAt = new Date();
  const record: ForwardingRecoveryRecord = {
    version: 1,
    feeTransactionHash: input.feeTransactionHash,
    sourceChainId: input.sourceChainId,
    payer,
    recipientAmount: input.recipientAmount.toString(),
    convenienceFeeAmount: calculateXdcidConvenienceFee(input.recipientAmount).toString(),
    recipient: input.recipient,
    destinationChainId: input.destinationChainId,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(
      createdAt.getTime() + FORWARDING_RECOVERY_TTL_SECONDS * 1_000
    ).toISOString()
  };
  const created = await createForwardingRecoveryRecord(record);
  if (!created) {
    const concurrent = await getForwardingRecoveryRecord(
      input.feeTransactionHash
    );
    if (!concurrent || !recoveryRecordMatches(concurrent, input)) {
      return Response.json(
        { error: "This fee transaction was registered by another request" },
        { status: 409, headers: noStoreHeaders() }
      );
    }
    return Response.json(
      { record: concurrent, status: "available", burnTransactionHash: null },
      { headers: noStoreHeaders() }
    );
  }

  return Response.json(
    { record, status: "available", burnTransactionHash: null },
    { status: 201, headers: noStoreHeaders() }
  );
}

async function consumeRecovery(
  input: ForwardingRecoveryInput,
  burnTransactionHash: Hash
) {
  const record = await getForwardingRecoveryRecord(
    input.feeTransactionHash
  );
  if (!record || !recoveryRecordMatches(record, input)) {
    return Response.json(
      { error: "Register and verify the fee transaction before consuming recovery" },
      { status: 404, headers: noStoreHeaders() }
    );
  }

  await verifyForwardedBurn(record, burnTransactionHash);
  const result = await markForwardingRecoveryUsed(
    input.feeTransactionHash,
    burnTransactionHash
  );
  if (result === "conflict") {
    const existingBurn = await getForwardingRecoveryUse(
      input.feeTransactionHash
    );
    return Response.json(
      {
        error: "This fee transaction was already used for another burn",
        burnTransactionHash: existingBurn
      },
      { status: 409, headers: noStoreHeaders() }
    );
  }

  return Response.json(
    {
      record,
      status: "used",
      burnTransactionHash
    },
    { headers: noStoreHeaders() }
  );
}

async function verifyFeeTransaction(
  input: ForwardingRecoveryInput
): Promise<Address> {
  const network = getPaymentNetwork(input.sourceChainId);
  if (!network) throw new Error("Payment source network is unavailable");
  const client = getPaymentClient(input.sourceChainId);
  const [transaction, receipt] = await Promise.all([
    client.getTransaction({ hash: input.feeTransactionHash }),
    client.getTransactionReceipt({ hash: input.feeTransactionHash })
  ]);
  if (
    receipt.status !== "success" ||
    !transaction.to ||
    getAddress(transaction.to) !== getAddress(network.usdcAddress)
  ) {
    throw new Error("Fee transaction is not a successful source-network USDC transfer");
  }

  const decoded = decodeFunctionData({
    abi: mainnetUsdcAbi,
    data: transaction.input
  });
  const args = decoded.args as readonly unknown[];
  if (
    decoded.functionName !== "transfer" ||
    typeof args[0] !== "string" ||
    typeof args[1] !== "bigint" ||
    getAddress(args[0]) !== getAddress(XDCID_FEE_RECIPIENT) ||
    args[1] !== calculateXdcidConvenienceFee(input.recipientAmount)
  ) {
    throw new Error("Fee transaction does not match the XDCID convenience fee");
  }
  return getAddress(transaction.from);
}

async function verifyForwardedBurn(
  record: ForwardingRecoveryRecord,
  burnTransactionHash: Hash
): Promise<void> {
  const source = getPaymentNetwork(record.sourceChainId);
  const destination = getPaymentNetwork(record.destinationChainId);
  if (!source || !destination) {
    throw new Error("Recovery route is no longer supported");
  }

  const client = getPaymentClient(record.sourceChainId);
  const [transaction, receipt] = await Promise.all([
    client.getTransaction({ hash: burnTransactionHash }),
    client.getTransactionReceipt({ hash: burnTransactionHash })
  ]);
  if (
    receipt.status !== "success" ||
    !transaction.to ||
    getAddress(transaction.to) !== getAddress(CCTP_TOKEN_MESSENGER_V2) ||
    getAddress(transaction.from) !== getAddress(record.payer)
  ) {
    throw new Error("Burn transaction does not match the recovery payer");
  }

  const decoded = decodeFunctionData({
    abi: mainnetTokenMessengerV2Abi,
    data: transaction.input
  });
  if (decoded.functionName !== "depositForBurnWithHook") {
    throw new Error("Recovery burn must use Circle forwarding");
  }
  const args = decoded.args as readonly unknown[];
  const [
    totalBurnAmount,
    destinationDomain,
    mintRecipient,
    burnToken,
    destinationCaller,
    maxFee,
    minimumFinalityThreshold,
    hookData
  ] = args;
  const recipientAmount = BigInt(record.recipientAmount);
  if (
    typeof totalBurnAmount !== "bigint" ||
    typeof maxFee !== "bigint" ||
    totalBurnAmount <= maxFee ||
    totalBurnAmount - maxFee !== recipientAmount ||
    Number(destinationDomain) !== destination.circleDomain ||
    mintRecipient !== addressToBytes32(record.recipient) ||
    typeof burnToken !== "string" ||
    getAddress(burnToken) !== getAddress(source.usdcAddress) ||
    destinationCaller !== CCTP_ZERO_BYTES32 ||
    Number(minimumFinalityThreshold) !== CCTP_STANDARD_FINALITY_THRESHOLD ||
    hookData !== CCTP_FORWARDING_HOOK_DATA
  ) {
    throw new Error("Burn transaction does not match the recovery details");
  }
}

const PAYMENT_RPC_CONFIG: Record<
  number,
  { environment: string; fallbackUrls: string }
> = {
  1: {
    environment: "ETHEREUM_RPC_URLS",
    fallbackUrls: "https://ethereum-rpc.publicnode.com"
  },
  50: {
    environment: "XDC_RPC_URLS",
    fallbackUrls: "https://rpc.xdcrpc.com,https://earpc.xinfin.network"
  },
  137: {
    environment: "POLYGON_RPC_URLS",
    fallbackUrls: "https://polygon-bor-rpc.publicnode.com"
  },
  8453: {
    environment: "BASE_RPC_URLS",
    fallbackUrls: "https://base-rpc.publicnode.com"
  },
  42161: {
    environment: "ARBITRUM_RPC_URLS",
    fallbackUrls: "https://arbitrum-one-rpc.publicnode.com"
  }
};

function getPaymentClient(chainId: number) {
  const config = PAYMENT_RPC_CONFIG[chainId];
  if (!config) throw new Error("Payment source RPC is unavailable");
  const urls = (process.env[config.environment] || config.fallbackUrls)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const timeout = Number(process.env.PAYMENT_RPC_TIMEOUT_MS || 3_500);
  return createPublicClient({
    transport: fallback(
      urls.map((url) =>
        http(url, {
          timeout,
          retryCount: 0
        })
      )
    )
  });
}

function storageUnavailable() {
  return Response.json(
    { error: "Forwarding recovery is temporarily unavailable" },
    { status: 503, headers: noStoreHeaders() }
  );
}

function noStoreHeaders() {
  return { "cache-control": "no-store" };
}

function readError(cause: unknown): string {
  if (cause instanceof Error && cause.message) return cause.message;
  return "Forwarding recovery request failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
