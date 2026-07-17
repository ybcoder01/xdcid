# XDCID MVP

Minimal `.xdc` names for XDC mainnet.

## Stack

- Next.js, TypeScript, Tailwind
- Hardhat Solidity contracts
- viem/wagmi frontend
- OpenZeppelin Ownable/ReentrancyGuard

## Contracts

- `XNSRegistry`: stores owner, resolver, and expiry by `bytes32` node.
- `XNSRegistrar`: validates `.xdc`, prices by yearly label length, registers and renews names.
- `XNSResolver`: stores address and text records for `avatar`, `website`, `twitter`, `telegram`, and `bio`.
- `XNSReverseResolver`: lets users set their own primary name when they own the node.

For this MVP, `nodeFor(name)` is `keccak256(bytes(name))`. Use the helper everywhere instead of recomputing differently.

The frontend displays the suffix as `.XDC`, but canonicalizes registrations to lowercase `.xdc` before calling contracts. The registrar accepts `.xdc` case-insensitively for direct contract calls.

## XDC Mainnet Deployment

| Contract | Address |
| --- | --- |
| XNSRegistry | [`0x05fa64a05bc205DeDF47e023d2D90c2d119cd097`](https://xdcscan.com/address/0x05fa64a05bc205DeDF47e023d2D90c2d119cd097) |
| XNSRegistrar (active v2) | [`0x6955Be33d0B414784F9d3a6E71BAc1bb9B376cD7`](https://xdcscan.com/address/0x6955Be33d0B414784F9d3a6E71BAc1bb9B376cD7) |
| XNSResolver | [`0x52bfa70B30190050F77033Fe427De8B3d4A8F453`](https://xdcscan.com/address/0x52bfa70B30190050F77033Fe427De8B3d4A8F453) |
| XNSReverseResolver | [`0x8b1a236845b0CC84094578cEd97844b8dC5f139f`](https://xdcscan.com/address/0x8b1a236845b0CC84094578cEd97844b8dC5f139f) |

The Registry and active Registrar protocol owner is `0xe82a4267CC310FC6Db334601671A043DFc8Ce06A`.

- The [Registry ownership transfer](https://xdcscan.com/tx/0x90049270910803f91186caf7ea04d6e7b261f92a1aaa56f37329c73de2657ef1) moved Registry control to this owner.
- The active Registrar v2 was deployed with this address as its initial owner, so it did not require a separate ownership-transfer transaction.

Only the Registry and Registrar implement OpenZeppelin `Ownable`. The Resolver contracts authorize individual name owners through the Registry and do not have protocol ownership to transfer.

## Setup

```bash
pnpm install
cp .env.example .env
```

This repo pins pnpm settings in `.npmrc` to use `https://registry.npmjs.org/`, `strict-ssl=true`, exact package saves, and store integrity checks. Do not install with `--config.strict-ssl=false`.

If pnpm fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, fix the local certificate trust chain or configure a trusted CA with `NODE_EXTRA_CA_CERTS`. Keep `strict-ssl=true`.

On Windows with Node 24+, you can also keep TLS verification enabled while using the Windows certificate store:

```cmd
set NODE_OPTIONS=--use-system-ca
pnpm install
```

Fill `PRIVATE_KEY` only in a local or protected deployment environment for deploys and owner-only maintenance scripts. Never commit a production key. The default XDC mainnet RPC is `https://earpc.xinfin.network`.

## TestSet `XDC_RPC_URLS` to a comma-separated, ordered list of server-side RPC endpoints. `XDC_RPC_URL` and `XDC_MAINNET_RPC_URL` remain supported for compatibility. Keep authenticated provider URLs server-side and never place secrets in `NEXT_PUBLIC_*` variables.

```bash
pnpm test
```

Tests cover register, duplicate fail, expired availability, pricing, resolver owner-only, reverse owner-only, and renew.

## Deploy To XDC Mainnet

```bash
pnpm deploy:xdc
```

The deploy script writes contract addresses to `frontend/config/addresses.ts`. You can also set:

```bash
NEXT_PUBLIC_XNS_REGISTRY=
NEXT_PUBLIC_XNS_REGISTRAR=
NEXT_PUBLIC_XNS_RESOLVER=
NEXT_PUBLIC_XNS_REVERSE_RESOLVER=
```

## Transfer Ownership

The Registry and Registrar use OpenZeppelin `Ownable`. Run the transfer script with the current owner's key supplied securely through `PRIVATE_KEY` and the intended wallet or multisig in `NEW_OWNER`:

```bash
NEW_OWNER=0x... pnpm transfer-ownership:xdc
```

The script uses XDC-compatible legacy transactions, verifies the connected signer is the current owner, skips contracts already owned by the target, and confirms the resulting owner after each transaction.

## Run Frontend

```bash
pnpm dev
```

Open the Next.js URL and connect a wallet on XDC mainnet, chain ID `50`.

## Read-only API

The first API version exposes two XDC mainnet read endpoints:

- `GET /api/v1/names/{name}?years=1` returns canonical name data, forward resolution, availability, pricing, expiry, and profile records.
- `GET /api/v1/reverse/{address}` returns the wallet's verified primary name, or `null` when the stored reverse record is stale or missing.

The name endpoint accepts either a bare label or a `.xdc` name. The optional `years` parameter must be an integer from 1 through 100 and controls the total registration-price quote.

Each endpoint has a 3.5-second timeout by default (`XDC_RPC_TIMEOUT_MS`, bounded from 1 to 10 seconds). Successful name and reverse lookups are cached in memory for 15 seconds by default (`XDC_API_CACHE_TTL_MS`, bounded from 1 to 60 seconds). The cache is limited to 500 entries per warm server instance, coalesces concurrent identical reads, and never retains failed RPC requests. API reads are intentionally uncached until the RPC fallback and caching phase is implemented.

### Error responses

Every API error uses the same versioned envelope:

```json
{
  "version": "v1",
  "error": {
    "code": "INVALID_ADDRESS",
    "message": "address must be a valid EVM address"
  }
}
```

Validation errors return HTTP 400 with one of `INVALID_NAME`, `INVALID_ADDRESS`, or `INVALID_YEARS`. XDC RPC failures return HTTP 503 with `XDC_RPC_UNAVAILABLE`. Internal error details are logged server-side and are never included in API responses.
