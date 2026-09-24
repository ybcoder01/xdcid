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

## Apothem deployment console (retired)

The six-contract deployment is complete. The former protected Vercel Preview
route `/deployment/apothem-registry-v2`, along with the older Apothem module
deployment routes, now redirects to the guarded Registry V2 activation page.
This prevents an operator from accidentally starting another deployment.
Never enable `ENABLE_APOTHEM_REGISTRY_V2_DEPLOYMENT` in Production.

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

## Apothem activation runbook

The six-contract stack was verified on XDCScan Testnet at these addresses:

- Registry V2: `0xA601b5e9114c0DfeCea4E0ef99D6Fc020B330512`
- Primary Registrar: `0xd51EdbE27BffA0993D9CFf672613a2d6eC0a5D7b`
- Forward Resolver V2: `0x5F20A2eb2E3c81b4ecc5d5bA3177225d7E3E1a94`
- Reverse Resolver V3: `0xD3909DC7461D06D0Eb57A3b23685cB6f11D474aD`
- Multichain Resolver V2: `0x05Efa9641b03eEe2a4624F2974e1E1192019d363`
- Subdomain Registrar: `0x826b8599d38fcE73b246143b61955Dde0E9AfF68`

The Discount Authorization proposal was submitted in transaction
`0x22f3f3aeae4b9425870ab7c154f37a4cf2b8bdc84cae0af8ddecc2af16c27c8f`.
Its exact earliest activation is Unix time `1790346749` (25 September 2026,
18:32:29 GST). Do not replace or resubmit this proposal.

Use the protected Preview route `/deployment/apothem-registry-v2-activation`.
It shares the existing `ENABLE_APOTHEM_REGISTRY_V2_DEPLOYMENT=true` Preview-only
gate, validates deployed bytecode, ownership, immutable dependencies, the exact
pending consumer and exact activation timestamp, and enables only
`activatePendingConfiguration()`. Registry V2 was already initialized with the
new registrar, so a second Registry activation transaction is neither required
nor possible. The legacy `/deployment/apothem-registrar-v2-activation` route now
redirects to the Registry V2 activation console.

Before and immediately after activation, run:

```bash
pnpm preflight:registry-v2:apothem
```

The command is read-only. It must report `READY` before the transaction and
`ACTIVE` after it. Only after the `ACTIVE` result should the following eight
variables be applied together to the Preview environment. The two server-side
variables are required by the signed registration and subdomain quote APIs;
switching only the public variables leaves those APIs on the retired stack.

```dotenv
NEXT_PUBLIC_XNS_REGISTRY=0xA601b5e9114c0DfeCea4E0ef99D6Fc020B330512
NEXT_PUBLIC_XNS_REGISTRAR=0xd51EdbE27BffA0993D9CFf672613a2d6eC0a5D7b
NEXT_PUBLIC_XNS_RESOLVER_V2=0x5F20A2eb2E3c81b4ecc5d5bA3177225d7E3E1a94
NEXT_PUBLIC_XNS_REVERSE_RESOLVER_V2=0xD3909DC7461D06D0Eb57A3b23685cB6f11D474aD
NEXT_PUBLIC_XNS_MULTICHAIN_RESOLVER=0x05Efa9641b03eEe2a4624F2974e1E1192019d363
NEXT_PUBLIC_XNS_SUBDOMAIN_REGISTRAR=0x826b8599d38fcE73b246143b61955Dde0E9AfF68
XNS_SIGNED_QUOTE_REGISTRAR=0xd51EdbE27BffA0993D9CFf672613a2d6eC0a5D7b
XNS_SUBDOMAIN_REGISTRAR=0x826b8599d38fcE73b246143b61955Dde0E9AfF68
```

After the Preview redeployment, run the API and resolver smoke test with a
disposable active primary ID:

```bash
XDCID_SMOKE_NAME=example.xdc \
XDCID_SMOKE_OWNER=0x... \
XDCID_SMOKE_SUBDOMAIN_PARENT=parent-with-over-one-year-left.xdc \
pnpm smoke:registry-v2:apothem
```

The smoke test verifies the active registrar, Registry V2 ownership and
expiry, reverse resolution, all five multichain destinations, the public name
and reverse APIs, Dashboard-owned-name discovery, and signed registration and
subdomain quote generation. The subdomain parent must be controlled by the
smoke-test owner and retain more than one year of registration. It performs no
on-chain writes.

The `dev` branch Preview snapshot taken before activation is:

```dotenv
NEXT_PUBLIC_XNS_REGISTRY=<unset; effective 0x2BeD8EB404e1BD8D690e3dD2Fd06F287e5A92Eb1>
NEXT_PUBLIC_XNS_REGISTRAR=0xE35722cB7d04Ba36ed284910528A64B1dE855a20
NEXT_PUBLIC_XNS_RESOLVER_V2=0xc5897D100e811A91E398567a593BD671DE42e5d2
NEXT_PUBLIC_XNS_REVERSE_RESOLVER_V2=0x1ff9B9c9463a2d85029bdD3AFC99a8cf51260Ee2
NEXT_PUBLIC_XNS_MULTICHAIN_RESOLVER=0x2212Fc40Feda6e8DD7030E9B70B38c7EB79f6989
NEXT_PUBLIC_XNS_SUBDOMAIN_REGISTRAR=<unset; effective 0xa2135729ce122ef93158FCc4C69683155e6707d3>
XNS_SIGNED_QUOTE_REGISTRAR=0xE35722cB7d04Ba36ed284910528A64B1dE855a20
XNS_SUBDOMAIN_REGISTRAR=0xa2135729ce122ef93158FCc4C69683155e6707d3
```

An app rollback restores that exact branch-scoped state and redeploys. It does
not revert the Discount Authorization consumer; changing that consumer again
requires a new 48-hour on-chain proposal.

### Required lifecycle test after the Preview switch

1. Confirm wallet restore and Dashboard/Send navigation with Wallet A.
2. Migrate one active legacy name and verify owner, expiry and resolver state.
3. Register a new name; confirm it appears on the Dashboard and becomes primary
   only when the wallet has no valid primary.
4. Resolve the primary name on XDC, Ethereum, Base, Arbitrum and Polygon before
   overrides; every network should return the owner wallet.
5. Save five distinct destinations, verify network-specific resolution, then
   clear one destination and confirm only that network falls back to the owner.
6. Renew both a migrated legacy name and a Registry V2 name; confirm expiry
   increases without erasing records.
7. Transfer A to B, verify old records are inactive, configure fresh B records,
   then transfer B back to A and confirm stale A records do not reactivate.
8. Confirm a second registration does not replace a valid existing primary and
   that manual primary selection works.
9. Test subdomain registration, resolution, renewal and transfer beneath a
   Registry V2 parent.
10. Reject one registration or record-update transaction and confirm the UI
    returns to a usable state without showing an unsaved change.

## Subdomains

The existing subdomain contract can continue serving subdomains created under
the current Registry. New subdomains beneath Registry V2 parents require a
subdomain module bound to Registry V2. This is a module replacement, not another
top-level ownership migration.
