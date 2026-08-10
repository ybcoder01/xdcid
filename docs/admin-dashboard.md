# Admin operations dashboard

The admin page requires both the registrar owner wallet and a server-verified admin session.

## Authentication

After the connected wallet matches the registrar contract's current `owner()`, the owner signs a human-readable login message. Signing does not submit a transaction or cost gas.

The server:

- issues a random challenge that expires after five minutes;
- stores only the challenge hash and metadata in Neon;
- accepts each challenge once to prevent replay;
- re-reads the registrar owner directly from XDC;
- verifies normal wallet signatures and ERC-1271 smart-account signatures;
- returns a signed, HTTP-only, SameSite=Strict session cookie that expires after 15 minutes;
- re-checks the current registrar owner when an authenticated endpoint is used.

Changing accounts, transferring registrar ownership, expiry, signature tampering, or ending the session removes access. Wallet signatures and private keys are not stored.

## Deployment configuration

Set `ADMIN_SESSION_SECRET` in Vercel as a server-only environment variable. Use at least 32 random bytes, keep it out of source control, and redeploy after adding or rotating it. The existing `DATABASE_URL` is used for one-time challenges. The application creates the challenge table and indexes with `IF NOT EXISTS`; migration `db/migrations/0005_admin_auth_challenges.sql` is also included for managed database rollouts.

Rotating `ADMIN_SESSION_SECRET` immediately invalidates existing admin sessions.

## Operations view

The operations view provides:

- live latest-block checks for Ethereum, XDC, Polygon, Base, and Arbitrum;
- coarse Neon database connectivity and latency;
- all 25 same-chain and cross-chain route configurations;
- Standard/direct and Automatic forwarding availability;
- configured USDC, Circle CCTP, convenience-fee, and fee-recipient values;
- the existing registrar balance and owner-only withdrawal transaction;
- authenticated, read-only Pay Link and forwarding recovery search by Pay Link ID, payer wallet, fee transaction hash, or burn transaction hash.

## Data and security boundaries

The protected health endpoint returns only whether the database is configured and reachable, its check latency, and the check timestamp. It does not return database records, connection strings, environment variables, API keys, wallet secrets, or user information.

Network checks use the same public RPC configuration as the application. A green RPC result confirms that a recent block number was readable; it does not guarantee that Circle, a wallet, or every transaction route will succeed.

The recovery search reports only states persisted by XDCID. A recorded burn does not prove that Circle attestation or destination mint has completed; the dashboard directs the payer to the wallet recovery flow for those checks. The admin interface does not sign, broadcast, retry, or move funds.

Private revenue aggregates, feature flags, pricing, discounts, whitelists, migration controls, privileged mutations, and audit trails remain separate phases.
