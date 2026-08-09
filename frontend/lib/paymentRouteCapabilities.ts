export type AutomaticForwardingStatus =
  | "mainnet-enabled"
  | "testnet-validated"
  | "unavailable";

export type PaymentRouteCapability = {
  standardTransfer: boolean;
  automaticForwarding: AutomaticForwardingStatus;
};

const XDC_CHAIN_ID = 50;
const ARBITRUM_CHAIN_ID = 42161;

const SUPPORTED_PAYMENT_CHAIN_IDS = new Set([
  1,
  XDC_CHAIN_ID,
  137,
  8453,
  ARBITRUM_CHAIN_ID
]);

const TESTNET_VALIDATED_FORWARDING_DESTINATIONS = new Set([
  1,
  137,
  8453,
  ARBITRUM_CHAIN_ID
]);

const MAINNET_ENABLED_FORWARDING_ROUTES = new Set([
  `${XDC_CHAIN_ID}:${ARBITRUM_CHAIN_ID}`
]);

export function getPaymentRouteCapability(
  sourceChainId: number,
  destinationChainId: number
): PaymentRouteCapability {
  const supported =
    SUPPORTED_PAYMENT_CHAIN_IDS.has(sourceChainId) &&
    SUPPORTED_PAYMENT_CHAIN_IDS.has(destinationChainId);

  if (!supported) {
    return {
      standardTransfer: false,
      automaticForwarding: "unavailable"
    };
  }

  if (sourceChainId === destinationChainId) {
    return {
      standardTransfer: true,
      automaticForwarding: "unavailable"
    };
  }

  const routeKey = `${sourceChainId}:${destinationChainId}`;
  if (MAINNET_ENABLED_FORWARDING_ROUTES.has(routeKey)) {
    return {
      standardTransfer: true,
      automaticForwarding: "mainnet-enabled"
    };
  }

  if (
    sourceChainId === XDC_CHAIN_ID &&
    TESTNET_VALIDATED_FORWARDING_DESTINATIONS.has(destinationChainId)
  ) {
    return {
      standardTransfer: true,
      automaticForwarding: "testnet-validated"
    };
  }

  return {
    standardTransfer: true,
    automaticForwarding: "unavailable"
  };
}

export function automaticForwardingMessage(
  status: AutomaticForwardingStatus
): string {
  if (status === "mainnet-enabled") {
    return "Automatic forwarding is enabled for this mainnet route.";
  }
  if (status === "testnet-validated") {
    return "Automatic forwarding passed testnet validation and is pending mainnet validation for this route.";
  }
  return "Automatic forwarding is not available for this route. Standard transfer remains available.";
}
