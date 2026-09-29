import { expect } from "chai";
import type { XdcidMainnetDeployment } from "../sdk/src/deployment/deployments";
import { ownershipTargets } from "../scripts/lib/ownership-targets";

const address = (suffix: string) =>
  `0x${suffix.padStart(40, "0")}` as `0x${string}`;

function deployment(
  activeRegistrar = address("2"),
  candidateRegistrar: `0x${string}` | null = address("9"),
): XdcidMainnetDeployment {
  return {
    environment: "production",
    chainId: 50,
    protocolOwner: address("1"),
    dependencies: {
      legacyRegistry: address("7"),
      usdcToken: address("8"),
    },
    operations: {
      quoteSigner: address("a"),
      discountAuthorizationSigner: address("b"),
      treasury: address("c"),
    },
    products: { subdomains: "active" },
    active: {
      registry: address("1"),
      registrar: activeRegistrar,
      pricingPolicy: address("3"),
      pricingPolicyVersion: 1,
      discountAuthorization: address("4"),
      subdomainRegistrar: address("5"),
      legacyForwardResolver: address("6"),
      legacyReverseResolver: address("7"),
      ownerBoundForwardResolver: null,
      ownerVerifiedReverseResolver: null,
      multichainResolver: address("8"),
      historicalRegistrars: [],
    },
    candidate: {
      primaryRegistrar: candidateRegistrar,
      ownerBoundForwardResolver: null,
      ownerVerifiedReverseResolver: null,
      primaryAwareMultichainResolver: null,
    },
    rollout: {
      primaryResolution: {
        proposalTransaction: `0x${"0".repeat(64)}`,
        earliestActivation: 0,
        previousRegistrar: activeRegistrar,
        temporarySingleOwnerAccepted: true,
      },
    },
  };
}

describe("ownership migration targets", function () {
  it("includes the active and candidate registrars", function () {
    const targets = ownershipTargets(deployment());

    expect(targets.map(({ label }) => label)).to.deep.equal([
      "Registry",
      "Active Registrar",
      "Pricing Policy V2",
      "Discount Authorization",
      "Subdomain Registrar",
      "Candidate Primary Registrar",
    ]);
  });

  it("deduplicates a promoted candidate and omits an empty candidate", function () {
    const registrar = address("2");
    expect(ownershipTargets(deployment(registrar, registrar))).to.have.length(5);
    expect(ownershipTargets(deployment(registrar, null))).to.have.length(5);
  });
});
