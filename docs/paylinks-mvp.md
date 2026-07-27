# XDCID Pay Links MVP

XDCID Pay Links are non-custodial payment requests addressed to an XNS ID.

## Flow

1. A payee opens `/pay`, enters an XNS ID, amount, token, optional memo, and optional expiry.
2. The browser creates a URL such as `/pay/alice.xdc?amount=25&token=USDC`.
3. A payer opens the URL. The page resolves the current XNS payment address directly from the XDC contracts.
4. The payer reviews the resolved address and signs an XDC or USDC transfer in their wallet.

The application never receives a private key, signs a transaction, takes custody, reserves funds, or guarantees payment.

## Data handling

The MVP has no Pay Links database and does not use cookies or local storage for payment requests. Request fields are URL parameters and are visible to anyone who receives the link. Memos must not contain sensitive information.

## Supported assets

- Native XDC on chain ID 50.
- Native USDC on XDC using Circle's published mainnet contract address.

The public `NEXT_PUBLIC_XDC_USDC_ADDRESS` environment variable can override the USDC contract for an intentional deployment environment. It is not a secret.

## Safety boundaries

- Expired or malformed requests cannot submit a transaction.
- Unregistered and expired XNS IDs cannot receive payment.
- The resolved recipient is shown before wallet review.
- Token amounts reject signs, scientific notation, zero, and excess decimal precision.
- The wallet remains the final transaction approval surface.

## Deliberately out of scope

Recurring billing, invoices stored by XDCID, payment-status webhooks, escrow, refunds, fiat conversion, relaying, and QR codes are not part of this MVP.
