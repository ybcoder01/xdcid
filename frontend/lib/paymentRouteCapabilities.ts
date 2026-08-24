export type AutomaticForwardingStatus =
  | "mainnet-enabled"
  | "mainnet-preview"
  | "testnet-enabled"
  | "testnet-validated"
  | "unavailable";

export type PaymentRouteCapability = {
  standardTransfer: boolean;
  automaticForwarding: AutomaticForwardingStatus;
};

const MAINNET_PAYMENT_CHAIN_IDS = [1, 50, 137, 8453, 42161] as const;
const TESTNET_PAYMENT_CHAIN_IDS = [11155111, 51, 80002, 84532, 421614] as const;

const SUPPORTED_PAYMENT_CHAIN_IDS = new Set<number>([
  ...MAINNET_PAYMENT_CHAIN_IDS,
  ...TESTNET_PAYMENT_CHAIN_IDS
]);

function buildCrossChainRoutes(chainIds: readonly number[]): Set<string> {
  return new Set(
    chainIds.flatMap((sourceChainId) =>
      chainIds
        .filter((destinationChainId) => destinationChainId !== sourceChainId)
        .map((destinationChainId) => `${sourceChainId}:${destinationChainId}`)
    )
  );
}

const MAINNET_ENABLED_FORWARDING_ROUTES = buildCrossChainRoutes(
  MAINNET_PAYMENT_CHAIN_IDS
);
const TESTNET_ENABLED_FORWARDING_ROUTES = buildCrossChainRoutes(
  TESTNET_PAYMENT_CHAIN_IDS
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
  if (TESTNET_ENABLED_FORWARDING_ROUTES.has(routeKey)) {
    return {
      standardTransfer: true,
      automaticForwarding: "testnet-enabled"
    };
  }

  if (MAINNET_ENABLED_FORWARDING_ROUTES.has(routeKey)) {
    return {
      standardTransfer: true,
      automaticForwarding: "mainnet-enabled"
    };
  }

  const previewRouteSet = new Set(
    previewRoutes
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  if (previewRouteSet.has(routeKey)) {
    return {
      standardTransfer: true,
      automaticForwarding: "mainnet-preview"
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
  if (status === "testnet-enabled") {
    return "Automatic forwarding is enabled for this testnet route.";
  }
  if (status === "testnet-validated") {
    return "Automatic forwarding passed testnet validation and is pending mainnet validation for this route.";
  }
  return "Automatic forwarding is not available for this route. Standard transfer remains available.";
}
