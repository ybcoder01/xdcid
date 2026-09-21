import { XDC_MAINNET_DEPLOYMENT } from "../../sdk/src/deployment/deployments";

// Compatibility shape for existing frontend consumers. Values come from the
// typed mainnet deployment manifest rather than a generated legacy file.
export const xnsAddresses = {
  registry: XDC_MAINNET_DEPLOYMENT.active.registry,
  registrar: XDC_MAINNET_DEPLOYMENT.active.registrar,
  resolver: XDC_MAINNET_DEPLOYMENT.active.legacyForwardResolver,
  reverseResolver: XDC_MAINNET_DEPLOYMENT.active.legacyReverseResolver,
  legacyRegistrar: XDC_MAINNET_DEPLOYMENT.active.historicalRegistrars[1],
} as const;
