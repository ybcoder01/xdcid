# Unified XDCID protocol V3

## Status

Registry V3, the Unified Registrar, the Universal Resolver, and the retained
Pricing Policy V2 are implemented and tested locally. They are not deployed or
active in any environment. The existing deployment remains canonical until the
migration and activation gates in this document are completed.

## Final product rules

- Any wallet may receive a subdomain without accepting it.
- The child owner cannot transfer the subdomain.
- Only the current parent owner can register, renew, reassign, recall, or
  release a subdomain. Parent operators and nested subdomains are not supported.
- A child expires immediately at its own expiry and can never outlive its
  parent. Renewing a parent does not renew or reactivate a child.
- Expired child labels remain reserved until the parent explicitly renews or
  releases them.
- A parent transfer preserves its children and gives parent authority to the
  new parent owner.
- The child owner alone controls forward/profile records and Primary selection.
- Every active name forward-resolves to its current owner by default. Primary
  selection controls the canonical address-to-name direction.
- Assigning a child never sets another wallet's Primary ID. A self-registration
  may initialize the wallet's first Primary, but cannot replace a valid one.
- Only one subdomain level is supported: `employee.company.xdc`.
- Naming is ASCII lowercase letters, digits, and internal hyphens. Input ASCII
  uppercase is canonicalized to lowercase.
- Registration remains paid through short-lived signed quotes.

## Four-contract architecture

### `XNSRegistryV3`

The sole ownership source for top-level names and subdomains. It stores owner,
resolver pointer, expiry, parent node, kind, and an independent monotonic
ownership generation. It is non-upgradeable, uses two-step ownership transfer,
and requires a 48-hour registrar rotation.

Top-level owners may transfer their name. Subdomains are non-transferable by
their child owner and can only be reassigned by the parent through the active
registrar. Every registration lifecycle, transfer, reassignment, reactivation,
and release advances the generation. Ordinary active renewals do not.

### `XNSUnifiedRegistrar`

Contains top-level and subdomain registration policy, renewal, reassignment,
recall, release, signed quotes, consolidated discount authorization, payments,
pause controls, and legacy subdomain import. Payments move directly to the
treasury configured in Pricing Policy V2.

Discount grants preserve the existing dashboard signing domain and read
interface. Exact-name grants, maximum uses, validity windows, consumption,
revocation, and the 48-hour delayed signer rotation remain available. The
authorization consumer is permanently the Unified Registrar and cannot be
redirected to another contract.

The contract is compiled through IR with one optimizer run. CI enforces the
EIP-170 deployed-bytecode limit and at least 512 bytes of headroom.

### `XNSPricingPolicyV2`

Remains a separate contract so the complete existing admin pricing surface is
preserved: two-, three-, and four-character prices, standard registration,
ordinary and premium subdomain prices, migration price, three-/five-/ten-year
discounts, XDC quote buffer, quote signer, USDC token, treasury, and both
payment switches. Proposed configuration still has a 48-hour delay, and the
previous complete configuration and signer remain valid only during the
five-minute quote grace period.

## Admin-dashboard compatibility

- Pricing fields and operational settings continue to read and write directly
  through Pricing Policy V2.
- The Unified Registrar identifies itself through `discountAuthorization()`
  and preserves the existing discount signing domain and validation interface,
  so exact-name grants continue to work without a second authorization module.
- Registry V3 and Unified Registrar ownership transfers are two-step. When
  `NEXT_PUBLIC_XNS_PROTOCOL_GENERATION=unified-v3`, the admin dashboard shows
  the pending owner and an `Accept ownership` action for the destination wallet.
- Existing environments retain their current one-step Registry/Policy UI until
  the unified-generation flag is explicitly enabled.

## Application transaction cutover

The API, frontend, and SDK support both generations. Existing deployments stay
on their current typed-data domains, quote shapes, and contract function names
until `NEXT_PUBLIC_XNS_PROTOCOL_GENERATION=unified-v3` is enabled.

## Deployment and migration gates

Deployment is deliberately separate from frontend activation:

1. Set the existing Registry, Subdomain Registrar, Pricing Policy V2, protocol
   owner, authorization signer, and an explicit acknowledged chain ID.
2. Run `deploy:unified:apothem` or `deploy:unified:xdc`. The script deploys the
   three new contracts and initializes only the new Registry. It does not change
   any live legacy contract or frontend configuration.
3. Verify all three contracts with the matching `verify:unified:*` command.
4. If the Registry reports a pending owner, the configured protocol owner must
   accept ownership. `preflight:unified:*` fails until this is complete.
5. Capture migration inputs with a block number and block hash, migrate the
   intended records, and run `reconcile:unified:*` with
   `UNIFIED_MIGRATION_SNAPSHOT`. The reconciliation refuses to proceed if the
   source block hash changed, which makes a rollback or reorganization visible.
6. Run smoke tests and obtain explicit release approval before setting
   `NEXT_PUBLIC_XNS_PROTOCOL_GENERATION=unified-v3` and the V3 addresses.

`docs/unified-migration-snapshot.example.json` documents the reconciliation
input. Ownership, expiry, parent relationships, ownership kind, and configured
routes are checked against Registry V3 and the Universal Resolver.

For a unified environment, `XNS_SIGNED_QUOTE_REGISTRAR` and
`NEXT_PUBLIC_XNS_REGISTRAR` must both point to the Unified Registrar. The
subdomain quote service deliberately uses that same registrar, while ownership
and child availability are read from Registry V3. API responses include
`protocolGeneration`, and clients reject a response whose generation does not
match their configured writer. This makes an incomplete or split cutover fail
before wallet submission instead of calling an incompatible ABI.

Legacy quote and transaction paths remain compiled and tested for rollback.
Enabling the generation flag does not deploy, activate, pause, or mutate any
contract by itself.

### `XNSUniversalResolver`

Combines default forward, five-network address, text/profile, and verified
reverse/Primary records. Every record stores the current owner and Registry V3
generation. A stale record is ignored after expiry, transfer, reassignment,
recall, release, or re-registration. Reverse results are returned only while
the same name remains actively owned by the account and forward-resolves back
to it for the requested chain.

The resolver exposes a registrar-only, one-time route import for an already
verified legacy subdomain owner. It cannot import a record for anyone other
than the current Registry V3 owner.

## Migration

1. Pause old top-level and subdomain registrations. Transfers and record reads
   remain available.
2. Record the migration block and derive the complete active-name/subdomain
   inventory from events and the existing index.
3. Deploy Registry V3 with Registry V2 as its immutable legacy source.
4. Deploy the Universal Resolver bound to Registry V3.
5. Retain or deploy the reviewed Pricing Policy V2 configuration, then deploy
   the Unified Registrar with that policy and the existing Subdomain Registrar
   as its immutable migration source.
6. Initialize Registry V3's registrar once with the Unified Registrar.
7. Verify source, constructor bindings, runtime bytecode, ownership, price
   configuration, signer, token, treasury, and pause state.
8. Permissionlessly import every active legacy subdomain. Import preserves its
   owner, parent, expiry, and routes for XDC, Ethereum, Base, Arbitrum, and
   Polygon. Reconcile the emitted import count against the frozen inventory.
9. Switch only Apothem/dev configuration and execute the complete lifecycle
   test matrix.
10. Obtain an independent review of the four final artifacts and migration
    reconciliation before any mainnet activation.
11. Switch the SDK, API, frontend, quote service, and indexer atomically. No
    first-party writer may remain pointed at an old registrar or resolver.
12. Keep old contracts deployed and readable, but paused and noncanonical.

## Activation invariants

- Registry V3's active registrar is exactly the reviewed Unified Registrar.
- The registrar and resolver both reference the reviewed Registry V3.
- The quote and discount signers, treasury, and USDC token equal the approved
  deployment manifest.
- All four contracts have verified bytecode and expected owners.
- Imported subdomain count, owner, parent, expiry, and five routes match the
  migration snapshot.
- No child expiry exceeds its parent expiry.
- No imported name has ownership generation zero.
- A route written in an earlier generation is inactive.
- A reverse result is never returned without matching current forward
  resolution.

## Audit finding disposition

| Finding | V3 disposition |
| --- | --- |
| H-01 stale forward records | Closed in design: every record is generation-bound and owner-checked. |
| M-01 administrative key concentration | Code uses `Ownable2Step` and delayed registrar/config changes. Preflight requires the configured protocol owner to accept Registry ownership before activation. |
| M-02 incomplete manifests/tooling | Guarded deploy, verify, preflight, and block-hash-bound reconciliation commands now cover all four addresses and constructor/configuration bindings. A finalized environment manifest remains an activation artifact. |
| L-01 stale reverse names | Closed in design: Primary records are generation-bound, owner-checked, and forward-verified. |
| L-02 unsafe Registry values/events | Closed in design: zero owners/registrars are rejected, release is explicit, expired resolvers fail closed, and every mutation emits an indexed event. |
| L-03 ineffective quote grace | Closed in design: prior-version prices and signer remain available only for the five-minute grace. |
| I-01 live contract hidden by UI | Migration requires old registration entry points to be paused on-chain, not merely hidden. |
| I-02 analysis coverage | Dedicated lifecycle/invariant, adversarial reentrancy, and bytecode-size tests are blocking. Slither remains blocking. Independent external review remains a launch gate. |

The internal review cannot itself satisfy the independent-audit recommendation.
That item should not be described publicly as completed until it actually is.
