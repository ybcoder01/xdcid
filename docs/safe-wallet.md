# Safe Wallet compatibility

XDCID supports Safe smart accounts on XDC Network through the existing wallet, payment-request, and ERC-1271 paths.

## Connection paths

- **Safe App environment:** when XDCID is opened from Safe Wallet, RainbowKit exposes the Safe connector and uses the active Safe account automatically.
- **WalletConnect:** a Safe user can also connect from Safe Wallet through XDCID's generic WalletConnect option.

The dedicated Safe option is hidden outside the Safe Wallet browser environment, so it does not duplicate the ordinary wallet list. Both connection paths require XDC Network mainnet, chain ID 50. WalletConnect remains enabled only when the public `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` deployment variable is configured.

## Safe-owned XNS IDs

To create a signed Pay Link for a Safe-owned name:

1. The Safe address must be the current on-chain owner of the XNS ID.
2. XDCID requests the existing EIP-712 Payment Request signature from the connected Safe.
3. Safe owners approve the request according to the Safe's current threshold and policy.
4. Checkout detects that the XNS owner is a contract and calls `isValidSignature(bytes32,bytes)`.
5. Payment is enabled only when the Safe returns the ERC-1271 magic value `0x1626ba7e`.

A revert, incorrect magic value, unavailable RPC response, changed owner set, changed threshold, or changed validation policy fails closed and blocks the Pay Link.

## Payments from Safe

XDCID passes the resolved recipient, amount, token, and calldata to the connected Safe provider. Safe Wallet remains responsible for creating the proposal, collecting the required approvals, and executing it. XDCID shows a receipt only after a transaction is confirmed on XDC Network.

A proposal that has not reached its approval threshold is not a completed payment. Users should confirm the executed transaction hash and recipient before treating a request as paid.

## Acceptance test

Before describing Safe support as production-validated, complete this test with a low-value XDC Safe:

1. Open XDCID from Safe Wallet and confirm the active Safe address is connected on chain ID 50.
2. Connect the same Safe through WalletConnect and confirm the address is unchanged.
3. Use an XNS ID owned by that Safe to create a signed XDC Pay Link.
4. Confirm checkout reports successful ERC-1271 verification.
5. Submit a low-value payment and verify that it remains pending until the Safe threshold is satisfied.
6. Approve and execute the proposal, then compare the receipt recipient, amount, payer, and transaction hash with XDCScan.
7. Repeat with USDC only after the native-XDC flow succeeds.
8. Reject a proposal and confirm XDCID never reports it as paid.

## Deliberate limits

This integration does not create Safe accounts, change Safe owners or thresholds, deploy a new contract, run a transaction service, provide a bundler or paymaster, or guarantee ERC-4337 execution. ERC-4337 support requires a separately validated Safe module and XDC-compatible bundler path.
