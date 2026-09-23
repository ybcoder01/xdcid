# Contract static-analysis baseline

Slither `0.11.6` runs on every pull request and on pushes to `dev` and `main`.
The version is pinned in `.github/workflows/security-analysis.yml` so a tool
release cannot silently change the release gate.

The CI parser fails for any new High or Medium result. Existing reviewed
results remain visible in the job log and are matched by exact detector and
contract/function prefix in `scripts/check-slither-report.mjs`; they are not
globally suppressed.

## Reviewed baseline

- `arbitrary-send-eth` for the three payment collectors: the destination is the
  owner-governed treasury from the validated pricing policy, not a caller-chosen
  address. Exact payment checks and transaction reverts remain in force.
- `unused-return` for primary-name initialization: initialization intentionally
  returns `false` when an account already has a primary name. Registration must
  remain successful without replacing that primary.
- `reentrancy-eth` for Subdomain Registrar registration and renewal: the public
  payment entry points are protected by `nonReentrant`, and the currently
  configured treasury is an EOA. Slither correctly identifies that state is
  finalized after payment and that other state-changing entry points do not use
  the guard. Treat this as a tracked design issue: do not move the treasury to
  a contract capable of callbacks until a separately deployed Subdomain
  Registrar version uses checks-effects-interactions or a shared guard on every
  mutating entry point.

The baseline is not an assertion that these patterns are universally safe. A
change to treasury type, payment flow, call order, or reachable state-mutating
functions requires removing or revisiting the corresponding entry.
