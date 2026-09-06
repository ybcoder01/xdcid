# XDC mainnet pricing rollout

> This document describes the already-deployed legacy pricing stack. For the
> V2 rollout with two-character names and regular-account subdomains, use
> `docs/mainnet-wallet-deployment.md`.

This procedure replaces only the active registrar. The existing registry,
resolver, reverse resolver, records, and registered names remain in place.

## Safety boundaries

- Deployment does not activate the new registrar.
- Activation requires the registry-owner wallet and an exact confirmation value.
- The frontend remains on the existing registrar until
  `NEXT_PUBLIC_SIGNED_REGISTRAR_ENABLED=true`.
- Never commit a private key, quote-signer key, explorer key, or private RPC URL.
- Record the current registrar before activation; it is the rollback target.
- Subdomains and migration are not enabled by this rollout.

## Roles to confirm

Use separate addresses where practical:

- registry owner: authorizes activation and rollback;
- policy owner: proposes delayed pricing and operational changes;
- quote signer: server-side signing account with no treasury or owner authority;
- treasury: receives XDC and USDC directly.

Confirm the production USDC contract on XDC mainnet and verify that
`decimals()` returns 6. The deployment script rejects any other decimal count.

## 1. Pre-deployment

Set the operator environment values listed in `.env.example`. Run:

```sh
pnpm test
pnpm build
```

Review all printed addresses before signing. Then deploy without activating:

```sh
pnpm deploy:pricing-stack:xdc
```

Save the pricing-policy and registrar addresses and transaction hashes.

## 2. Verify through Hardhat CLI

Set `PRICING_POLICY_ADDRESS` and `NEW_SIGNED_REGISTRAR` to the deployed
addresses, keep the constructor inputs unchanged, and run:

```sh
pnpm verify:pricing-stack:xdc
```

Confirm both source pages show the expected constructor arguments on XDCScan.

## 3. Read-only activation preflight

Run the command without the confirmation variable:

```sh
pnpm preflight:signed-registrar:xdc
```

It checks chain ID, bytecode, registry ownership, all immutable registrar
dependencies, policy signer, USDC, treasury, payment flags, and policy version.
It prints the current registrar as the rollback target and sends no transaction.

## 4. Configure the quote service

Add these server-only Production variables in Vercel:

- `XNS_SIGNED_QUOTE_REGISTRAR`
- `XNS_PRICING_POLICY`
- `XNS_QUOTE_CHAIN_ID=50`
- `XNS_QUOTE_RPC_URLS`
- `XNS_QUOTE_SIGNER_PRIVATE_KEY`
- `COINGECKO_DEMO_API_KEY`

Do not enable the public frontend flag yet. Test the quote endpoint against a
known unavailable name and a fresh available name. Confirm the returned
registrar, policy, chain, signer authorization, price, token, payer, and expiry.

## 5. Activate

After verification and explicit approval, run the same preflight with:

```sh
CONFIRM_SIGNED_REGISTRAR_ACTIVATION=ACTIVATE_XDC_MAINNET \
  pnpm activate:signed-registrar:xdc
```

Immediately confirm `registry.registrar()` and run one small XDC registration
and renewal. Then test USDC approval, registration, and renewal with a fresh
name.

## 6. Enable the frontend

Set the public Production values to the existing registry/resolvers and the new
registrar, then set:

```
NEXT_PUBLIC_SIGNED_REGISTRAR_ENABLED=true
```

Redeploy Production. The flag switches both registration and dashboard renewal
from the legacy fixed-XDC calls to the signed XDC/USDC flow.

## 7. Rollback

If registration or renewal fails after activation, first set
`NEXT_PUBLIC_SIGNED_REGISTRAR_ENABLED=false` and redeploy. Then run the
rollback preflight with the exact active and previous registrar addresses:

```sh
pnpm rollback:signed-registrar:xdc
```

Only after reviewing the output, send the rollback transaction with:

```sh
CONFIRM_REGISTRAR_ROLLBACK=ROLLBACK_XDC_MAINNET \
  pnpm rollback:signed-registrar:xdc
```

Changing the active registrar does not delete existing registry records.
