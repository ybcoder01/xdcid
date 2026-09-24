import type { Address } from "viem";

export type ApothemRegistryV2ActivationStage = "waiting" | "ready" | "active" | "invalid";

export type ApothemRegistryV2ActivationState = {
  registryRegistrar: Address;
  discountConsumer: Address;
  authorizationSigner: Address;
  pendingConsumer: Address;
  pendingSigner: Address;
  pendingActivationTime: bigint;
  hasPendingConfiguration: boolean;
  blockTimestamp: bigint;
};

export type ApothemRegistryV2ActivationExpected = {
  registrar: Address;
  previousConsumer: Address;
  authorizationSigner: Address;
  earliestActivation: bigint;
};

export function deriveApothemRegistryV2ActivationStage(
  state: ApothemRegistryV2ActivationState,
  expected: ApothemRegistryV2ActivationExpected,
): ApothemRegistryV2ActivationStage {
  const registryIsReady = state.registryRegistrar === expected.registrar;
  const signerIsExpected = state.authorizationSigner === expected.authorizationSigner;

  if (
    registryIsReady &&
    signerIsExpected &&
    state.discountConsumer === expected.registrar &&
    !state.hasPendingConfiguration
  ) {
    return "active";
  }

  const pendingIsExpected =
    state.hasPendingConfiguration &&
    state.discountConsumer === expected.previousConsumer &&
    state.pendingConsumer === expected.registrar &&
    state.pendingSigner === expected.authorizationSigner &&
    state.pendingActivationTime === expected.earliestActivation;

  if (registryIsReady && signerIsExpected && pendingIsExpected) {
    return state.blockTimestamp >= state.pendingActivationTime ? "ready" : "waiting";
  }

  return "invalid";
}
