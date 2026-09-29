import { expect } from "chai";
import { getAddress, zeroAddress, type Address } from "viem";
import {
  deriveApothemRegistryV2ActivationStage,
  type ApothemRegistryV2ActivationState,
} from "../frontend/lib/apothemRegistryV2Activation";

const registrar = getAddress("0xd51EdbE27BffA0993D9CFf672613a2d6eC0a5D7b");
const previousConsumer = getAddress("0xE35722cB7d04Ba36ed284910528A64B1dE855a20");
const signer = getAddress("0x9c67d6cfE6A73497e7348b6b852495CA6236C29a");
const activation = 1790346749n;

const expected = { registrar, previousConsumer, authorizationSigner: signer, earliestActivation: activation };

function state(overrides: Partial<ApothemRegistryV2ActivationState> = {}) {
  return {
    registryRegistrar: registrar,
    discountConsumer: previousConsumer,
    authorizationSigner: signer,
    pendingConsumer: registrar,
    pendingSigner: signer,
    pendingActivationTime: activation,
    hasPendingConfiguration: true,
    blockTimestamp: activation - 1n,
    ...overrides,
  } satisfies ApothemRegistryV2ActivationState;
}

describe("Apothem Registry V2 activation state", function () {
  it("moves from waiting to ready and then active", function () {
    expect(deriveApothemRegistryV2ActivationStage(state(), expected)).to.equal("waiting");
    expect(deriveApothemRegistryV2ActivationStage(state({ blockTimestamp: activation }), expected)).to.equal("ready");
    expect(deriveApothemRegistryV2ActivationStage(state({
      discountConsumer: registrar,
      pendingConsumer: zeroAddress as Address,
      pendingSigner: zeroAddress as Address,
      pendingActivationTime: 0n,
      hasPendingConfiguration: false,
    }), expected)).to.equal("active");
  });

  it("blocks an unreviewed proposal or Registry binding", function () {
    expect(deriveApothemRegistryV2ActivationStage(state({
      pendingConsumer: getAddress("0x1111111111111111111111111111111111111111"),
    }), expected)).to.equal("invalid");
    expect(deriveApothemRegistryV2ActivationStage(state({
      registryRegistrar: getAddress("0x2222222222222222222222222222222222222222"),
    }), expected)).to.equal("invalid");
  });
});
