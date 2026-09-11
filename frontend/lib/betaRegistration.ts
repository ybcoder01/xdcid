import type { DomainDiscountAuthorization } from "./domainDiscounts";
import { parseXnsName } from "./names";

export const BETA_REGISTRATION_CAMPAIGN = "five-letter-beta-2026";
export const BETA_REGISTRATION_LIMIT = 50;

export function betaGrantValidationError(input: {
  name: string;
  authorization: DomainDiscountAuthorization;
}): string | undefined {
  const parsed = parseXnsName(input.name);
  if (!parsed.isValid || !/^[a-z]{5}$/.test(parsed.label)) {
    return "Beta grants are limited to five-letter .xdc names";
  }
  if (input.authorization.product !== 0 || input.authorization.termYears !== 1n) {
    return "Beta grants must authorize one year of registration";
  }
  if (
    input.authorization.discountBps !== 10_000 ||
    input.authorization.maxUses !== 1
  ) {
    return "Beta grants must provide one gas-only registration use";
  }
  return undefined;
}
