# XDCID security incident response

This runbook covers unexpected changes to XDCID's XDC mainnet contracts and
operational keys. It does not authorize a transaction by itself. Every response
transaction must be independently checked against the deployment manifest and
confirmed by the current protocol owner.

## Detection

The `XDC mainnet invariant monitor` workflow runs every six hours and can also
be started manually. It requires the checked-in deployment invariants to pass
against at least two of three independent public XDC RPC endpoints.

The monitor checks:

- deployed bytecode for every active dependency and candidate contract;
- Registry registrar authority;
- owners of the Registry, registrars, pricing, discount, and subdomain modules;
- immutable Registry, pricing, discount, resolver, and legacy-registry bindings;
- quote signer, discount signer/consumer, treasury, USDC, payment enablement,
  pause state, and token decimals;
- the expected primary-resolution rollout state, including the pending
  timelocked consumer change.

An alert is evidence of drift or RPC disagreement, not proof of compromise.

## First response

1. Do not approve an ownership, registrar, pricing, signer, treasury, or pause
   transaction until the discrepancy is understood.
2. Re-run the workflow manually and inspect the failing check on all three RPCs.
3. Confirm the same value directly on XDCScan and record the block number,
   transaction hash, caller, old value, and new value.
4. Compare the observed state with `sdk/src/deployment/deployments.ts` and any
   active rollout transaction. Do not edit the manifest merely to make the
   monitor green.
5. Preserve screenshots, RPC responses, workflow logs, and relevant wallet or
   signer-host logs before attempting remediation.

## Containment by affected authority

### Quote signer suspected

- Pause registrations and renewals from the protocol-owner wallet.
- Propose a Pricing Policy configuration containing a new independently
  generated quote signer and otherwise unchanged reviewed values.
- Keep issuance disabled during the 48-hour delay and the five-minute previous
  signer grace period. Activate only after re-running the preflight.

### Discount signer suspected

- Pause registrations while investigating, because a discount authorization
  is only useful together with a valid registrar quote but should not be
  trusted after signer compromise.
- Propose a Discount Authorization configuration with the replacement signer
  and the reviewed consumer. Activate it only after the 48-hour delay and a
  clean preflight.

### Registrar authority changed unexpectedly

- Treat all new registrations and renewals after the change as suspect.
- Verify the Registry owner before attempting any corrective registrar change.
- Restore only a verified registrar from the deployment manifest after its
  bytecode and immutable dependencies pass preflight.

### Pricing, treasury, token, or payment flags changed unexpectedly

- Pause registrations and renewals.
- Identify the proposal and activation transactions and verify whether the
  48-hour delay was respected.
- Propose the last reviewed complete configuration; never reconstruct only the
  visibly changed field.

### Protocol-owner wallet suspected

- Stop using the wallet and do not attempt ad-hoc corrective transactions from
  a potentially compromised device.
- Coordinate an ownership migration from a known-clean signer if control is
  still available. The migration script is dry-run-first and includes both the
  active and candidate registrars.
- If control has been lost, publish the affected contract addresses and block
  height immediately. One-step ownership means there is no on-chain recovery
  mechanism; this remains the principal accepted risk until multisig migration.

## Recovery and return to service

1. Update the public deployment manifest only after the intended transactions
   are final and independently verified.
2. Run `pnpm preflight:deployment:xdc` against multiple RPCs.
3. Confirm the scheduled monitor is green.
4. Re-enable registrations and renewals only after signer, treasury, consumer,
   registrar, and resolver bindings match the reviewed state.
5. Publish a concise incident report covering impact, affected block range,
   remediation transactions, and any required user action.

## Accepted limitation

The current single-owner EOA remains a concentration risk. Monitoring shortens
detection time and the runbook reduces operator error, but neither prevents an
authorized transaction from a compromised owner key. A hardware-backed multisig
with separated signers remains the required long-term control.
