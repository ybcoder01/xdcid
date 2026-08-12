# Wallet-signed XDC mainnet pricing deployment

This temporary Vercel Preview flow deploys the two contracts already approved
for the pricing rollout. It does not activate either contract or alter the
existing registry.

## Fixed mainnet configuration

- Network: XDC mainnet, chain ID 50
- Allowed deployer, initial policy owner, temporary quote signer, and treasury:
  `0xe82a4267CC310FC6Db334601671A043DFc8Ce06A`
- Existing XNS registry:
  `0x05fa64a05bc205DeDF47e023d2D90c2d119cd097`
- XDCDomains legacy registry:
  `0x295a7aB79368187a6CD03c464cfaAb04d799784E`
- XDC USDC:
  `0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1` (must return 6 decimals)
- Annual prices: $20 for three characters, $10 for four, and $5 for five or more
- Reserved prices: $1 annual subdomain and $3 migration
- Term discounts: 10% for three years, 15% for five, and 20% for ten
- XDC quote buffer: 2%
- Rabby-compatible deterministic deployment proxy:
  `0x4e59b44847b379578588920ca78fbf26c0b4956c`

## Safety boundary

The page:

- is available only when Vercel reports a Preview deployment and
  `ENABLE_MAINNET_PRICING_DEPLOYMENT=true`;
- accepts only the fixed owner wallet on chain ID 50;
- validates existing dependency bytecode, registry ownership, and USDC decimals;
- deploys `XNSPricingPolicy`, then `XNSSignedQuoteRegistrar`, through the
  deterministic proxy so every Rabby transaction has a valid `to` address;
- waits for two confirmations and validates owners, roles, payment settings,
  policy version, and registrar immutable dependencies;
- has no registrar activation function;
- stores addresses and transaction hashes only in React memory;
- never asks for, reads, transmits, or stores a private key.

## Deployment steps

1. Merge the focused deployment-page PR.
2. Open a Vercel Preview deployment for the merged commit or a temporary branch.
3. Add `ENABLE_MAINNET_PRICING_DEPLOYMENT=true` to Preview only.
4. Redeploy the Preview and visit `/deployment/mainnet-pricing`.
5. Connect the current owner wallet and complete the read-only preflight.
6. Review the four fixed public addresses and pricing values.
7. Approve the pricing-policy proxy transaction.
8. Approve the registrar proxy transaction.
9. Save both contract addresses and transaction hashes.
10. Remove the Preview flag immediately and redeploy or delete the Preview.

Do not enable the flag in Production.

## After deployment

Deployment is intentionally not activation. Next:

1. verify and publish both contracts through Hardhat and XDCScan CLI;
2. assign a dedicated low-value quote signer through the pricing-policy admin
   flow before production quote signing;
3. add only that dedicated signer key to Vercel as a server-only secret;
4. run the read-only activation preflight;
5. obtain explicit approval before sending the activation transaction;
6. enable the signed registrar frontend only after activation tests pass.
