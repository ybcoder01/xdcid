# Account-abstraction payment compatibility

XDCID Pay Links are wallet-agnostic. A connected wallet may submit a normal XDC transaction or may translate the same payment intent into an ERC-4337 UserOperation.

## Responsibility boundary

XDCID prepares the recipient, token, amount, and calldata, then asks the connected wallet to review and submit the payment. The wallet remains responsible for:

- selecting and validating its smart-account implementation;
- constructing and signing any UserOperation;
- selecting its EntryPoint and bundler;
- choosing whether to use a paymaster;
- deploying a counterfactual smart account when required;
- returning a transaction result that the application can confirm.

XDCID does not run a wallet, bundler, paymaster, relayer, account factory, or EntryPoint. It does not store provider credentials or promise gas sponsorship.

The protocol roles and UserOperation flow are defined by [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337). XDC Network has announced live account-abstraction infrastructure and a shared ERC-4337 mempool; wallet support can still vary by provider.

## Detection limits

Contract bytecode at the connected address proves that code is currently deployed, but it does not prove that the wallet uses ERC-4337. Conversely, an address with no code may be an ordinary account or a counterfactual smart account that will be deployed with its first UserOperation.

For that reason, XDCID uses bytecode only for cautious UI guidance. It never blocks payment or claims an account is an EOA solely because no bytecode exists.

## Receipt attribution

For a direct transaction, the connected payer and transaction sender are normally the same address.

For ERC-4337, a bundler can submit the outer transaction while the connected smart account authorizes and executes the payment. XDCID therefore records:

- **Payer:** the account connected when the payment was approved;
- **Network submitter:** the outer transaction sender, shown only when it differs from the payer;
- **Transaction hash:** the confirmed XDC Network transaction used for independent verification.

This avoids incorrectly presenting the bundler as the customer who paid.

## Security and privacy

- Payment still moves directly to the address resolved by the XNS ID.
- XDCID never receives or holds payment funds.
- The connected wallet remains the final confirmation surface.
- Paymaster availability and sponsorship policy belong to the wallet or its provider.
- RPC inspection failure leaves the account type unknown and does not fail open or grant authority.
- No private key, API key, bundler URL, paymaster credential, or UserOperation is stored by this integration.

## Deliberate limits

This compatibility layer does not bundle transactions itself, sponsor gas, deploy a smart account, select a wallet vendor, or guarantee that every ERC-4337 wallet exposes an XDC-compatible provider. A provider-specific adapter should be considered only after testing a chosen wallet on Apothem and reviewing its packages, contracts, operational dependencies, and credential requirements.
