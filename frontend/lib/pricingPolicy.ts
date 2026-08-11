export const USDC_DECIMALS = 6;
export const BASIS_POINTS = 10_000n;

export type PricingProduct =
  | "registration"
  | "renewal"
  | "subdomain"
  | "migration";

export type RegistrationTerm = 1 | 3 | 5 | 10;

export const SUPPORTED_REGISTRATION_TERMS: readonly RegistrationTerm[] = [
  1,
  3,
  5,
  10,
];

export const PRICING_POLICY_VERSION = 1;

export const PRICING_POLICY = {
  threeCharacterAnnualUsdMicros: 20_000_000n,
  fourCharacterAnnualUsdMicros: 10_000_000n,
  standardAnnualUsdMicros: 5_000_000n,
  subdomainAnnualUsdMicros: 1_000_000n,
  migrationUsdMicros: 3_000_000n,
  discountBpsByTerm: {
    1: 0n,
    3: 1_000n,
    5: 1_500n,
    10: 2_000n,
  } satisfies Record<RegistrationTerm, bigint>,
  xdcQuoteBufferBps: 200n,
} as const;

export type UsdPriceBreakdown = {
  policyVersion: number;
  product: PricingProduct;
  years: number | null;
  annualUsdMicros: bigint | null;
  grossUsdMicros: bigint;
  discountBps: bigint;
  totalUsdMicros: bigint;
};

export function isRegistrationTerm(value: number): value is RegistrationTerm {
  return SUPPORTED_REGISTRATION_TERMS.includes(value as RegistrationTerm);
}

export function annualNamePriceUsdMicros(labelLength: number): bigint {
  if (!Number.isSafeInteger(labelLength) || labelLength < 3 || labelLength > 63) {
    throw new Error("label length must be between 3 and 63");
  }
  if (labelLength === 3) return PRICING_POLICY.threeCharacterAnnualUsdMicros;
  if (labelLength === 4) return PRICING_POLICY.fourCharacterAnnualUsdMicros;
  return PRICING_POLICY.standardAnnualUsdMicros;
}

export function calculateUsdPrice(input: {
  product: PricingProduct;
  years?: number;
  labelLength?: number;
}): UsdPriceBreakdown {
  if (input.product === "migration") {
    return {
      policyVersion: PRICING_POLICY_VERSION,
      product: input.product,
      years: null,
      annualUsdMicros: null,
      grossUsdMicros: PRICING_POLICY.migrationUsdMicros,
      discountBps: 0n,
      totalUsdMicros: PRICING_POLICY.migrationUsdMicros,
    };
  }

  const years = input.years;
  if (years === undefined || !isRegistrationTerm(years)) {
    throw new Error("years must be one of 1, 3, 5, or 10");
  }

  const annualUsdMicros =
    input.product === "subdomain"
      ? PRICING_POLICY.subdomainAnnualUsdMicros
      : annualNamePriceUsdMicros(input.labelLength ?? 0);
  const grossUsdMicros = annualUsdMicros * BigInt(years);
  const discountBps = PRICING_POLICY.discountBpsByTerm[years];
  const totalUsdMicros = divideRoundingUp(
    grossUsdMicros * (BASIS_POINTS - discountBps),
    BASIS_POINTS,
  );

  return {
    policyVersion: PRICING_POLICY_VERSION,
    product: input.product,
    years,
    annualUsdMicros,
    grossUsdMicros,
    discountBps,
    totalUsdMicros,
  };
}

export function calculateBufferedXdcWei(
  totalUsdMicros: bigint,
  xdcUsdMicros: bigint,
): bigint {
  if (totalUsdMicros <= 0n) throw new Error("USD price must be positive");
  if (xdcUsdMicros <= 0n) throw new Error("XDC price must be positive");

  return divideRoundingUp(
    totalUsdMicros *
      10n ** 18n *
      (BASIS_POINTS + PRICING_POLICY.xdcQuoteBufferBps),
    xdcUsdMicros * BASIS_POINTS,
  );
}

function divideRoundingUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}
