import { expect } from "chai";
import { classifyRegistryStatus } from "../frontend/lib/registryStatus";

describe("registry-aware name status", () => {
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
