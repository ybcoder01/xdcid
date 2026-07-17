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

Fill `PRIVATE_KEY` for deploys. The default XDC mainnet RPC is `https://earpc.xinfin.network`.

## Test

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

The registry and registrar use OpenZeppelin `Ownable`, so the current owner can transfer control to another wallet or multisig later.

```bash
NEW_OWNER=0x... pnpm transfer-ownership:xdc
```

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

Set `XDC_RPC_URL` to override the server-side RPC endpoint. API reads are intentionally uncached until the RPC fallback and caching phase is implemented.


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
