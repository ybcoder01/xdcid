export type AutomaticForwardingStatus =
  | "mainnet-enabled"
  | "mainnet-preview"
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

const MAINNET_ENABLED_FORWARDING_ROUTES = new Set(
  [...SUPPORTED_PAYMENT_CHAIN_IDS].flatMap((sourceChainId) =>
    [...SUPPORTED_PAYMENT_CHAIN_IDS]
      .filter((destinationChainId) => destinationChainId !== sourceChainId)
      .map((destinationChainId) => `${sourceChainId}:${destinationChainId}`)
  )
);

export function getPaymentRouteCapability(
  sourceChainId: number,
  destinationChainId: number,
  previewRoutes = ""
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
    const previewRouteSet = new Set(
      previewRoutes
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    );
    return {
      standardTransfer: true,
      automaticForwarding: previewRouteSet.has(routeKey)
        ? "mainnet-preview"
        : "testnet-validated"
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
  if (status === "mainnet-preview") {
    return "Automatic forwarding is enabled for controlled mainnet validation on this preview deployment.";
  }
  if (status === "testnet-validated") {
    return "Automatic forwarding passed testnet validation and is pending mainnet validation for this route.";
  }
  return "Automatic forwarding is not available for this route. Standard transfer remains available.";
}
