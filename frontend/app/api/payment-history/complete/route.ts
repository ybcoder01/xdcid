import { getAddress, isAddress, isHash, type Hash } from "viem";
import { getPaymentNetwork, USDC_DECIMALS } from "../../../../config/paymentNetworks";
import { calculateXdcidConvenienceFee } from "../../../../lib/cctpMainnet";
import {
  isPaymentHistoryConfigured,
  saveCompletedPayment
} from "../../../../lib/paymentHistory";
import { verifySettlement } from "../../../../lib/paymentSettlementVerification";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CompletionBody = {
  name?: unknown;
  sourceChainId?: unknown;
  destinationChainId?: unknown;
  token?: unknown;
  amountAtomic?: unknown;
  recipient?: unknown;
  sourceTransactionHash?: unknown;
  destinationTransactionHash?: unknown;
  reference?: unknown;
  description?: unknown;
  paymentChannel?: unknown;
  completionMethod?: unknown;
};

export async function POST(request: Request) {
  if (!isPaymentHistoryConfigured()) {
    return json({ error: "Private payment history is unavailable" }, 503);
  }
  try {
    const body = await request.json() as CompletionBody;
    const error = validate(body);
    if (error) return json({ error }, 400);

    const sourceHash = body.sourceTransactionHash as Hash;
    const destinationHash = typeof body.destinationTransactionHash === "string"
      ? body.destinationTransactionHash as Hash
      : undefined;
    const token = body.token as "NATIVE" | "USDC";
    const amountAtomic = BigInt(body.amountAtomic as string);
    const recipient = getAddress(body.recipient as string);
    const sourceNetwork = getPaymentNetwork(body.sourceChainId as number);
    if (!sourceNetwork) return json({ error: "Source network is unsupported" }, 400);
    const verified = await verifySettlement({
      sourceChainId: body.sourceChainId as number,
      destinationChainId: body.destinationChainId as number,
      token,
      amountAtomic,
      recipient,
      sourceTransactionHash: sourceHash,
      destinationTransactionHash: destinationHash
    });

    const crossChain = body.sourceChainId !== body.destinationChainId;
    const transactionType = token === "NATIVE"
      ? "native"
      : crossChain
        ? "cross_chain_usdc"
        : "same_chain_usdc";
    const forwarded = crossChain && verified.circleFeeAtomic > 0n;
    const completionMethod = transactionType === "native" || transactionType === "same_chain_usdc"
      ? "direct"
      : forwarded
        ? body.completionMethod === "recovered" ? "recovered" : "automatic"
        : "standard";
    const id = "pm_" + sourceHash.slice(2, 39).toLowerCase();
    await saveCompletedPayment({
      id,
      requestId: sourceHash.toLowerCase(),
      name: (body.name as string).trim() || recipient,
      creator: recipient,
      payer: verified.payer,
      amountAtomic: amountAtomic.toString(),
      token: token === "NATIVE"
        ? getPaymentNetwork(body.sourceChainId as number)?.nativeSymbol || "NATIVE"
        : "USDC",
      tokenAddress: token === "USDC" ? sourceNetwork.usdcAddress : undefined,
      tokenDecimals: token === "USDC" ? USDC_DECIMALS : 18,
      transactionType,
      completionMethod,
      paymentChannel: body.paymentChannel === "pay_link" ? "pay_link" : "send",
      xdcidFeeAtomic: forwarded
        ? calculateXdcidConvenienceFee(amountAtomic).toString()
        : undefined,
      circleFeeAtomic: forwarded
        ? verified.circleFeeAtomic.toString()
        : undefined,
      sourceChainId: body.sourceChainId as number,
      destinationChainId: body.destinationChainId as number,
      sourceTransactionHash: verified.sourceTransactionHash,
      destinationTransactionHash: verified.destinationTransactionHash,
      privateContext:
        (typeof body.reference === "string" && body.reference.trim()) ||
        (typeof body.description === "string" && body.description.trim())
          ? {
              ...(typeof body.reference === "string" && body.reference.trim()
                ? { reference: body.reference.trim() }
                : {}),
              ...(typeof body.description === "string" && body.description.trim()
                ? { description: body.description.trim() }
                : {})
            }
          : undefined
    });
    return json({ id, status: "recorded" }, 201);
  } catch (cause) {
    return json({
      error: cause instanceof Error ? cause.message : "Payment could not be verified"
    }, 422);
  }
}

function validate(body: CompletionBody): string | undefined {
  if (
    !Number.isSafeInteger(body.sourceChainId) ||
    !Number.isSafeInteger(body.destinationChainId) ||
    !getPaymentNetwork(body.sourceChainId as number) ||
    !getPaymentNetwork(body.destinationChainId as number)
  ) return "Supported source and destination networks are required";
  if (body.token !== "NATIVE" && body.token !== "USDC") {
    return "Supported payment token is required";
  }
  if (typeof body.amountAtomic !== "string" || !/^\d+$/.test(body.amountAtomic) || body.amountAtomic === "0") {
    return "Atomic payment amount is invalid";
  }
  if (typeof body.recipient !== "string" || !isAddress(body.recipient)) {
    return "Recipient address is invalid";
  }
  if (typeof body.sourceTransactionHash !== "string" || !isHash(body.sourceTransactionHash)) {
    return "Source transaction hash is invalid";
  }
  if (
    body.destinationTransactionHash !== undefined &&
    (typeof body.destinationTransactionHash !== "string" || !isHash(body.destinationTransactionHash))
  ) return "Destination transaction hash is invalid";
  if (typeof body.name !== "string" || body.name.trim().length > 255) {
    return "Payment name is invalid";
  }
  if (body.reference !== undefined && (typeof body.reference !== "string" || body.reference.length > 48)) {
    return "Private payment reference is too long";
  }
  if (body.description !== undefined && (typeof body.description !== "string" || body.description.length > 120)) {
    return "Private payment description is too long";
  }
  if (
    body.paymentChannel !== undefined &&
    body.paymentChannel !== "send" &&
    body.paymentChannel !== "pay_link"
  ) return "Payment channel is invalid";
  if (
    body.completionMethod !== undefined &&
    !["direct", "standard", "automatic", "recovered"].includes(body.completionMethod as string)
  ) return "Completion method is invalid";
  return undefined;
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
