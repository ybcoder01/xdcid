# Registry V2 migration and long-lived architecture

## Objective

Registry V2 is intended to be the final ownership anchor for XDCID names. It
adds an ownership-generation invariant without requiring a centralized bulk
copy of current names. Registrars, pricing, discounts, resolvers, and subdomain
services remain replaceable modules so future product work does not require a
new Registry or a user-record migration.

Registry V2 is non-upgradeable. This avoids a proxy administrator being able to
silently change name ownership rules. Protocol ownership should move to the
planned multisig after rollout.

## Existing-name inheritance

Before migration, `ownerOf`, `expiryOf`, `resolverOf`, and `records` read the
immutable legacy Registry. Existing names therefore remain visible without an
administrator importing owner addresses.

Generation `0` is intentionally read-only. An existing owner performs one
`migrateName(node)` transaction before setting a primary name, profile, or
multichain destination. Renewal, transfer, or setting the Registry resolver also
anchors the name automatically. Once anchored, Registry V2 is authoritative and
later mutations in the legacy Registry cannot alter the V2 owner.

New registrations start directly in Registry V2 and require no migration step.

## Stale-record invariant

Every new registration lifecycle and ownership transition advances a monotonic
generation. Forward addresses, profile text, primary-name records, and
multichain destinations store the generation in which the owner created them.
They are active only while both owner and generation match.

This prevents stale records from reappearing after:

- owner A transfers to B and later receives the name again;
- a name expires and the same wallet registers it again;
- a legacy name is anchored and then transferred;
- a transferred name is configured by its new owner.

Ordinary renewals do not advance the generation and therefore do not erase
records.

## Stable modules

The Registry address remains stable. The following contracts are modules and
may be replaced independently if product rules change:

- primary registrar;
- pricing policy;
- discount authorization;
- forward/profile resolver;
- reverse/primary resolver;
- multichain resolver;
- subdomain registrar.

Registry V2 permits its first registrar to be bootstrapped once. Every later
registrar rotation uses a mandatory 48-hour proposal delay. Ownership uses
OpenZeppelin's two-step transfer flow.

Replacing a resolver does not migrate ownership. Users may set the resolver
pointer or write fresh records in a replacement module. Deploying new modules
should be exceptional and does not require replacing the Registry.

## Rollout gates

No current mainnet contract or environment variable should change until all of
the following pass on Apothem:

1. Deploy Registry V2 with the current Apothem Registry as its immutable legacy
   source.
2. Deploy the registrar and resolver suite bound to Registry V2.
3. Bootstrap the registrar once and configure its existing pricing, discount,
   treasury, token, and signer dependencies.
4. Update the dev environment only.
5. Test an unmigrated legacy name, explicit migration, renewal migration,
   transfer migration, new registration, expiry, A → B → A, five-network
   destinations, primary selection, and rejected transactions.
6. Verify every contract and run the deployment preflight against multiple RPCs.
7. Document the exact mainnet deployment, activation, rollback, and user-facing
   migration flow before signing a mainnet transaction.

The already deployed primary-resolution candidate suite is bound to the current
Registry and must not be treated as the Registry V2 suite. Its pending
activation should remain untouched while Registry V2 is tested.

## Apothem deployment console

The protected Vercel Preview route
`/deployment/apothem-registry-v2` is available only when
`ENABLE_APOTHEM_REGISTRY_V2_DEPLOYMENT=true`. Never enable this flag in the
Production environment.

The console calculates all six CREATE2 addresses before enabling deployment,
checks the current Registry, pricing, discount, registrar, owner, and deployer,
and then deploys the Registry, forward resolver, reverse resolver, registrar,
multichain resolver, and subdomain registrar. The sequence is resumable: a
contract already present at its deterministic address is reused and the full
immutable binding set is checked before initialization.

The final two writes initialize the new Registry's first registrar and propose
that registrar as the existing Discount Authorization consumer. Neither action
switches the app away from the current Registry. The Discount Authorization
proposal remains subject to its existing 48-hour delay.

After deployment, verify all six contracts from the command line:

```bash
REGISTRY_V2_ADDRESS=0x... \
FORWARD_RESOLVER_V2_ADDRESS=0x... \
REVERSE_RESOLVER_V3_ADDRESS=0x... \
PRIMARY_REGISTRAR_ADDRESS=0x... \
MULTICHAIN_RESOLVER_V2_ADDRESS=0x... \
SUBDOMAIN_REGISTRAR_V2_ADDRESS=0x... \
pnpm verify:registry-v2:apothem
```

Only after verification and delayed consumer activation may the dev deployment
be switched with the six public environment variables printed by the console.
The testnet Registry and Subdomain Registrar now respect
`NEXT_PUBLIC_XNS_REGISTRY` and `NEXT_PUBLIC_XNS_SUBDOMAIN_REGISTRAR`; Production
configuration remains independent.

## Subdomains

The existing subdomain contract can continue serving subdomains created under
the current Registry. New subdomains beneath Registry V2 parents require a
subdomain module bound to Registry V2. This is a module replacement, not another
top-level ownership migration.
