# @xdcid/sdk

Read-only TypeScript SDK for resolving XDCID `.xdc` names on XDC mainnet.

The package reads the deployed XDCID contracts directly. It does not require an API key, hold a private key, submit transactions, or collect user data.

## Status

This package is prepared for repository use and review. Publishing it to npm is a separate release step and should only happen after the API is approved.

## Requirements

- Node.js or a modern browser
- `viem` 2.55.1 or newer
- XDC mainnet, chain ID `50`

## Usage

```ts
import { createXdcidClient } from "@xdcid/sdk";

const xdcid = createXdcidClient();

const resolution = await xdcid.resolveName("alice.xdc");
const address = await xdcid.resolveAddress("alice");
const reverse = await xdcid.reverseResolve(
  "0xe82a4267CC310FC6Db334601671A043DFc8Ce06A"
);
const availability = await xdcid.checkAvailability("alice", 1);
const profile = await xdcid.getProfile("alice.xdc");
const matched = await xdcid.verifyForwardReverse("alice.xdc");
```

Use an existing Viem client when a wallet already manages RPC access:

```ts
import { createPublicClient, http } from "viem";
import { createXdcidClient, xdcMainnet } from "@xdcid/sdk";

const publicClient = createPublicClient({
  chain: xdcMainnet,
  transport: http("https://rpc.xdcrpc.com")
});

const xdcid = createXdcidClient({ publicClient });
```

Or provide an ordered RPC fallback list:

```ts
const xdcid = createXdcidClient({
  rpcUrls: [
    "https://rpc.xdcrpc.com",
    "https://earpc.xinfin.network"
  ]
});
```

## API

- `parseXdcidName(value)` returns validation details without throwing.
- `normalizeName(value)` returns a canonical lowercase `.xdc` name.
- `nodeForName(value)` derives the deployed protocol node hash.
- `resolveName(value)` returns ownership, address, expiry, and registration state.
- `resolveAddress(value)` returns the active payment address or `null`.
- `reverseResolve(address)` returns a primary name only after verifying current ownership.
- `checkAvailability(value, years)` returns availability and registration pricing.
- `getProfile(value)` reads supported public profile records.
- `verifyForwardReverse(value)` confirms that a name owner has selected the same primary name.

## Safety behavior

The SDK:

- rejects names that do not match the registrar's 3–63 character ASCII label rules;
- requires XDC mainnet chain ID 50;
- treats zero-address or expired ownership as unregistered;
- verifies reverse records against the current registry owner;
- validates contract overrides and RPC URL protocols;
- uses read-only contract calls and never requests a wallet signature;
- wraps RPC failures in `XdcidSdkError` with a stable error code.

## Development

From the repository root:

```bash
pnpm test
pnpm build:sdk
```

The root production build also compiles the SDK before building the frontend.
