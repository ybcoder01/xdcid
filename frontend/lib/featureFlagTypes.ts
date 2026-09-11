export const registrationModes = ["closed", "beta", "public"] as const;

export type RegistrationMode = (typeof registrationModes)[number];

export type FeatureFlagValues = {
  registrationMode: RegistrationMode;
  subdomainRegistration: boolean;
};

export function isRegistrationMode(value: unknown): value is RegistrationMode {
  return registrationModes.includes(value as RegistrationMode);
}
