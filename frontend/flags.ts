import "server-only";

import { vercelAdapter } from "@flags-sdk/vercel";
import { evaluate, flag } from "flags/next";

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
const domainRegistrationDefault =
  process.env.FEATURE_FLAG_DOMAIN_REGISTRATION_DEFAULT === undefined
    ? legacyDomainRegistrationDefault
    : process.env.FEATURE_FLAG_DOMAIN_REGISTRATION_DEFAULT === "true";
const subdomainRegistrationDefault =
  process.env.FEATURE_FLAG_SUBDOMAIN_REGISTRATION_DEFAULT === undefined
    ? legacySubdomainRegistrationDefault
    : process.env.FEATURE_FLAG_SUBDOMAIN_REGISTRATION_DEFAULT === "true";

export const featureFlagsProviderAvailable =
  process.env.VERCEL === "1" || Boolean(process.env.FLAGS?.trim());

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

export const domainRegistrationFlag = createBooleanFlag({
  key: "domain-registration",
  description:
    "Allows new top-level .xdc registrations. Renewals remain available when disabled.",
  defaultValue: domainRegistrationDefault,
});

export const subdomainRegistrationFlag = createBooleanFlag({
  key: "subdomain-registration",
  description:
    "Allows new paid subdomain registrations. Renewals remain available when disabled.",
  defaultValue: subdomainRegistrationDefault,
});

export const featureFlagDefinitions = {
  domainRegistration: domainRegistrationFlag,
  subdomainRegistration: subdomainRegistrationFlag,
};

export type FeatureFlagValues = {
  domainRegistration: boolean;
  subdomainRegistration: boolean;
};

export async function evaluateFeatureFlags(
  request?: Request,
): Promise<FeatureFlagValues> {
  return evaluate(featureFlagDefinitions, request);
}
