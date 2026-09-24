# Apothem primary owner resolution rollout

> **Superseded:** This is a historical record of the September 2026
> primary-resolution rollout. Do not use its addresses or activation steps for
> the Registry V2 migration. Use
> [`registry-v2-migration.md`](./registry-v2-migration.md) instead.

This rollout replaces only the active Apothem registration stack. It does not
change XDC mainnet or move user funds.

## Deployed contracts

- Primary-aware Registrar: `0xE35722cB7d04Ba36ed284910528A64B1dE855a20`
- Reverse Resolver V3: `0x1ff9B9c9463a2d85029bdD3AFC99a8cf51260Ee2`
- Multichain Resolver V2: `0x2212Fc40Feda6e8DD7030E9B70B38c7EB79f6989`
- Registry: `0x2BeD8EB404e1BD8D690e3dD2Fd06F287e5A92Eb1`
- Discount Authorization: `0x37A013d55393f0824eFD40C648111f39D18C5F46`
- Previous Registrar and rollback target:
  `0x506B82DaD0cf55d909D9C6F0edD5A7939339256d`

The Discount Authorization proposal becomes eligible on 20 September 2026 at
14:20:11 UTC. The contract enforces this timestamp; the interface cannot
bypass it.

## Repeatable read-only preflight

Run the same invariant checks used by the activation page without connecting a
wallet or submitting a transaction:

```bash
pnpm preflight:primary-resolution:apothem
```

The command verifies bytecode, contract owners, immutable dependencies, the
active Registry Registrar, the active and pending discount consumers, the
pending signer, and the on-chain activation timestamp. It recognizes only
three safe phases and exits non-zero for any unexpected state:

- `READY_FOR_DISCOUNT_ACTIVATION`
- `READY_FOR_REGISTRY_ACTIVATION`
- `FULLY_ACTIVATED`

The JSON output should be saved with the activation transaction hashes as the
rollout record.

## XDCScan source verification

The three new contracts can be submitted for exact-match verification with:

```bash
XDCSCAN_API_KEY=... pnpm verify:primary-resolution:apothem
```

The script pins each contract path and its deployed constructor arguments. It
does not deploy contracts or submit protocol transactions. XDCScan currently
identifies the deployments as similar matches until exact verification is
submitted with an explorer API key.

## Activation page

The activation page is available only when both conditions are true:

- Vercel environment is Preview.
- `ENABLE_APOTHEM_PRIMARY_RESOLUTION_ACTIVATION=true`.

Route:

`/deployment/apothem-primary-resolution-activation`

The page checks contract bytecode, ownership, every immutable dependency, the
pending consumer and signer, the active Registrar, and the current block time.
It then exposes two separate transactions in this order:

1. `XNSDiscountAuthorization.activatePendingConfiguration()`
2. `XNSRegistry.setRegistrar(newRegistrar)`

Do not submit the Registry transaction until the new Registrar is confirmed as
the active discount consumer.

## Preview configuration after activation

Keep these public Preview variables:

```text
NEXT_PUBLIC_XNS_REGISTRAR=0xE35722cB7d04Ba36ed284910528A64B1dE855a20
NEXT_PUBLIC_XNS_REVERSE_RESOLVER_V2=0x1ff9B9c9463a2d85029bdD3AFC99a8cf51260Ee2
NEXT_PUBLIC_XNS_MULTICHAIN_RESOLVER=0x2212Fc40Feda6e8DD7030E9B70B38c7EB79f6989
```

After the Registry activation transaction succeeds, update the Preview-only
server variable and redeploy:

```text
XNS_SIGNED_QUOTE_REGISTRAR=0xE35722cB7d04Ba36ed284910528A64B1dE855a20
```

The frontend retains the previous Apothem Registrar in its discovery history,
so names registered through the older contract remain visible after the switch.

## Data continuity

The two Resolver contracts are new deployments with empty storage. Existing
test users must select their primary ID again and recreate custom per-network
destinations. Newly registered names initialize the first valid primary ID in
the registration transaction. Explicit chain records override the primary
owner fallback.

## Required smoke tests

1. Register a new ID and confirm it becomes primary automatically.
2. Confirm its owner address resolves on all five supported networks before
   custom records are set.
3. Save a distinct address on each network and verify network-specific
   resolution.
4. Clear one override and confirm only that network falls back to the primary
   owner wallet.
5. Register a second ID and confirm it does not replace the current primary.
6. Manually select the second ID as primary and verify fallback changes.
7. Transfer an ID and confirm the former owner's reverse and destination data
   becomes inactive.
8. Renew a name through the new Registrar.
9. Reject one wallet transaction and confirm the interface returns to a usable
   state without displaying the rejected change as saved.

Keep the previous Registrar address recorded as the rollback target. A rollback
must also restore the matching quote-service and public Preview configuration.
