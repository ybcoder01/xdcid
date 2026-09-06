# Admin operations dashboard

The admin page requires a server-verified session from a wallet holding at least
one recognized role. Each role sees only its permitted sections.

## Authentication

After the connected wallet matches the registrar owner, archive administrator,
treasury, or active domain-discount signer, it signs a human-readable login
message. Signing does not submit a transaction or cost gas.

The server:

- issues a random challenge that expires after five minutes;
- stores only the challenge hash and metadata in Neon;
- accepts each challenge once to prevent replay;
- re-reads the registrar owner directly from XDC;
- verifies normal wallet signatures and ERC-1271 smart-account signatures;
- returns a signed, HTTP-only, SameSite=Strict session cookie that expires after 15 minutes;
- re-checks the current registrar owner when an authenticated endpoint is used.

The domain-discount signer receives only `discount:issue`. It cannot see owner,
treasury, archive, or revenue controls unless the same wallet independently
holds one of those roles.

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
- an owner-only legacy registrar recovery control, shown only when that
  historical contract still holds native XDC;
- authenticated, read-only Pay Link and forwarding recovery search by Pay Link ID, payer wallet, fee transaction hash, or burn transaction hash;
- a read-only forwarding monitor that classifies fee-paid flows without a recorded burn as in progress (under 15 minutes), delayed (15–59 minutes), needs attention (60 minutes or more), or recovery expired;
- verified forwarding revenue, recipient volume, fee count, burn-recorded ratio, route breakdown, and 7/30/90-day trends.

## Data and security boundaries

The protected health endpoint returns only whether the database is configured and reachable, its check latency, and the check timestamp. It does not return database records, connection strings, environment variables, API keys, wallet secrets, or user information.

Network checks use the same public RPC configuration as the application. A green RPC result confirms that a recent block number was readable; it does not guarantee that Circle, a wallet, or every transaction route will succeed.

The forwarding monitor derives alerts from existing short-lived recovery records and does not create another user-data store. It shows up to 50 highest-priority retained records, route-level warning counts, and direct links into recovery search. Alerts do not prove that funds are lost and do not trigger retries or transactions.

The recovery search reports only states persisted by XDCID. A recorded burn does not prove that Circle attestation or destination mint has completed; the dashboard directs the payer to the wallet recovery flow for those checks. The admin interface does not sign, broadcast, retry, or move funds.

Revenue reporting uses a separate minimal ledger populated only after the source-chain convenience-fee transaction is verified. It retains the fee transaction hash, route, recipient amount, XDCID fee amount, timestamp, and burn-recorded timestamp. It does not retain payer or recipient wallet addresses beyond the existing short-lived recovery records. Circle fees are excluded because they are not XDCID revenue.

Feature flags, pricing, migration controls, other privileged mutations, and
audit trails remain separate phases.

## Domain purchase grants

The active Registrar V2 discount signer can issue a narrowly scoped grant from
the dashboard. Every grant is limited to one beneficiary wallet, exact `.xdc`
name, registration term, discount percentage, validity window, and maximum use
count. A 100% discount makes the domain price zero, so the beneficiary pays only
network gas. Checkout applies a usable matching grant automatically; all other
registrations keep using the normal on-chain price.

Beneficiary wallets and names are stored as keyed lookup fingerprints, while
the recoverable grant payload is encrypted with the existing payment-record
encryption configuration. Signatures remain subject to the discount contract's
on-chain expiry and use count. Grants currently cover top-level registration
only. The deployed standalone Subdomain Registrar has no discount-authorization
interface, so subdomain gas-only grants require a future contract version.

Current Registrar V2, subdomain, archive-subscription, and cross-chain revenue
is forwarded directly to the configured treasury. The Admin dashboard does not
offer a general withdrawal action for current revenue. Production checks the
known original mainnet registrar by default; `NEXT_PUBLIC_XNS_LEGACY_REGISTRAR`
can override that address for another environment. Its recovery control remains
hidden from every wallet except that contract's owner and is automatically
hidden after the balance reaches zero.
