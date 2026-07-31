# Legacy XDCDomains index

This read-only utility reconstructs the active names held by the legacy
XDCDomains contract from XDC mainnet event logs. It does not use a wallet,
submit transactions, burn names, or change either registry.

## Indexed source

- Chain: XDC mainnet (chain ID 50)
- Contract: `0x295a7aB79368187a6CD03c464cfaAb04d799784E`
- First block: `48,393,303`
- Events: `Transfer` and `NewURI`

The latest event order determines each token's owner and name. Burned tokens
are excluded from the active-token count.

Active metadata is classified into three groups:

- `names`: canonical `.xdc` names that satisfy XDCID's current label rules.
- `legacyOnlyNames`: `.xdc` names retained as evidence but not compatible
  with those rules.
- `nonXdcTokenIds`: active tokens whose metadata does not end in `.xdc`.

Active tokens with no usable name metadata are reported separately. Canonical
collisions are calculated across both compatible and legacy-only `.xdc`
records so duplicate evidence is never hidden.

## Run

```bash
pnpm index:legacy-domains
```

Progress and integrity failures are written to stderr. The versioned JSON
snapshot is written to stdout. The command does not create a local file. If
persistence is required for an operational deployment, send stdout to
project-controlled storage with an explicit retention policy; do not commit
generated snapshots.

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

The output schema is `xdcid/legacy-domain-index/v2`. It includes:

- the indexed block range and the pinned end-block hash;
- the legacy contract bytecode hash at that block;
- reconstructed active-token and named-token counts;
- the legacy `totalSupply` at the same block;
- compatible, legacy-only, non-`.xdc`, and missing-metadata records;
- canonical collisions; and
- `snapshotSha256`, which covers the compact JSON payload before the hash
  field is added.

The command exits unsuccessfully when `totalSupply` cannot be read, when the
reconstructed active-token count differs from `totalSupply`, or when an
active token lacks usable name metadata. A failed snapshot is diagnostic
evidence only and must not be used for migration, registration blocking,
resolution, or payments.

This index remains evidence for migration review. Eligibility and conflict
policy are separate, explicit decisions and must never trigger automatic
burns or registrations.
