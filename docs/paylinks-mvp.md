# XDCID Pay Links

XDCID Pay Links are creator-signed, non-custodial payment requests addressed to an XNS ID.

## Flow

1. A payee opens `/pay`, enters an XNS ID, amount, token, source network, destination network, transfer method, optional memo, and optional expiry.
2. The browser signs a versioned EIP-712 request with the current XNS owner wallet.
3. The link may contain the encoded signed request directly or use the existing short-link store.
4. A payer opens the link. XDCID verifies the signature against the current XNS owner on XDC and resolves the receiving address configured for the destination network.
5. The payer reviews the route and approves the payment in their own wallet.

The application never receives a private key, signs a payment transaction, takes custody, reserves funds, or guarantees payment.

## Supported routes

- Native XDC is supported as a direct payment on XDC Network.
- Native USDC direct payments are supported on Ethereum, XDC, Polygon, Base, and Arbitrum.
- Native USDC cross-chain requests can use Standard CCTP, Automatic forwarding, or allow the payer to choose at checkout.
- All 20 directional cross-chain pairs among the five supported networks use the capabilities introduced in Phase 1.

XNS ownership and Pay Link authorization are always verified on XDC. The receiving address is selected for the destination network; when no chain-specific address is configured, the resolver may use the XNS ID's default EVM address.

## Request versions

- Version 1 links remain supported as direct XDC-network requests.
- Version 2 signs the source chain, destination chain, and transfer mode in addition to the existing payment fields.
- Route fields are covered by the signature, so changing the route invalidates the request.

## Data handling

Long links keep request fields in the URL. Short links store only the encoded request and its signature in XDCID's existing short-link service. Neither format contains a private key or API key. Request fields are visible to anyone who receives the link, so descriptions must not contain sensitive information.

## Safety boundaries

- Expired, malformed, modified, or unauthorized signed requests cannot enable payment.
- Unregistered and expired XNS IDs cannot receive payment.
- Legacy-only names and unresolved registry collisions remain blocked.
- The destination address and route are shown before wallet review.
- Token amounts reject signs, scientific notation, zero, and excess decimal precision.
- The wallet remains the final approval surface for every transaction.

## Deliberately out of scope

Creator cancellation is intentionally reserved for Phase 3. Cancellation can stop an unpaid request from being presented as payable, but it cannot reverse a transaction that has already executed. Recurring billing, invoice document storage, escrow, refunds, fiat conversion, and custody are also out of scope.
