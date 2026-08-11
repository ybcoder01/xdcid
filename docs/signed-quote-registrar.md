# Signed-quote registrar

`XNSSignedQuoteRegistrar` is the proposed replacement registrar for USD-priced registration and renewal. It is not activated by this change.

## Payment flow

1. The application canonicalizes the requested `.xdc` name and asks the server for a short-lived quote.
2. The server reads the active `XNSPricingPolicy`, obtains the XDC/USD conversion when XDC is selected, and signs EIP-712 typed data.
3. The connected payer submits the quote and signature to the registrar.
4. The registrar independently checks the name, product, term, USD policy price, payer, owner, nonce, timestamps, policy version, signature, token and exact payment.
5. Payment moves directly to the treasury and the existing registry records the name or updated expiry.

The quote signer authorizes conversion amounts; it cannot override the on-chain USD price, supported registration terms, legacy collision guard, payment token, treasury, or payment enablement flags.

## Replay and substitution protection

Every quote is bound to:

- the canonical name node;
- payer and resulting name owner;
- registration or renewal;
- term and policy-derived USD price;
- XDC or the configured USDC token and exact amount;
- pricing-policy version;
- the payer's next sequential nonce;
- issue and expiry timestamps, with a maximum lifetime of 15 minutes;
- the registrar address and current chain through EIP-712 domain separation.

A successful transaction consumes the nonce. A reverted transaction does not consume it.

## Payment rules

- XDC uses the zero address as `paymentToken` and requires exact `msg.value`.
- USDC requires the policy's configured token, zero `msg.value`, and an amount equal to the USD-micro price because USDC uses six decimals.
- Funds are forwarded directly to the policy treasury. The registrar has no withdrawal balance or owner withdrawal function.
- Policy payment flags can pause XDC and USDC independently.

## Contract replacement boundaries

This contract is immutable and references the existing registry, legacy registry, and pricing policy.

No new registrar should be needed for ordinary changes to prices, discounts, quote signer, treasury, USDC address, XDC quote buffer, or payment enablement. Those changes use the pricing policy's delayed configuration process.

A replacement could still be required for a security correction, a different signature/payment model, or new registrar-level products such as subdomains and migration. Those products are intentionally excluded from this PR.

## Deployment

This PR only supplies tooling. It does not deploy or activate contracts.

Required environment values:

- `REGISTRY_ADDRESS`
- `LEGACY_REGISTRY_ADDRESS`
- `PRICING_POLICY_ADDRESS`
- `PRIVATE_KEY` only in the operator's secure deployment environment

Commands:

```sh
pnpm deploy:signed-quote-registrar:apothem
pnpm deploy:signed-quote-registrar:xdc
```

Deployment does not activate the registrar. Activation requires a separate registry-owner transaction after verification and testing. Never commit a quote-signing key, deployment key, explorer key, or RPC credential.
