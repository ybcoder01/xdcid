# Registrar v2

Registrar v2 is the modular top-level `.xdc` registration and renewal contract intended to work with `XNSPricingPolicyV2` and `XNSDiscountAuthorization`.

## Included

- Two- through 63-character top-level names.
- Existing XDCID registry compatibility; no registry replacement.
- Legacy XDCDomains collision blocking.
- Signed, short-lived, payer-bound XDC and USDC quotes.
- EOA or ERC-1271 policy quote signers.
- Exact-name partial or 100% discount authorizations.
- One-, three-, five-, and ten-year pricing supplied by Pricing Policy v2.
- Separate owner-controlled emergency pauses for registrations and renewals.
- Gross price, net price, and discount basis points in registration and renewal events.

## Not included

- Deployment or registry activation.
- Subdomain creation; that remains a separate module so Registrar v2 does not become a monolith.
- Migration or legacy-name burning.
- Private keys, API keys, RPC credentials, or production configuration.

## Deployment ordering

1. Deploy Pricing Policy v2.
2. Deploy Discount Authorization with the predicted Registrar v2 address as consumer, or rotate its consumer through the delayed configuration process.
3. Deploy Registrar v2 with the existing registry and legacy registry addresses.
4. Verify all bytecode and constructor arguments.
5. Run read-only preflight checks, including that Discount Authorization's consumer equals Registrar v2.
6. Activate Registrar v2 in the existing registry only after testnet validation.

The currently active registrar remains unchanged until step 6.
