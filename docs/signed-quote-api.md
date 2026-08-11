# Signed registrar quote API

`POST /api/v1/registrar/quote` creates a short-lived EIP-712 authorization for the signed-quote registrar. The endpoint is inactive until deployed contract addresses and a policy-authorized signer are configured in the server environment.

## Request

```json
{
  "name": "alice.xdc",
  "product": "registration",
  "termYears": 3,
  "paymentCurrency": "XDC",
  "payer": "0x...",
  "nameOwner": "0x..."
}
```

- `product` is `registration` or `renewal`.
- `termYears` is 1, 3, 5, or 10.
- `paymentCurrency` is `XDC` or `USDC`.
- A renewal requires `payer` and `nameOwner` to be the current owner.

## Server checks

Before signing, the service:

1. validates and canonicalizes the request;
2. confirms the RPC chain ID;
3. reads the policy version, complete configuration, policy price, and payer nonce on-chain;
4. confirms the configured signing account is currently authorized;
5. checks registration availability or renewal ownership;
6. uses the policy's live XDC buffer and the cached CoinGecko XDC/USD quote for XDC, or exact six-decimal USD micros for USDC;
7. creates a ten-minute quote bound to the registrar and chain.

The registrar remains authoritative and repeats security-sensitive checks on-chain.

## Secrets and user data

The signer key is read only from `XNS_QUOTE_SIGNER_PRIVATE_KEY` in the server environment. It must never use a `NEXT_PUBLIC_` name, appear in source control, logs, API output, or client bundles.

The endpoint does not write quote requests, wallet addresses, names, IP addresses, or signatures to Neon. Its rate limiter keeps only a SHA-256 hash of the network source in process memory for up to roughly one minute. This is a best-effort per-instance limit suitable for initial rollout, not a globally durable quota.

## Required environment

- `XNS_SIGNED_QUOTE_REGISTRAR`
- `XNS_PRICING_POLICY`
- `XNS_QUOTE_CHAIN_ID`
- `XNS_QUOTE_RPC_URLS`
- `XNS_QUOTE_SIGNER_PRIVATE_KEY`
- `COINGECKO_DEMO_API_KEY` for XDC quotes

`XNS_QUOTE_RPC_TIMEOUT_MS` is optional.

For Apothem testing, set the chain ID and both deployed contract addresses to the Apothem deployment. Production must use separate environment values and a separate signer from testing.
