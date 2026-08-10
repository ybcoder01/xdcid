# RPC fallback configuration

XDCID uses viem fallback transports for application reads on Ethereum, XDC, Polygon, Base, and Arbitrum.

Each network has at least two public HTTPS defaults. The client ranks endpoints using recent stability and latency, retries a failed request once, and moves to another provider when necessary.

## Optional Vercel configuration

A comma-separated list can be supplied for any network:

- `NEXT_PUBLIC_ETHEREUM_RPC_URLS`
- `NEXT_PUBLIC_XDC_RPC_URLS`
- `NEXT_PUBLIC_POLYGON_RPC_URLS`
- `NEXT_PUBLIC_BASE_RPC_URLS`
- `NEXT_PUBLIC_ARBITRUM_RPC_URLS`

Configured endpoints are preferred and the public defaults remain as fallbacks. The existing singular `NEXT_PUBLIC_XDC_RPC_URL` remains supported.

Variables beginning with `NEXT_PUBLIC_` are embedded in browser code. Do not place confidential unrestricted provider credentials in these variables. If a provider requires a key, use a browser-safe, domain-restricted project credential and configure usage limits.

## Operational meaning

The admin panel shows the number of fallback providers and whether a latest block can be read through the combined transport. An online result means at least one provider answered. It does not prove that every configured provider is healthy or that a wallet's own RPC is available.
