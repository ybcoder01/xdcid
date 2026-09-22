import type { Address } from "viem";

export type PrimaryResolutionActivationStage =
  | "waiting"
  | "discount-ready"
  | "registry-ready"
  | "active"
  | "invalid";

export type PrimaryResolutionActivationState = {
  activeRegistrar: Address;
  discountConsumer: Address;
  authorizationSigner: Address;
  pendingConsumer: Address;
  pendingSigner: Address;
  pendingActivationTime: bigint;
  hasPendingConfiguration: boolean;
  blockTimestamp: bigint;
};

export type PrimaryResolutionActivationExpected = {
  currentRegistrar: Address;
  candidateRegistrar: Address;
  authorizationSigner: Address;
  earliestActivation: bigint;
};

export function derivePrimaryResolutionActivationStage(
  state: PrimaryResolutionActivationState,
  expected: PrimaryResolutionActivationExpected,
): PrimaryResolutionActivationStage {
  const registryIsCurrent = state.activeRegistrar === expected.currentRegistrar;
  const registryIsCandidate = state.activeRegistrar === expected.candidateRegistrar;
  const consumerIsCurrent = state.discountConsumer === expected.currentRegistrar;
  const consumerIsCandidate = state.discountConsumer === expected.candidateRegistrar;
  const signerIsExpected = state.authorizationSigner === expected.authorizationSigner;

  if (registryIsCandidate && consumerIsCandidate && signerIsExpected) {
    return state.hasPendingConfiguration ? "invalid" : "active";
  }

  if (
    registryIsCurrent &&
    consumerIsCandidate &&
    signerIsExpected &&
    !state.hasPendingConfiguration
  ) {
    return "registry-ready";
  }

  const pendingIsExpected =
    state.hasPendingConfiguration &&
    state.pendingConsumer === expected.candidateRegistrar &&
    state.pendingSigner === expected.authorizationSigner &&
    state.pendingActivationTime === expected.earliestActivation;

  if (registryIsCurrent && consumerIsCurrent && signerIsExpected && pendingIsExpected) {
    return state.blockTimestamp >= state.pendingActivationTime
      ? "discount-ready"
      : "waiting";
  }

  return "invalid";
}
