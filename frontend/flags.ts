import "server-only";

import { vercelAdapter } from "@flags-sdk/vercel";
import { flag } from "flags/next";
import {
  isRegistrationMode,
  type FeatureFlagValues,
  type RegistrationMode,
} from "./lib/featureFlagTypes";

const booleanOptions = [
  { label: "Disabled", value: false },
  { label: "Enabled", value: true },
];

// Keep the first deployment behavior-compatible with the existing rollout
// variables. Once both flags exist in Vercel, their dashboard values become
// the runtime source of truth and these values are only outage fallbacks.
const legacyDomainRegistrationDefault =
  process.env.NEXT_PUBLIC_SIGNED_REGISTRAR_ENABLED === "true";
const legacySubdomainRegistrationDefault =
  process.env.NEXT_PUBLIC_SUBDOMAIN_REGISTRATION_ENABLED === "true";
const configuredRegistrationMode =
  process.env.FEATURE_FLAG_REGISTRATION_MODE_DEFAULT?.trim().toLowerCase();
const registrationModeDefault: RegistrationMode = isRegistrationMode(
  configuredRegistrationMode,
)
  ? configuredRegistrationMode
  : legacyDomainRegistrationDefault
    ? "public"
    : "closed";
const subdomainRegistrationDefault =
  process.env.FEATURE_FLAG_SUBDOMAIN_REGISTRATION_DEFAULT === undefined
    ? legacySubdomainRegistrationDefault
    : process.env.FEATURE_FLAG_SUBDOMAIN_REGISTRATION_DEFAULT === "true";

export const featureFlagsProviderAvailable =
  process.env.VERCEL === "1" || Boolean(process.env.FLAGS?.trim());

const registrationModeOptions = [
  { label: "Closed", value: "closed" as const },
  { label: "Private beta", value: "beta" as const },
  { label: "Public", value: "public" as const },
];

function createBooleanFlag(input: {
  key: string;
  description: string;
  defaultValue: boolean;
}) {
  const definition = {
    key: input.key,
    description: input.description,
    options: booleanOptions,
    defaultValue: input.defaultValue,
  };

  return featureFlagsProviderAvailable
    ? flag<boolean>({ ...definition, adapter: vercelAdapter() })
    : flag<boolean>({ ...definition, decide: () => input.defaultValue });
}

export const registrationModeFlag = featureFlagsProviderAvailable
  ? flag<RegistrationMode>({
      key: "registration-rollout",
      description:
        "Controls whether new top-level .xdc registrations are closed, restricted to approved beta grants, or public.",
      options: registrationModeOptions,
      defaultValue: registrationModeDefault,
      adapter: vercelAdapter(),
    })
  : flag<RegistrationMode>({
      key: "registration-rollout",
      description:
        "Controls whether new top-level .xdc registrations are closed, restricted to approved beta grants, or public.",
      options: registrationModeOptions,
      defaultValue: registrationModeDefault,
      decide: () => registrationModeDefault,
    });

export const subdomainRegistrationFlag = createBooleanFlag({
  key: "subdomain-registration",
  description:
    "Allows new paid subdomain registrations. Renewals remain available when disabled.",
  defaultValue: subdomainRegistrationDefault,
});

export const featureFlagDefinitions = {
  registrationMode: registrationModeFlag,
  subdomainRegistration: subdomainRegistrationFlag,
};

export async function evaluateFeatureFlags(): Promise<FeatureFlagValues> {
  const [registrationMode, subdomainRegistration] = await Promise.all([
    registrationModeFlag(),
    subdomainRegistrationFlag(),
  ]);
  return { registrationMode, subdomainRegistration };
}
