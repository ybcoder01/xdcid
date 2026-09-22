# XDC mainnet deployment manifest and preflight

The typed public manifest in
[`sdk/src/deployment/deployments.ts`](../sdk/src/deployment/deployments.ts)
is the checked-in source of truth for XDC mainnet contract addresses and public
operational addresses. Frontend defaults, SDK defaults, operator tooling, and
the release preflight consume this file.

The manifest must never contain a private key, authenticated RPC URL, database
URL, encryption key, session secret, or provider credential. Contract, owner,
signer, token, and treasury addresses are public on-chain data.

## Active and candidate state

The manifest separates two states:

- `active` records the contracts currently authorized or used on XDC mainnet.
- `candidate` records the next owner-bound primary-resolution stack.

Candidate values remain `null` until every contract has been deployed,
independently verified, and approved for release. A missing candidate value is a
hard production-release blocker; the application must not silently substitute a
legacy contract.

## Read-only preflight

Run:

```bash
XDC_MAINNET_RPC_URL=https://rpc.xdcrpc.com pnpm preflight:deployment:xdc
```

The command never connects a signer or sends a transaction. It checks:

- chain ID 50;
- deployed bytecode for every active contract and dependency;
- the Registry owner and authorized Registrar;
- Registrar ownership, immutable dependencies, and pause state;
- Pricing Policy ownership, version, quote signer, USDC, treasury, and enabled
  payment methods;
- Discount Authorization ownership, signer, active consumer, and pending state;
- Subdomain Registrar ownership and immutable dependencies;
- Registry dependencies for forward, reverse, and multichain resolvers;
- six-decimal USDC;
- candidate contract bytecode and immutable relationships after candidate
  addresses are recorded;
- release blockers for a single-EOA protocol owner, missing candidate
  deployments, and a Subdomain product whose on-chain state conflicts with its
  declared launch status.

The output is JSON and includes the block number, block timestamp, every check,
and every release blocker. The command exits non-zero when an invariant fails or
a release blocker remains. Use `REPORT_ONLY=true` only to capture the current
blocked-state report; it does not waive or approve a blocker.

## Updating the manifest

1. Deploy without changing active application defaults.
2. Verify source and constructor arguments independently.
3. Add the candidate address to the manifest through a reviewed pull request.
4. Run the preflight and save its JSON output with deployment transaction hashes.
5. Complete lifecycle tests against the exact candidate contracts.
6. Obtain explicit approval before any Registry, discount-consumer, signer,
   Vercel Production variable, or domain change.
7. Promote candidate fields to active only after on-chain activation succeeds.
8. Preserve the previous active addresses and rollback procedure in the release
   evidence.

Do not edit generated frontend configuration after deployment. The legacy
`scripts/deploy.ts` command now prints addresses and requires a reviewed manifest
change instead of rewriting application defaults.

## Wallet-signed candidate deployment

The Preview-only `/deployment/mainnet-primary-resolution` page deploys the four
candidate contracts through the deterministic deployment proxy. It is available
only when `ENABLE_MAINNET_PRIMARY_RESOLUTION_DEPLOYMENT=true` is set for a
Vercel Preview deployment. The page requires the current Registry owner on XDC
mainnet and validates the active Registry, Registrar, Pricing Policy, Discount
Authorization, legacy Registry, and deployment proxy before enabling deployment.

The page deploys only inactive contracts and validates their immutable bindings.
It cannot change the active Registrar, modify the discount consumer, edit Vercel
Production variables, or transfer ownership. After deployment, independently
verify all four contracts and add their addresses to `candidate` through a
reviewed pull request before starting any activation procedure.

## Primary-resolution activation proposal

The candidate primary-resolution stack was verified before activation. The
Discount Authorization update was proposed in transaction
[`0x86131e67…74e6e`](https://xdcscan.com/tx/0x86131e67efb37588894aa122ad004593f7643ba153121ac9ae8c0e26c8674e6e).
Its earliest activation is `2026-09-24T13:09:28Z` (`2026-09-24 17:09:28`
Dubai time). The current single-wallet owner remains in place for this rollout;
moving ownership to a multisig is a separate reviewed operation.

The Preview-only `/deployment/mainnet-primary-resolution-activation` console is
available only with `ENABLE_MAINNET_PRIMARY_RESOLUTION_ACTIVATION=true`. It uses
fixed addresses from the typed manifest and blocks activation unless contract
bytecode, ownership, immutable dependencies, the pending signer, the pending
consumer, and the exact activation timestamp all match the reviewed rollout.

Activation order:

1. Activate the pending Discount Authorization configuration after the delay.
2. Wait for two confirmations.
3. Immediately set the Registry registrar to the candidate Primary Registrar.
4. Wait for two confirmations and rerun the read-only preflight.
5. Apply the prepared Production variables only after the on-chain state is
   active and the release smoke tests pass.

Do not leave the rollout between steps 1 and 3. Once the discount consumer is
the candidate, the previous Registrar cannot consume new discounts. Restoring
the previous Registry registrar is immediate, but restoring it as the discount
consumer requires a new 48-hour proposal. Treat rollback after discount
activation as maintenance mode, not an instant full-service rollback.

Prepared Production variables (do not apply before activation):

```bash
NEXT_PUBLIC_XNS_REGISTRAR=0x3D87B064a06f62cc4a24EAff13A591C9Ba791135
NEXT_PUBLIC_XNS_RESOLVER_V2=0x9d3CcAF4Db85F845B1B72972211356C6C4BB8661
NEXT_PUBLIC_XNS_REVERSE_RESOLVER_V2=0x2E17282219BB55359f5D07fAFfc406eE4EC97440
NEXT_PUBLIC_XNS_MULTICHAIN_RESOLVER=0xf4B040A2519E8BFdA62eDC3FDd1b6F9867F97232
```

The preserved previous Registrar is
`0xdEaf1742614908a8d170f4c9520c3cd1e967ef36`.

## Ownership migration

`pnpm transfer-ownership:xdc` is read-only unless both conditions are supplied:

- `NEW_OWNER` is a non-zero address;
- `CONFIRM_OWNERSHIP_TRANSFER=TRANSFER_XDC_MAINNET_OWNERSHIP`.

Its preflight enumerates Registry, Registrar V2, Pricing Policy V2, Discount
Authorization, and Subdomain Registrar ownership. Transfers are resumable: a
contract already owned by the target is skipped, every remaining contract must
be owned by the configured signer, and ownership is read back after each
confirmed transaction.
