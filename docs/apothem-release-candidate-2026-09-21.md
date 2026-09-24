# Apothem release candidate evidence — 21 September 2026

> **Historical evidence:** This snapshot predates the Registry V2 migration.
> Its addresses must not be treated as the current Apothem configuration. See
> [`registry-v2-migration.md`](./registry-v2-migration.md) for the
> reviewed replacement stack and activation procedure.

This document records the tested state of the XDCID Apothem release candidate.
It is evidence for a future production decision, not approval to deploy contracts,
change Production environment variables, or merge `dev` into `main`.

## Immutable tested build

| Item | Value |
| --- | --- |
| Git branch | `dev` |
| Git commit | [`777893c3376dc613a10af808b5688ab13551f7b7`](https://github.com/ybcoder01/xdcid/commit/777893c3376dc613a10af808b5688ab13551f7b7) |
| Pull request included at the tested head | [#234](https://github.com/ybcoder01/xdcid/pull/234) |
| Vercel deployment | `dpl_2YnspWkq2WULwJwyjDXKh2hh7ErR` |
| Deployment URL | `build-mvp-xns-protocol-xin-names-1y1qn018c.vercel.app` |
| Staging alias | [`dev.xdcid.xyz`](https://dev.xdcid.xyz) |
| Vercel state | `READY` |
| Vercel commit status | `success` |
| Test network | XDC Apothem, chain ID `51` |

The Vercel deployment metadata for the staging alias points to the Git commit
shown above. This binds the manual results below to an exact application build.

## Tested Apothem contracts

| Component | Address |
| --- | --- |
| Registry | `0x2BeD8EB404e1BD8D690e3dD2Fd06F287e5A92Eb1` |
| Primary-aware Registrar | `0xE35722cB7d04Ba36ed284910528A64B1dE855a20` |
| Reverse Resolver V3 | `0x1ff9B9c9463a2d85029bdD3AFC99a8cf51260Ee2` |
| Multichain Resolver V2 | `0x2212Fc40Feda6e8DD7030E9B70B38c7EB79f6989` |
| Discount Authorization | `0x37A013d55393f0824eFD40C648111f39D18C5F46` |
| Previous Registrar / rollback target | `0x506B82DaD0cf55d909D9C6F0edD5A7939339256d` |

The matching Preview configuration is documented in
[`apothem-primary-resolution-rollout.md`](./apothem-primary-resolution-rollout.md).
Do not copy these Apothem addresses into Production.

## Manual lifecycle result

The complete disposable-wallet lifecycle was reported as passing on
21 September 2026:

1. Wallet A stayed connected after refresh and navigation between Dashboard and
   Send.
2. A new `.xdc` name registered through
   `0xE35722cB7d04Ba36ed284910528A64B1dE855a20`, appeared on the Dashboard,
   became the first primary ID automatically, and replaced the shortened wallet
   address in the header.
3. Before overrides were saved, XDC, Ethereum, Base, Arbitrum, and Polygon each
   resolved to Wallet A.
4. After five distinct overrides were saved, every network resolved only to its
   configured destination.
5. Clearing one override restored only that network to the owner-wallet fallback
   and preserved the other four records.
6. Registering a second name did not replace the first primary ID; manual primary
   selection succeeded.
7. After transfer, the name disappeared from Wallet A, appeared for Wallet B,
   did not reuse Wallet A's owner-bound records, and accepted Wallet B's new
   records and primary selection.
8. Rejecting a registration or update recovered to a usable interface and did
   not display the rejected change as saved.
9. Renewal succeeded and increased the expiration date.

These results validate the listed Apothem contracts and tested frontend build.
They do not validate XDC mainnet deployments, Production environment variables,
signer operations, treasury configuration, or a production data migration.

## Production release gates

Do not promote this build or activate a new mainnet contract stack until every
applicable gate below is complete and recorded with addresses and transaction
hashes.

### Contract and security gates

- Deploy and independently verify the owner-bound mainnet resolver suite.
- Confirm the Registry-authorized Registrar and all immutable contract
  dependencies match the intended mainnet deployment.
- Re-run the full ownership lifecycle against the exact mainnet candidate
  contracts with disposable, low-value names.
- Resolve the outstanding security-review requirement to move protocol
  administration from a single EOA to a hardware-backed multisig, or explicitly
  document and accept that launch risk.
- Establish a single typed mainnet deployment manifest and complete ownership
  migration tooling before broader rollout.
- Decide whether the deployed but unreleased Subdomain Registrar is paused or
  deliberately left callable, and document that decision.
- Preserve the previous mainnet configuration and transaction procedure required
  for rollback.

### Configuration gates

- Review Preview and Production variables side by side without copying secrets
  or values between environments.
- Verify Production chain ID is `50` and that no Apothem deployment flag or
  address is present.
- Verify public Registry, Registrar, forward, reverse, multichain, pricing,
  subdomain, WalletConnect, and RPC settings against the approved manifest.
- Verify server-only quote Registrar, pricing policy, signer, treasury, database,
  encryption, and admin variables independently.
- Confirm the quote signer authorized on-chain matches the Production signer
  without exposing its private key.
- Keep upcoming Subdomains disabled unless separately approved and tested.

### Application and operational gates

- Run type checking, the complete automated test suite, contract tests, SDK tests,
  and a production-mode frontend build at the release commit.
- Repeat registration, renewal, primary-ID, five-network resolution, record
  clearing, transfer, rejected-transaction, wallet restore, and account-switch
  tests against the production candidate.
- Verify public API and SDK resolution return the same destinations as the UI.
- Verify monitoring, RPC failover, analytics, support contact, incident response,
  and rollback ownership before launch.
- Open a dedicated `dev` to `main` release pull request and merge it only
  after explicit production approval.

## Release decision

**Apothem status:** lifecycle validation passed for the immutable build above.

**Production status:** not yet approved. The mainnet resolver deployment,
configuration verification, administrative-control remediation or risk
acceptance, production-mode verification, and explicit release approval remain
open.
