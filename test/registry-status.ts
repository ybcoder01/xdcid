import { expect } from "chai";
import { legacyXdcDomainsAbi } from "../frontend/config/legacyDomains";
import {
  classifyRegistryStatus,
  xdcidRegistrationFromOwner
} from "../frontend/lib/registryStatus";

describe("registry-aware name status", () => {
  it("derives XDCID registration from registry ownership, not registrar availability", () => {
    expect(xdcidRegistrationFromOwner(undefined)).to.equal(undefined);
    expect(
      xdcidRegistrationFromOwner(
        "0x0000000000000000000000000000000000000000"
      )
    ).to.equal(false);
    expect(
      xdcidRegistrationFromOwner(
        "0x2DaC2bB1cF00C5f9bbcf3A8Bf62E77DbDd69FCe5"
      )
    ).to.equal(true);
  });

  it("uses the legacy registry name-to-token ID mapping", () => {
    const lookup = legacyXdcDomainsAbi.find(
      (entry) => entry.name === "_tokenIdMaps"
    );

    expect(lookup).to.deep.include({
      type: "function",
      name: "_tokenIdMaps",
      stateMutability: "view"
    });
    expect(lookup?.inputs).to.deep.equal([
      { name: "name", type: "string" }
    ]);
    expect(lookup?.outputs).to.deep.equal([{ type: "uint256" }]);
  });

  it("allows registration only when neither registry contains the name", () => {
    expect(
      classifyRegistryStatus({
        xdcidRegistered: false,
        legacyRegistered: false
      })
    ).to.deep.equal({
      state: "unregistered",
      registrationAllowed: true,
      authoritativeRegistry: null,
      requiresMigration: false,
      requiresReview: false
    });
  });

  it("uses XDCID as the authority for an XDCID-only name", () => {
    expect(
      classifyRegistryStatus({
        xdcidRegistered: true,
        legacyRegistered: false
      })
    ).to.deep.equal({
      state: "xdcid",
      registrationAllowed: false,
      authoritativeRegistry: "xdcid",
      requiresMigration: false,
      requiresReview: false
    });
  });

  it("marks a legacy-only name for migration without routing it", () => {
    expect(
      classifyRegistryStatus({
        xdcidRegistered: false,
        legacyRegistered: true
      })
    ).to.deep.equal({
      state: "legacy",
      registrationAllowed: false,
      authoritativeRegistry: null,
      requiresMigration: true,
      requiresReview: false
    });
  });

  it("blocks authority selection when both registries contain the name", () => {
    expect(
      classifyRegistryStatus({
        xdcidRegistered: true,
        legacyRegistered: true
      })
    ).to.deep.equal({
      state: "collision",
      registrationAllowed: false,
      authoritativeRegistry: null,
      requiresMigration: false,
      requiresReview: true
    });
  });
});
