# Wallet-signed XDC mainnet V2 deployment

This temporary Vercel Preview flow stages the already-tested V2 registration
stack for XDC mainnet. It deploys the pricing policy, discount authorization,
signed-quote registrar, and standalone subdomain registrar. Deployment does not
activate the new registrar or change the existing registry.

## Fixed mainnet dependencies and pricing

- Network: XDC mainnet, chain ID 50
- Existing XNS registry: `0x05fa64a05bc205DeDF47e023d2D90c2d119cd097`
- XDCDomains legacy registry: `0x295a7aB79368187a6CD03c464cfaAb04d799784E`
- XDC USDC: `0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1` (must return 6 decimals)
- Annual prices: $50 for two characters, $20 for three, $10 for four, and $5 for five or more
- Subdomains: $1 annually, with a $5 premium tier
- Migration: $3 once
- Term discounts: 10% for three years, 15% for five, and 20% for ten
- XDC quote buffer: 2%
- Rabby-compatible deterministic deployment proxy:
  `0x4e59b44847b379578588920ca78fbf26c0b4956c`

The page asks for four public addresses: registry/policy owner, quote signer,
discount signer, and treasury. A dedicated quote signer is recommended. Only
the public addresses are entered in the browser; no private key is requested.

## Safety boundary

The deployment page:

- is available only in a Vercel Preview deployment with
  `ENABLE_MAINNET_PRICING_DEPLOYMENT=true`;
- requires the existing registry-owner wallet on chain ID 50;
- validates dependency bytecode, registry ownership, and USDC decimals;
- deploys all four contracts through CREATE2 using distinct salts;
- waits for confirmations and verifies contract ownership and dependencies;
- proposes the Registrar V2 address as the discount consumer, starting its
  independent 48-hour timelock;
- stores only public deployment addresses in versioned browser storage for the
  activation page;
- never asks for, reads, transmits, or stores a private key.

## Deployment sequence

1. Open a Vercel Preview deployment containing this flow.
2. Add `ENABLE_MAINNET_PRICING_DEPLOYMENT=true` to Preview only and redeploy.
3. Visit `/deployment/mainnet-pricing` and connect the current registry owner
   through the hardware wallet.
4. Enter and review the four public role addresses.
5. Run the read-only preflight.
6. Sign the four deployment transactions and the discount-consumer proposal.
7. Save all four contract addresses and transaction hashes outside the browser.
8. Verify the contracts with `pnpm verify:v2-stack:xdc`.
9. Remove the Preview flag and redeploy or delete the Preview deployment.

Do not enable the deployment flag in Production.

## Activation after the timelock

After at least 48 hours, temporarily re-enable the Preview-only flag and visit
`/deployment/mainnet-v2-activation`.

1. Load or enter the four deployed addresses.
2. Connect the current registry owner and run the read-only preflight.
3. Activate the eligible discount configuration first.
4. Confirm the Registrar V2 is the active discount consumer.
5. Activate Registrar V2 in the registry.
6. Confirm `registry.registrar()` and retain the previous registrar address as
   the rollback target.

The standalone subdomain registrar does not replace the registry registrar. It
becomes usable when its address and feature flag are configured after testing.

## Production configuration and smoke tests

Configure the V2 quote service and public addresses:

- `XNS_SIGNED_QUOTE_REGISTRAR`
- `XNS_PRICING_POLICY`
- `XNS_PRICING_POLICY_VERSION=v2`
- `XNS_SUBDOMAIN_REGISTRAR`
- `NEXT_PUBLIC_XNS_REGISTRAR`
- `NEXT_PUBLIC_XNS_PRICING_POLICY`
- `NEXT_PUBLIC_XNS_PRICING_POLICY_VERSION=v2`
- `NEXT_PUBLIC_XNS_ADMIN_PRICING_POLICY` (use the V2 policy during a staged rollout)
- `NEXT_PUBLIC_XNS_ADMIN_PRICING_POLICY_VERSION=v2`
- `NEXT_PUBLIC_XNS_SUBDOMAIN_REGISTRAR`
- existing chain, RPC, quote-signer, treasury, and USDC variables

Keep `NEXT_PUBLIC_SIGNED_REGISTRAR_ENABLED=false` and
`NEXT_PUBLIC_SUBDOMAIN_REGISTRATION_ENABLED=false` until a small XDC and USDC
registration, renewal, and regular-account subdomain registration have passed.
Enable the two flags independently after their respective smoke tests.
