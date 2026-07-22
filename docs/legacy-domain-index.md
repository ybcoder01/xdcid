# Legacy XDCDomains index

This read-only utility reconstructs the active `.xdc` names held by the legacy
XDCDomains contract from XDC mainnet event logs. It does not use a wallet,
submit transactions, burn names, or change either registry.

## Indexed source

- Chain: XDC mainnet (chain ID 50)
- Contract: `0x295a7aB79368187a6CD03c464cfaAb04d799784E`
- First block: `48,393,303`
- Events: `Transfer` and `NewURI`

The latest event order determines each token's owner and name. Burned tokens
are excluded. Only canonical names ending in `.xdc` appear in the active
name list, and duplicate canonical names are reported separately.

## Run

```bash
pnpm index:legacy-domains
```

Progress is written to stderr and the versioned JSON snapshot is written to
stdout. The command does not create a local file. If persistence is required
for an operational deployment, send stdout to project-controlled storage with
an explicit retention policy; do not commit generated snapshots.

The indexer tries these optional server-side variables before public XDC RPC
fallbacks:

- `XDC_MAINNET_RPC_URL`
- `XDC_RPC_URL`
- `XDC_RPC_URLS` (comma-separated)

RPC URLs may contain credentials, so the utility never prints them. Do not
commit keys or authenticated URLs.

Optional controls:

- `LEGACY_INDEX_CONFIRMATIONS` defaults to `12`.
- `LEGACY_INDEX_BLOCK_SPAN` defaults to `250000`; ranges split
  automatically when an RPC provider enforces a smaller limit.
- `LEGACY_INDEX_TO_BLOCK` pins a reproducible end block.

## Output integrity

The output schema is `xdcid/legacy-domain-index/v1`. It includes the block
range, event count, legacy `totalSupply` when available, active names,
canonical collisions, and `snapshotSha256`. The hash covers the compact JSON
payload before the hash field is added, making snapshots at a pinned block
independently reproducible.

This index is evidence for migration review only. Eligibility and conflict
policy must remain a separate, explicit decision and should never trigger
automatic burns or registrations.
