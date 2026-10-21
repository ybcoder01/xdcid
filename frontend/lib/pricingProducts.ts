// PricingPolicy and PricingPolicyV2 both use product 2 for ordinary
// subdomain registration and renewal. Unified registrar quote product 3 is
// SubdomainRenewal, but pricing-policy product 3 is PremiumSubdomain.
export const SUBDOMAIN_PRICING_PRODUCT = 2 as const;
