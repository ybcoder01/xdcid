# Apothem Unified V3 activation runbook

This runbook covers the Apothem release gate only. It does not authorize or
change any XDC mainnet deployment.

## Release target

| Component | Apothem address |
| --- | --- |
| Registry V3 | `0xbe394cA8615E5DC0284262aad962Ef72414b0270` |
| Universal Resolver | `0xA31f6c0323e8f5281c228b7fF2527520890D59Ab` |
| Unified Registrar | `0xd24d4fFF55b5D470d5B60d801ea77b60D39F8838` |
| Pricing Policy V2 | `0xC760c020d6865cc618B63c91622f88e2075E0513` |
| Circle Apothem USDC | `0xb5AB69F7bBada22B28e79C8FFAECe55eF1c771D4` |

The pending Pricing Policy V2 configuration uses:

- quote signer: `0x031d01283963d2fA43fe386825A056491C10994f`
- treasury: `0x46B738E9ACE23731582C31Fc61965c3AdE062c81`
- XDC payments: enabled
- USDC payments: enabled
- earliest activation: `2026-10-10T13:02:07Z` (`2026-10-10 17:02:07` Dubai)

## Completed evidence

- All four release contracts are source-verified on Sourcify for chain 51.
- The wallet-signed top-level and child registration smoke test passed.
- The on-chain preflight passed all bytecode, immutable binding, ownership,
  registrar, resolver, pause-state, and pricing-version checks.
- The automated suite passed 309 protocol tests, 32 SDK tests, and 30 runtime
  configuration tests.
- Contract-size checks passed. The Unified Registrar has 713 bytes of remaining
  EIP-170 deployment headroom, so further additions should be treated as
  size-sensitive.
- Unified V3 frontend configuration now fails closed when a required Apothem
  address is missing instead of falling back to a retired V2 address.

## Before activation

1. Open the dev Admin page with an authorized administration wallet.
2. Confirm the pending policy values exactly match the signer, treasury, token,
   and payment switches above.
3. Confirm the Admin page reports that the activation time has elapsed.
4. Confirm the public registrar readiness endpoint reports the configured quote
   signer but `ready: false` before activation. This is expected.
5. Re-run source verification and preflight:

   ```sh
   pnpm verify:unified:apothem
   pnpm preflight:unified:apothem
   ```

6. Do not change the dev frontend contract addresses and do not change any
   mainnet environment variable.

If any pending value is wrong, use `cancelPendingConfig()` from the Admin page
before the activation transaction. Correcting a pending policy requires a new
proposal and a fresh 48-hour delay.

## Activation

1. Click **Activate eligible update** in the Pricing Policy controls.
2. Verify the wallet transaction is addressed to Pricing Policy V2 on Apothem.
3. Wait for one confirmed receipt. Do not resubmit while the first transaction
   is pending.
4. Refresh the Admin page and confirm no pricing update remains pending.

`activatePendingConfig()` is permissionless after the delay. The connected
wallet pays gas, but it cannot alter the proposed values during activation.

## Post-activation release gate

Run these checks in order. Stop at the first failure.

1. Registrar readiness GET returns the configured signer, the same active
   signer, `authorized: true`, and `ready: true`.
2. Request a top-level registration quote using XDC and USDC.
3. Register a new disposable `.xdc` test name and verify ownership, expiry,
   default resolution, and automatic Primary ID behavior.
4. Renew the test name and verify its expiry advances by the quoted term.
5. Register a child name under the test parent and verify the child cannot
   outlive the parent.
6. Transfer the child to a second controlled wallet, select it as Primary ID,
   and verify forward and reverse resolution.
7. Reclaim the child from the parent wallet and verify the old Primary record
   does not reactivate if ownership later returns.
8. Confirm the Dashboard nests the child under its parent and exposes record,
   transfer/reclaim, and parent-only renewal controls.
9. Confirm the Send page resolves both the top-level name and child name.
10. Run `pnpm test`, `pnpm check:unified-contract-sizes`, and
    `pnpm preflight:unified:apothem` once more.

The dev cutover is approved only when every check above passes and the quote
API produces no signer, policy-version, treasury, or payment-token mismatch.

## Failure containment and rollback

### Before policy activation

- Cancel the pending Pricing Policy V2 configuration.
- Leave the dev frontend inactive on Unified V3.
- Investigate and submit a corrected proposal; the 48-hour delay restarts.

### After policy activation but before public cutover

- Keep the dev frontend inactive on Unified V3.
- If write-path safety is uncertain, use the Unified Registrar pause control to
  pause top-level registrations, top-level renewals, subdomain registrations,
  and subdomain renewals independently or together.
- Propose a corrected Pricing Policy V2 configuration. A policy rollback is a
  new delayed configuration; activation cannot mutate the accepted values.
- Treat the five-minute previous-policy quote window as compatibility for
  already issued quotes, not as a rollback mechanism.

### After dev cutover

- Pause only the affected write paths first; resolution and ownership reads
  should remain available.
- Restore the last known-good dev deployment environment only after confirming
  that its contracts and quote service agree on registry, registrar, policy,
  signer, token, and treasury.
- Re-run the full post-activation release gate before reopening writes.

Never use this Apothem procedure or its addresses for a mainnet change.
