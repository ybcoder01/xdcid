# Business namespaces MVP

Business namespaces turn one active XDCID parent name into a paid organization workspace. An organization can issue and revoke controlled subnames such as:

- `alice.company.xdc`
- `treasury.company.xdc`
- `invoice-104.company.xdc`
- `asset-456.company.xdc`

## Revenue model

The standalone `XNSOrganization` contract charges a configurable annual workspace fee in XDC. The fee is supplied at deployment and may be updated by the protocol owner. This PR intentionally does not choose a production price or deploy the contract.

Organizations may subscribe for one through ten years. Renewals extend from the existing paid-through date while the workspace is active, producing recurring protocol revenue without changing ordinary XDCID registration or resolution fees.

## Control model

- Only the current owner of an active parent XDCID can activate or renew its workspace.
- The parent owner can approve operational managers.
- Managers can issue and revoke subnames but cannot renew the workspace, change protocol pricing, withdraw revenue, or transfer the parent name.
- A manager grant is bound to the parent owner who created it. Transferring the parent automatically invalidates every old-owner manager grant.
- Subnames stop resolving when the workspace subscription or parent XDCID expires.
- The current parent owner inherits control of an existing paid workspace after a parent transfer.

## Issuance and resolution

The contract supports one issuance or up to 50 subnames in a single bulk transaction. Each subname resolves to an EVM address through the organization contract. Revocation clears the record immediately.

Organization records are separate from the existing registry. This avoids replacing the active registrar or modifying deployed core contracts. XDCID's website, API, SDK, and future wallet integrations must explicitly query the organization resolver for multi-label names.

## Deployment gates

Before accepting real workspace payments:

1. Review and merge the contract and tests.
2. Select and document the annual pilot price.
3. Obtain a focused independent contract review.
4. Deploy with the existing XNS Registry address and protocol owner or multisig.
5. Verify and publish the source on XDCScan.
6. Configure `NEXT_PUBLIC_XNS_ORGANIZATION` in Vercel.
7. Add organization resolution to the public API and SDK in a separate PR.
8. Pilot with a small number of XDC organizations before broader marketing.

Until a reviewed contract address is configured, the `/business` page displays a deployment-pending warning and cannot submit payments or organization transactions.

## Data and security boundaries

- No private key, seed phrase, API key, customer record, or personal information is stored by this feature.
- XDCID never takes custody of organization funds or user assets.
- All organization administration requires the connected wallet to sign a transaction.
- Revenue remains in the organization contract until the protocol owner withdraws it to an explicitly selected address.
- The contract does not alter the existing Registry, Registrar, Resolver, or Reverse Resolver.
