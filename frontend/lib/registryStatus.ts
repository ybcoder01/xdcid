export type RegistryState =
  | "unregistered"
  | "xdcid"
  | "legacy"
  | "collision";

export type RegistryStatus = {
  state: RegistryState;
  registrationAllowed: boolean;
  authoritativeRegistry: "xdcid" | null;
  requiresMigration: boolean;
  requiresReview: boolean;
};

export function classifyRegistryStatus(input: {
  xdcidRegistered: boolean;
  legacyRegistered: boolean;
}): RegistryStatus {
  if (input.xdcidRegistered && input.legacyRegistered) {
    return {
      state: "collision",
      registrationAllowed: false,
      authoritativeRegistry: null,
      requiresMigration: false,
      requiresReview: true
    };
  }

  if (input.xdcidRegistered) {
    return {
      state: "xdcid",
      registrationAllowed: false,
      authoritativeRegistry: "xdcid",
      requiresMigration: false,
      requiresReview: false
    };
  }

  if (input.legacyRegistered) {
    return {
      state: "legacy",
      registrationAllowed: false,
      authoritativeRegistry: null,
      requiresMigration: true,
      requiresReview: false
    };
  }

  return {
    state: "unregistered",
    registrationAllowed: true,
    authoritativeRegistry: null,
    requiresMigration: false,
    requiresReview: false
  };
}
