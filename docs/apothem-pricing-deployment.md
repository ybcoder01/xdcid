# Apothem pricing-stack deployment

This is a temporary Preview-only wallet deployment flow for XDCID pricing tests. It deploys no contract until the designated wallet approves each transaction.

## Fixed test configuration

- Network: XDC Apothem, chain ID 51
- Allowed wallet, owner, treasury, and quote signer:
  `0x9c67d6cfE6A73497e7348b6b852495CA6236C29a`
- Circle Apothem USDC:
  `0xb5AB69F7bBada22B28e79C8FFAECe55eF1c771D4`
- Root prices: $20 / $10 / $5 per year
- Subdomain price reserved in policy: $1 per year
- Migration price reserved in policy: $3
- Discounts: 10% for 3 years, 15% for 5 years, 20% for 10 years
- XDC quote buffer: 2%

## Deployment sequence

1. `XNSRegistry`
2. empty `MockLegacyRegistry`, used only to validate fail-closed collision behavior
3. `XNSPricingPolicy`
4. `XNSSignedQuoteRegistrar`
5. separate `setRegistrar` activation after dependency validation

The page waits for two confirmations, checks deployed code, checks both owners, and checks all registrar dependencies before enabling activation.

## Preview use

1. Merge the deployment-page PR.
2. Create or use a Vercel Preview deployment.
3. Add `ENABLE_APOTHEM_DEPLOYMENT=true` to Preview only.
4. Redeploy that Preview.
5. Visit `/deployment/apothem-pricing`.
6. Connect the exact allowed wallet using its injected browser extension.
7. Approve the four deployments one at a time.
8. Review the addresses, then approve activation separately.
9. Copy the public contract addresses and transaction hashes.
10. Remove `ENABLE_APOTHEM_DEPLOYMENT` and redeploy or delete the Preview.

Do not enable the route in Production. The route never asks for or handles a private key. It keeps deployment addresses only in React memory, so do not reload midway through the sequence.

## Verification and application testing

After deployment, verify and publish each contract using Hardhat/CLI with the constructor values shown above. Then configure a Vercel Preview with the Apothem addresses and the test-only quote-signing key. Verification and frontend integration are separate steps; this deployment page does not alter production XDCID configuration.
