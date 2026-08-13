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

A 100% discount represents a free allocation. The future registrar remains
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

## Deployment boundaries

This module is not deployed, connected, or activated by its implementation PR.
Registrar v2 will integrate it through the consumer-only interface. The
production registry, active registrar, pricing policy, resolvers, and registered
names remain unchanged.
