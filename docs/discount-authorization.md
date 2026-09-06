# Discount Authorization module

The Discount Authorization module provides narrowly scoped free or discounted
XDCID purchases without adding discretionary pricing rules to the registrar.

## Authorization scope

Every EIP-712 authorization is bound to:

- the exact name node;
- the beneficiary wallet;
- the registrar product;
- the permitted registration term;
- a discount from 0.01% through 100%;
- a validity window;
- a maximum number of uses; and
- a unique campaign or allocation nonce.

A 100% discount represents a gas-only allocation. Registrar V2 remains
responsible for verifying availability, ownership, pricing, and registration
rules before applying the returned discount.

## Security boundaries

Only the configured consumer contract may consume an authorization. This keeps
an unrelated wallet from front-running and exhausting another user's discount.

The authorization signer can be either an ordinary wallet or an ERC-1271
contract wallet such as Safe. Signatures are domain-separated by chain ID and
the deployed module address, preventing cross-chain or cross-contract replay.

The owner can revoke an exact authorization immediately. Changing the
authorization signer or consumer requires a proposed configuration and a
48-hour delay. Consumption counts are stored on-chain and cannot exceed the
signed maximum.

## Admin and checkout integration

The active authorization signer receives a restricted admin role and can sign
an exact grant without submitting an on-chain transaction. The server verifies
the signature against the active module before saving it. The quote service
looks up only grants matching the registering wallet, canonical name, product,
term, network, registrar, and module; it checks `isUsable` on-chain before
applying the discount. Registrar V2 consumes the same authorization atomically
during registration, which prevents the application database from bypassing
the on-chain scope or maximum-use limit.

Grant identities are not stored in plaintext: wallet and name lookups use keyed
fingerprints and the signed payload is encrypted. The authorization itself is
still presented to the beneficiary at checkout because the registrar must
verify it on-chain.

The current integration supports top-level registration. The standalone
Subdomain Registrar does not consume this module, so subdomain discounts are
not enabled until a compatible subdomain contract is deployed and activated.
