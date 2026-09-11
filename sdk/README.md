# @xdcid/sdk

Isomorphic TypeScript SDK for XDCID resolution, registration quotes, Pay Links, and owner-authorized record management.

The package supports two integration styles:

- `createXdcidClient()` reads XDCID contracts directly and prepares wallet calls without holding keys or submitting transactions.
- `createXdcidApiClient()` gives browser, Node.js, and Web2 services a typed client for the public XDCID HTTP API.

## Status

Version `0.2.0` is available from this repository for review and integration testing. Publishing `@xdcid/sdk` to npm remains a separate release step.

## Requirements

- Node.js 18+ or a modern browser with `fetch`
- `viem` 2.55.1 or newer
- XDC mainnet, chain ID `50`, for direct contract reads and writes

## HTTP API: browser, backend, or Web2

```ts
import { createXdcidApiClient } from "@xdcid/sdk/api";

const api = createXdcidApiClient();
const name = await api.getName("alice.xdc");
const primary = await api.reverseResolve(wallet);
const owned = await api.getOwnedNames(wallet);
const pricing = await api.getPricingQuote({
  product: "registration",
  name: "alice.xdc",
  years: 1
});
```

Use `baseUrl` for staging or a self-hosted deployment, and inject any standards-compatible `fetch` implementation when needed:

```ts
const api = createXdcidApiClient({
  baseUrl: "https://dev.xdcid.xyz",
  fetch
});
```

API failures throw `XdcidApiError` with stable `status`, `code`, and `message` fields.

## Signed registration and renewal

The API creates a short-lived quote bound to the payer, name owner, registrar, policy version, and nonce. The SDK validates the returned contract context and prepares both the optional USDC approval and the final wallet call.

```ts
import { createXdcidClient } from "@xdcid/sdk";
import { createXdcidApiClient } from "@xdcid/sdk/api";

const api = createXdcidApiClient();
const xdcid = createXdcidClient({ publicClient });

const quote = await api.createRegistrarQuote({
  name: "alice.xdc",
  product: "registration",
  termYears: 1,
  paymentCurrency: "USDC",
  payer: account,
  nameOwner: account
});

const plan = xdcid.prepareRegistrarPayment(quote);
if (plan.approval) {
  await walletClient.writeContract({ account, ...plan.approval });
}
await walletClient.writeContract({ account, ...plan.transaction });
```

`prepareRegistrarPayment()` also handles a valid beta or administrator-issued discount grant returned by the quote service, including 100% gas-only registrations.

## Subdomains

```ts
const quote = await api.createSubdomainQuote({
  parentName: "company.xdc",
  label: "alice",
  action: "registration",
  termYears: 1,
  paymentCurrency: "XDC",
  payer: account,
  subdomainOwner: account
});

const plan = xdcid.prepareSubdomainPayment(quote);
await walletClient.writeContract({ account, ...plan.transaction });
```

The payer must satisfy the protocol's parent-controller rules. A subdomain cannot outlive its parent name.

## Pay Links

Applications that already create and sign XDCID payment-request payloads can store and monitor short Pay Links through the API client:

```ts
const link = await api.createPayLink({ request: encodedRequest, signature });
const status = await api.getPayLinkStatus(requestId);
const record = await api.getPayLink(link.id);

// Keep this token private. It is returned only when the link is created.
await api.revokePayLink(link.id, link.revocationToken);
```

Creating the signed payment request remains a wallet action. The SDK never receives the signing key. Private payment history and receipt export use a separate wallet-authenticated session and are intentionally not exposed as unauthenticated helpers.

## Direct on-chain resolution

```ts
import { createXdcidClient } from "@xdcid/sdk";

const xdcid = createXdcidClient();
const resolution = await xdcid.resolveName("alice.xdc");
const address = await xdcid.resolveAddress("alice");
const reverse = await xdcid.reverseResolve(wallet);
const profile = await xdcid.getProfile("alice.xdc");
const baseAddress = await xdcid.resolveMultichainAddress("alice.xdc", 8453);
```

Pass an existing Viem client or an ordered RPC fallback list:

```ts
const xdcid = createXdcidClient({ publicClient });

const fallbackClient = createXdcidClient({
  rpcUrls: ["https://rpc.xdcrpc.com", "https://earpc.xinfin.network"]
});
```

`checkAvailability()` reports the current registrar's on-chain availability. Current USD pricing requires the HTTP quote service, so its legacy `pricePerYear` and `totalPrice` fields are retained as `null` for compatibility.

## Owner-authorized management

The SDK prepares, but never signs or submits, calls for:

- `prepareTransferName(name, newOwner)`
- `prepareSetResolver(name, resolver?)`
- `prepareSetAddress(name, address)`
- `prepareSetText(name, key, value)`
- `prepareSetPrimaryName(name)`
- `prepareSetMultichainAddress(name, chainId, address)`
- `prepareClearMultichainAddress(name, chainId)`

Submit a prepared call with the current owner's wallet on XDC mainnet:

```ts
const request = xdcid.prepareSetPrimaryName("alice.xdc");
await walletClient.writeContract({ account, ...request });
```

## Multichain records

`SUPPORTED_MULTICHAIN_NETWORKS` lists XDC (50), Ethereum (1), Base (8453), Arbitrum One (42161), and Polygon (137). Records are stored and updated in the XDCID multichain resolver on XDC; no transaction is sent to the destination chain.

## Safety behavior

The SDK:

- enforces the current 2–63 character ASCII label policy;
- verifies direct reads are connected to XDC mainnet;
- treats expired or zero-address ownership as unregistered;
- verifies reverse records against current ownership;
- validates contract, quote, address, chain, node, and numeric fields before preparing writes;
- supports contract overrides for an explicitly configured staging or future deployment;
- never asks for a private key or silently submits a transaction.

## Development

From the repository root:

```bash
pnpm test:sdk
pnpm build:sdk
```

The root production build compiles the SDK before building the frontend. The public API contract is maintained in `frontend/public/openapi.yaml`.
