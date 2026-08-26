import { getAddress, isAddress, recoverMessageAddress, type Hash } from "viem";
import {
  activateArchivePurchase,
  createArchivePurchaseChallenge,
  getArchivePurchaseChallenge,
  normalizeArchivePlanYears
} from "../../../lib/archiveSubscriptionPurchases";
import { archivePlanQuotes, getHistoryAccessPolicy } from "../../../lib/historyAccessPolicy";
import { verifySettlement } from "../../../lib/paymentSettlementVerification";
import {
  PAYMENT_NETWORK_ENV,
  TESTNET_PAYMENT_NETWORKS,
  MAINNET_PAYMENT_NETWORKS
} from "../../../config/paymentNetworks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const configuration = await archiveCheckoutConfiguration();
    return json(configuration);
  } catch {
    return json({ error: "Archive subscription configuration is unavailable" }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!isAddress(String(body.wallet || ""))) {
      return json({ error: "A valid purchasing wallet is required" }, 400);
    }
    const planYears = normalizeArchivePlanYears(body.planYears);
    const configuration = await archiveCheckoutConfiguration();
    if (!configuration.salesEnabled) {
      return json({ error: "Archive subscription sales are not enabled" }, 409);
    }
    const plan = configuration.plans.find((candidate) => candidate.years === planYears);
    if (!plan?.payableUsdMicros) {
      return json({ error: "Archive plan pricing is unavailable" }, 409);
    }
    const challenge = await createArchivePurchaseChallenge({
      wallet: String(body.wallet),
      planYears,
      amountAtomic: BigInt(plan.payableUsdMicros),
      chainId: configuration.chainId,
      treasury: configuration.treasury
    });
    return json({
      challengeId: challenge.id,
      message: challenge.message,
      expiresAt: challenge.expiresAt.toISOString(),
      chainId: configuration.chainId,
      chainName: configuration.chainName,
      tokenAddress: configuration.tokenAddress,
      treasury: configuration.treasury,
      amountAtomic: challenge.amountAtomic.toString(),
      planYears
    }, 201);
  } catch (cause) {
    return json({ error: safeError(cause, "Unable to start archive checkout") }, 400);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const challengeId = String(body.challengeId || "");
    const signature = String(body.signature || "");
    const transactionHash = String(body.transactionHash || "") as Hash;
    if (!challengeId || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
      return json({ error: "A valid signed archive challenge is required" }, 400);
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) {
      return json({ error: "A valid USDC payment transaction is required" }, 400);
    }

    const challenge = await getArchivePurchaseChallenge(challengeId);
    if (!challenge) return json({ error: "Archive checkout challenge was not found" }, 404);
    if (challenge.expiresAt.getTime() < Date.now() && !challenge.usedAt) {
      return json({ error: "Archive checkout challenge expired; start again" }, 410);
    }
    if (
      challenge.usedAt &&
      challenge.transactionHash?.toLowerCase() !== transactionHash.toLowerCase()
    ) {
      return json({ error: "Archive checkout challenge has already been used" }, 409);
    }

    const signer = await recoverMessageAddress({
      message: challenge.message,
      signature: signature as `0x${string}`
    });
    if (getAddress(signer) !== challenge.wallet) {
      return json({ error: "Archive checkout signature does not match the purchasing wallet" }, 403);
    }

    const policy = await getHistoryAccessPolicy();
    if (!policy.subscriptionSalesEnabled && !challenge.usedAt) {
      return json({ error: "Archive subscription sales are not enabled" }, 409);
    }
    const configuration = await archiveCheckoutConfiguration();
    if (
      configuration.chainId !== challenge.chainId ||
      getAddress(configuration.treasury) !== challenge.treasury
    ) {
      return json({ error: "Archive checkout configuration changed; start again" }, 409);
    }

    const settlement = await verifySettlement({
      sourceChainId: challenge.chainId,
      destinationChainId: challenge.chainId,
      token: "USDC",
      amountAtomic: challenge.amountAtomic,
      recipient: challenge.treasury,
      sourceTransactionHash: transactionHash
    });
    if (settlement.payer !== challenge.wallet) {
      return json({ error: "USDC payment was not sent by the purchasing wallet" }, 403);
    }

    const purchase = await activateArchivePurchase({ challenge, transactionHash });
    return json({ entitlement: purchase });
  } catch (cause) {
    return json({ error: safeError(cause, "Archive subscription activation failed") }, 400);
  }
}

async function archiveCheckoutConfiguration() {
  const policy = await getHistoryAccessPolicy();
  const networks = PAYMENT_NETWORK_ENV === "testnet"
    ? TESTNET_PAYMENT_NETWORKS
    : MAINNET_PAYMENT_NETWORKS;
  const xdcNetwork = networks.find((network) =>
    PAYMENT_NETWORK_ENV === "testnet"
      ? network.chainId === 51
      : network.chainId === 50
  );
  if (!xdcNetwork) throw new Error("XDC payment network is unavailable");
  const treasuryValue = process.env.ARCHIVE_SUBSCRIPTION_TREASURY_ADDRESS || "";
  const treasuryConfigured = isAddress(treasuryValue);
  return {
    salesEnabled:
      policy.subscriptionSalesEnabled &&
      policy.oneYearPriceUsdMicros !== null &&
      treasuryConfigured,
    policySalesEnabled: policy.subscriptionSalesEnabled,
    treasuryConfigured,
    chainId: xdcNetwork.chainId,
    chainName: xdcNetwork.name,
    tokenAddress: xdcNetwork.usdcAddress,
    explorerUrl: xdcNetwork.explorerUrl,
    treasury: treasuryConfigured ? getAddress(treasuryValue) : "0x0000000000000000000000000000000000000000",
    plans: archivePlanQuotes(policy),
    currency: policy.archivePaymentCurrency
  };
}

function safeError(cause: unknown, fallback: string): string {
  if (!(cause instanceof Error)) return fallback;
  const allowed = [
    "expired", "not found", "already been used", "does not match",
    "not enabled", "unavailable", "must be", "payment", "transaction",
    "checkout", "price", "storage", "attempts"
  ];
  return allowed.some((word) => cause.message.toLowerCase().includes(word))
    ? cause.message
    : fallback;
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow, noarchive"
    }
  });
}
