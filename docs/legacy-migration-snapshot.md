# Legacy migration snapshot

This workflow freezes the legacy XDCDomains state at one confirmed XDC block and produces a deterministic migration eligibility report. It is a read-only audit step. It does not reserve, mint, burn, transfer, or otherwise change any domain.

## Before running

Choose a finalized XDC block at or after the legacy contract deployment block, `48,393,303`. Record why that block was selected. Everyone reviewing a migration must use the same block.

The workflow uses public XDC RPC fallbacks and does not require a wallet, private key, API key, or repository secret. RPC URLs are never printed by the report generator.

## Run the workflow

1. Open **Actions** in GitHub.
2. Select **Legacy migration snapshot**.
3. Choose **Run workflow** and select the branch containing the workflow.
4. Enter the confirmed block in `to_block`.
5. Wait for the run to complete.
6. Download the artifact named `legacy-migration-snapshot-block-<block>`.

Artifacts are retained by GitHub for 30 days. Download the selected artifact before it expires and retain it according to the project's migration review policy.

## Artifact contents

- `legacy-domain-snapshot.json` — active legacy `.xdc` records reconstructed from on-chain events at the selected block.
- `legacy-migration-report.json` — deterministic eligibility and collision report.
- `SHA256SUMS` — checksums for both JSON files.

Verify the downloaded files from inside the artifact directory:

```sh
sha256sum --check SHA256SUMS
```

The report also embeds the source snapshot SHA-256 and its own report SHA-256. Re-running at the same block should produce the same ordered records and hashes, assuming the RPC returns the canonical chain.

## Report categories

Every active legacy record is placed in exactly one category:

- `eligible` — the name passes XDCID naming rules, is not a later duplicate in the legacy snapshot, and has no active XDCID registry record at the snapshot block.
- `invalid` — the label does not satisfy the current XDCID registrar rules. Validation is applied before duplicate classification.
- `legacy-duplicate` — multiple active legacy tokens share the same valid canonical name. Every record in that duplicate set is excluded from eligibility and reported for human ownership review.
- `xdcid-collision` — the valid canonical name already has an unexpired XDCID registry owner at the same snapshot block.

The XDCID collision check reads `records(bytes32)` from registry `0x05fa64a05bc205DeDF47e023d2D90c2d119cd097` using historical `eth_call` requests at the selected block.

## Review gate

Do not use the eligible list directly for migration authorization. Review invalid names, duplicate ownership, collisions, block finality, checksums, and totals first. Any Merkle root or on-chain migration contract should be created in a separate change from an explicitly approved report.

The GitHub runner is ephemeral. The workflow only uploads the audit artifact and does not commit generated snapshots to the repository.
