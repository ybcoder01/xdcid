# Private Receive MVP

The Private Receive MVP demonstrates one-time EVM destination derivation for an XDC identity without connecting a wallet or exposing a normal receive address.

## Scope

The demo:

- generates an ephemeral receiver session in browser memory
- exposes only compressed secp256k1 public keys in an `st:xdc:` meta-address
- derives a fresh EVM destination and ephemeral public key for every simulated payment
- verifies locally that each simulated announcement belongs to the receiver session
- destroys the in-memory test secrets when the user resets or leaves the page

The demo does not:

- connect to a wallet
- sign or broadcast transactions
- read or manage balances
- import, export, display, back up, or recover private keys
- deploy or call a contract
- write an XDCID resolver record
- store secrets in local storage, cookies, a database, logs, or an API
- provide a usable way to recover real funds

Do not send XDC, USDC, or any other asset to an address shown by this MVP.

## Privacy model

The derivation is based on the secp256k1 stealth-address construction described by ERC-5564:

1. A receiver session generates independent spending and viewing key pairs.
2. The public keys form a reusable `st:xdc:` meta-address.
3. A simulated sender generates a fresh ephemeral key pair.
4. ECDH produces a shared point known to the sender and receiver.
5. A hash-derived curve tweak produces a one-time public key and EVM address.
6. The receiver recomputes the result using the viewing secret and announcement's ephemeral public key.

Every simulated payment should have a different destination. The view tag lets a receiver reject unrelated announcements before doing the full public-key derivation.

This reduces direct recipient-address linkability. It does not hide the sender, amount, timing, IP address, XDCID ownership address, or later consolidation of funds.

## Cryptographic dependency

The implementation uses `@noble/curves` version `1.9.7`, already present in the repository lockfile through existing dependencies and now declared directly. Noble Curves is a minimal open-source cryptographic library with independent audits and cross-library test coverage.

No cryptographic package installation script, native binary, remote service, or runtime download is used.

This XDCID integration has not received an independent security audit. The dependency's audits do not constitute an audit of this protocol composition or user interface.

## Test the preview

After the pull request has a Vercel preview:

1. Open `/private-receive`.
2. Confirm the warning says not to send funds.
3. Select **Start local demo**.
4. Generate at least two one-time addresses.
5. Confirm the addresses and ephemeral public keys differ.
6. Confirm each result says **Recipient verified locally**.
7. Select **Reset and destroy test secrets**.
8. Reload the page and confirm no session or result persists.

Automated tests also check unique derivation, receiver isolation, session destruction, and meta-address validation.

## Production gates

Before any real-value experiment:

- obtain an independent cryptographic and frontend security review
- compare the implementation against published ERC-5564 test vectors
- decide how wallets derive, back up, and recover stealth keys without XDCID becoming a wallet
- deploy and verify an XDC announcer or confirm a compatible canonical deployment
- design gas sponsorship without linking the receiver's public wallet
- add an opt-in resolver record in a separate contract change
- test only on Apothem with disposable funds
- complete legal and compliance review

A production design should leave signing, custody, key recovery, balances, and transaction management to compatible wallets. XDCID should remain the discovery and payment-instruction layer.
