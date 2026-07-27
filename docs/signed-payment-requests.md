# Signed payment requests

XDCID Pay Links use wallet-signed, versioned payment requests. They provide an integrity layer between a merchant's XNS ID and the payer without making XDCID a custodian or invoice host.

## Flow

1. The current XNS owner opens `/pay`, enters the amount, token, reference, optional description, optional designated payer, and optional expiry.
2. XDCID reads the current owner from the XNS registry on XDC Network.
3. The owner signs EIP-712 typed data through an ordinary wallet or compatible smart account. Signing is gasless and cannot move funds.
4. The encoded request and signature are shared in the Pay Link URL.
5. Checkout verifies the signature against the current XNS owner, checks expiry and any designated payer, and resolves the current payment address on-chain.
6. The payer reviews and submits a normal XDC or USDC transaction from their own wallet.
7. After confirmation, checkout shows a printable proof-of-payment receipt backed by the transaction hash.

## Signature verification

For an ordinary externally owned account (EOA), checkout recovers the EIP-712 signer and requires it to equal the current XNS owner.

When the current XNS owner contains contract bytecode, checkout calls the standard ERC-1271 `isValidSignature(bytes32,bytes)` function on that smart account. Verification succeeds only when the contract returns the ERC-1271 magic value `0x1626ba7e`. A revert, malformed response, wrong magic value, or unavailable RPC response fails closed and blocks payment.

No new production contract is deployed for this feature. The ERC-1271 wallet used in the test suite is only a mock that proves the integration behavior.

## Signed format

The EIP-712 domain is:

- name: `XDCID Pay Links`
- version: `1`
- chain ID: `50`

The request commits to:

- format version and chain ID;
- canonical XNS ID;
- decimal amount and token;
- merchant payment reference and public description;
- optional designated payer (the zero address means any payer);
- issue time, optional expiry, and a random nonce.

Changing any signed field invalidates verification. If the XNS ID is transferred after signing, checkout blocks the request because the old signer is no longer the current owner.

For a smart account, validity is deliberately checked at checkout time. A signature that was once valid may later become invalid if the smart account changes its authorized signer, threshold, module, or validation policy. This is safer for payment requests because checkout follows the smart account's current rules.

## Security and data boundaries

- No private key, API key, wallet credential, request record, customer record, or uploaded document is stored by XDCID.
- The request and signature are public to anyone who receives the URL. Descriptions and references must not contain confidential or personal information.
- The designated payer is a checkout restriction, not private access control; URL contents remain readable.
- The signature authenticates the request but does not authorize or execute payment.
- Payment goes directly from the payer wallet to the address currently resolved by the XNS ID.
- The transaction does not contain the request reference. The receipt presents signed-request data alongside independent on-chain confirmation.
- The printable receipt is confirmation evidence, not a tax invoice or accounting document.
- Legacy unsigned Pay Links remain readable for compatibility and show a prominent warning.
- ERC-1271 verification depends on a live RPC read of the current smart-account code and policy; failures never fall back to accepting the request.

## Deliberate MVP limits

This release does not add ERC-4337 execution, payment-status storage, replay prevention, partial payments, refunds, recurring billing, accounting exports, invoice hosting, a relayer, an escrow contract, or a new platform fee. A signed request can be paid more than once, so the payer must review the transaction before signing.

Merchant-hosted invoice URLs and authorised billing-domain records belong in a separate follow-up change so their trust and privacy model can be reviewed independently.
