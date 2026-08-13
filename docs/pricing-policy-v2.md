# Pricing Policy v2

Pricing Policy v2 is the first module for the next XDCID registrar stack. It is
not connected to the production registry by this change.

## Initial commercial policy

- Two-character names: $100 per year, enforced as an immutable minimum floor.
- Three-character names: $20 per year.
- Four-character names: $10 per year.
- Standard names: $5 per year.
- General-user subdomains: $1 per year.
- Premium subdomains: independently configurable; deployment scripts will set
  the initial amount only after the premium plan is finalized.
- Migration: $3.
- Three, five, and ten-year discounts remain 10%, 15%, and 20%.

All prices except the protected two-character floor can be adjusted by proposing
a complete configuration and waiting 48 hours. The two-character price can be
raised or later reduced, but never below $100 without deploying a different
policy contract.

## Module boundaries

This policy only calculates prices and authorizes quote-signing versions. It
does not:

- permit two-character registration by itself;
- create or manage subdomains;
- whitelist wallets or apply discretionary discounts;
- change the active registrar;
- deploy or activate a contract.

Those capabilities belong to separate Registrar v2, Discount Authorization, and
Subdomain Registrar modules. This prevents future subdomain or discount changes
from forcing replacement of the core registry.

The existing XNS registry, active registrar, registered names, resolvers, and
production pricing policy remain unchanged until separately deployed, verified,
tested, and activated.
