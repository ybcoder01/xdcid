import type { Address } from "viem";
import type { XdcidMainnetDeployment } from "../../sdk/src/deployment/deployments";

export type OwnershipTarget = {
  label: string;
  address: Address;
};

export function ownershipTargets(
  deployment: XdcidMainnetDeployment,
): OwnershipTarget[] {
  const targets: Array<OwnershipTarget | null> = [
    { label: "Registry", address: deployment.active.registry },
    { label: "Active Registrar", address: deployment.active.registrar },
    {
      label: "Pricing Policy V2",
      address: deployment.active.pricingPolicy,
    },
    {
      label: "Discount Authorization",
      address: deployment.active.discountAuthorization,
    },
    {
      label: "Subdomain Registrar",
      address: deployment.active.subdomainRegistrar,
    },
    deployment.candidate.primaryRegistrar
      ? {
          label: "Candidate Primary Registrar",
          address: deployment.candidate.primaryRegistrar,
        }
      : null,
  ];

  const seen = new Set<string>();
  return targets.filter((target): target is OwnershipTarget => {
    if (!target) return false;
    const key = target.address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
