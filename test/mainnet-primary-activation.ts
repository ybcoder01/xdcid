import { expect } from "chai";
import { getAddress, zeroAddress, type Address } from "viem";
import {
  derivePrimaryResolutionActivationStage,
  type PrimaryResolutionActivationState,
} from "../frontend/lib/mainnetPrimaryActivation";

const current = getAddress("0xdEaf1742614908a8d170f4c9520c3cd1e967ef36");
const candidate = getAddress("0x3D87B064a06f62cc4a24EAff13A591C9Ba791135");
const signer = getAddress("0xe82a4267CC310FC6Db334601671A043DFc8Ce06A");
const activation = 1790255368n;

const expected = {
  currentRegistrar: current,
  candidateRegistrar: candidate,
  authorizationSigner: signer,
  earliestActivation: activation,
};

function state(overrides: Partial<PrimaryResolutionActivationState> = {}) {
  return {
    activeRegistrar: current,
    discountConsumer: current,
    authorizationSigner: signer,
    pendingConsumer: candidate,
    pendingSigner: signer,
    pendingActivationTime: activation,
    hasPendingConfiguration: true,
    blockTimestamp: activation - 1n,
    ...overrides,
  } satisfies PrimaryResolutionActivationState;
}

describe("mainnet primary-resolution activation state", function () {
  it("moves through the exact reviewed rollout sequence", function () {
    expect(derivePrimaryResolutionActivationStage(state(), expected)).to.equal("waiting");
    expect(
      derivePrimaryResolutionActivationStage(state({ blockTimestamp: activation }), expected),
    ).to.equal("discount-ready");
    expect(
      derivePrimaryResolutionActivationStage(
        state({
          discountConsumer: candidate,
          pendingConsumer: zeroAddress as Address,
          pendingSigner: zeroAddress as Address,
          pendingActivationTime: 0n,
          hasPendingConfiguration: false,
        }),
        expected,
      ),
    ).to.equal("registry-ready");
    expect(
      derivePrimaryResolutionActivationStage(
        state({
          activeRegistrar: candidate,
          discountConsumer: candidate,
          pendingConsumer: zeroAddress as Address,
          pendingSigner: zeroAddress as Address,
          pendingActivationTime: 0n,
          hasPendingConfiguration: false,
        }),
        expected,
      ),
    ).to.equal("active");
  });

  it("rejects an unreviewed pending signer or consumer", function () {
    expect(
      derivePrimaryResolutionActivationStage(
        state({ pendingSigner: getAddress("0x1111111111111111111111111111111111111111") }),
        expected,
      ),
    ).to.equal("invalid");
    expect(
      derivePrimaryResolutionActivationStage(
        state({ discountConsumer: getAddress("0x2222222222222222222222222222222222222222") }),
        expected,
      ),
    ).to.equal("invalid");
  });
});
