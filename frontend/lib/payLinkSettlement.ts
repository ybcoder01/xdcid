import { getAddress, zeroAddress, type Address, type Hex } from "viem";
import { paymentRequestId } from "./paymentCancellation";
import { paymentRequestRoute, type PaymentRequest } from "./paymentRequests";
import { parsePayAmount } from "./paylinks";

export type PayLinkSettlementClaim = {
  requestId: Hex;
  name: string;
  sourceChainId: number;
  destinationChainId: number;
  token: "NATIVE" | "USDC";
  amountAtomic: string;
  payer: Address;
};

export function validatePayLinkSettlementClaim(
  request: PaymentRequest,
  claim: PayLinkSettlementClaim
): string | undefined {
  if (paymentRequestId(request).toLowerCase() !== claim.requestId.toLowerCase()) {
    return "Payment does not match this Pay Link request";
  }
  if (request.name !== claim.name) {
    return "Payment recipient name does not match this Pay Link request";
  }

  const route = paymentRequestRoute(request);
  if (
    route.sourceChainId !== claim.sourceChainId ||
    route.destinationChainId !== claim.destinationChainId
  ) {
    return "Payment route does not match this Pay Link request";
  }

  const expectedToken = request.token === "USDC" ? "USDC" : "NATIVE";
  if (expectedToken !== claim.token) {
    return "Payment asset does not match this Pay Link request";
  }
  if (parsePayAmount(request.amount, request.token).toString() !== claim.amountAtomic) {
    return "Payment amount does not match this Pay Link request";
  }
  if (
    request.payer !== zeroAddress &&
    getAddress(request.payer) !== getAddress(claim.payer)
  ) {
    return "Payment was not made by the designated Pay Link payer";
  }
  return undefined;
}
