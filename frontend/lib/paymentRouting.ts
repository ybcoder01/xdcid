import {
  getPaymentNetwork,
  type PaymentNetwork
} from "../config/paymentNetworks";

export type PaymentToken = "USDC" | "NATIVE";

export type DirectPaymentRoute = {
  kind: "direct";
  token: PaymentToken;
  source: PaymentNetwork;
  destination: PaymentNetwork;
  steps: readonly ["transfer"];
};

export type CctpPaymentRoute = {
  kind: "cctp-standard";
  token: "USDC";
  source: PaymentNetwork;
  destination: PaymentNetwork;
  steps: readonly ["approve", "burn", "attest", "mint"];
};

export type PaymentRoute = DirectPaymentRoute | CctpPaymentRoute;
export type PaymentRouteErrorCode =
  | "UNSUPPORTED_CHAIN"
  | "NATIVE_CROSS_CHAIN_UNSUPPORTED";

export class PaymentRouteError extends Error {
  readonly code: PaymentRouteErrorCode;

  constructor(code: PaymentRouteErrorCode, message: string) {
    super(message);
    this.name = "PaymentRouteError";
    this.code = code;
  }
}

export function planPaymentRoute(input: {
  sourceChainId: number;
  destinationChainId: number;
  token: PaymentToken;
}): PaymentRoute {
  const source = getPaymentNetwork(input.sourceChainId);
  const destination = getPaymentNetwork(input.destinationChainId);

  if (!source || !destination) {
    throw new PaymentRouteError(
      "UNSUPPORTED_CHAIN",
      "Both source and destination must be supported payment networks."
    );
  }

  if (source.chainId === destination.chainId) {
    return {
      kind: "direct",
      token: input.token,
      source,
      destination,
      steps: ["transfer"]
    };
  }

  if (input.token !== "USDC") {
    throw new PaymentRouteError(
      "NATIVE_CROSS_CHAIN_UNSUPPORTED",
      "Cross-chain native-asset transfers are not supported."
    );
  }

  return {
    kind: "cctp-standard",
    token: "USDC",
    source,
    destination,
    steps: ["approve", "burn", "attest", "mint"]
  };
}
