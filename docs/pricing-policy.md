# XDCID pricing policy

This document fixes the first version of the proposed USD-denominated pricing policy. It is a specification and application-level quote foundation only. The deployed registrar continues to enforce its existing XDC-denominated prices until a separately reviewed pricing-policy contract is deployed and activated.

## Version 1 prices

| Product | Base price |
| --- | ---: |
| Three-character root name | $20 per year |
| Four-character root name | $10 per year |
| Five-or-more-character root name | $5 per year |
| Root-name renewal | Same as registration |
| Every subdomain | $1 per year |
| XDCDomains migration | $3 once |

One- and two-character root names remain reserved.

Supported terms and discounts are:

| Term | Discount |
| --- | ---: |
| 1 year | 0% |
| 3 years | 10% |
| 5 years | 15% |
| 10 years | 20% |

The migration fee has no term discount. A subdomain must never outlive its parent; enforcement belongs in the future subdomain contract.

## CoinGecko quote boundary

The server-only adapter reads CoinGecko Demo API ID `xdce-crowd-sale`, requires a positive quote with a source timestamp no more than five minutes old, caches successful results for 60 seconds by default, and times requests out after 3.5 seconds by default. It applies a 2% upward buffer and rounds the required XDC amount upward.

Set `COINGECKO_DEMO_API_KEY` only in a protected server environment. It must never use a `NEXT_PUBLIC_*` variable or appear in source control. Optional server settings are:

- `COINGECKO_PRICE_CACHE_MS`: 15 seconds to 5 minutes.
- `COINGECKO_TIMEOUT_MS`: 1 to 10 seconds.

The initial endpoint returns `authorizedForPayment: false`. Its output is informational and cannot authorize registration, renewal, migration, or subdomain payment. Payment authorization requires a later dedicated signer, short expiry, payer/name/term binding, chain and registrar binding, replay protection, and on-chain signature verification.

USDC pricing remains exact and independent of CoinGecko availability.

## Future configurability

The future on-chain pricing-policy contract will store prices in six-decimal USD/USDC base units and expose delayed propose, cancel, and activate operations. Routine prices, discounts, buffers, quote signers, and provider changes must not require replacing the registry or registrar. A fundamental change to immutable registry behavior may require a new contract and must be reviewed separately before implementation.
