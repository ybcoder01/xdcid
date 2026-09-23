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

The former `reentrancy-eth` findings for Subdomain Registrar registration and
renewal are no longer allowlisted. The registrar now commits registration or
renewal state before collecting payment and applies one reentrancy guard across
every mutating entry point. An adversarial treasury test attempts authorized
address and ownership changes during native-token payment and verifies that
both callbacks fail without interrupting the intended registration or renewal.

This source hardening affects only future Subdomain Registrar deployments. It
does not upgrade or alter an already deployed instance.

The baseline is not an assertion that these patterns are universally safe. A
change to treasury type, payment flow, call order, or reachable state-mutating
functions requires removing or revisiting the corresponding entry.
