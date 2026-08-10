# Admin operations dashboard

The admin page is restricted in the interface to the wallet returned by the registrar contract's `owner()` function.

## First phase

The first operations phase adds read-only visibility without expanding administrator authority:

- live latest-block checks for Ethereum, XDC, Polygon, Base, and Arbitrum;
- coarse Neon database connectivity and latency;
- all 25 same-chain and cross-chain route configurations;
- Standard/direct and Automatic forwarding availability;
- configured USDC, Circle CCTP, convenience-fee, and fee-recipient values;
- the existing registrar balance and owner-only withdrawal transaction.

## Data and security boundaries

The health endpoint returns only whether the database is configured and reachable, its check latency, and the check timestamp. It does not return database records, connection strings, environment variables, API keys, wallet secrets, or user information.

Network checks use the same public RPC configuration as the application. A green RPC result confirms that a recent block number was readable; it does not guarantee that Circle, a wallet, or every transaction route will succeed.

Client-side owner gating protects the administrative interface, but future APIs that expose private aggregates or perform mutations must add server-verified wallet sessions. High-impact actions should not rely on the hidden interface alone.

## Later phases

Payment search and recovery, private revenue aggregates, feature flags, pricing, discounts, whitelists, and migration controls remain separate phases. Any server-side administrative mutation should require a fresh wallet signature, an expiring session, role checks where applicable, and an audit trail.
