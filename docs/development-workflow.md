# Development and production workflow

XDCID uses two permanent branches and two Vercel environments.

| Git branch | Purpose | Vercel environment | Domain |
| --- | --- | --- | --- |
| `dev` | Staging, integration testing, and temporary feature validation | Preview | `https://dev.xdcid.xyz` |
| `main` | Production releases only | Production | `https://xdcid.xyz` |

## Feature workflow

1. Create a short-lived feature or fix branch from `dev`.
2. Open a pull request targeting `dev`.
3. Require CI to pass.
4. Merge into `dev` and test the deployed change on `dev.xdcid.xyz`.
5. Fix any issue through another pull request targeting `dev`.
6. When a tested release is approved, open a dedicated release pull request from `dev` to `main`.
7. Merge the release pull request only after explicit production approval.

Do not push feature work directly to `main`.

## Environment boundaries

- Production configuration belongs only to the Vercel Production environment.
- Staging configuration belongs to Preview and, where supported, is restricted to the `dev` Git branch.
- The `dev` deployment uses a separate Neon database branch.
- Secrets and API keys must remain in Vercel or the relevant provider; never commit them.
- Apothem/testnet deployment controls must not be enabled in Production.
- Mainnet deployment controls must not be enabled on staging unless a specific test requires read-only mainnet access.
- The custom staging domain is assigned only to deployments created from the permanent `dev` branch.

## Release checklist

Before merging `dev` into `main`:

- CI passes.
- The affected flows have been tested on `dev.xdcid.xyz`.
- Contract addresses and chain IDs match the intended environment.
- No secret, private key, API key, or database URL appears in the diff.
- Database migrations are reviewed for backward compatibility and rollback.
- Any contract deployment or activation is explicitly approved.
- Production environment variables are unchanged unless the release requires and documents the change.
