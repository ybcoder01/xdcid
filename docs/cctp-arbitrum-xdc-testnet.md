# Arbitrum Sepolia ↔ XDC Apothem CCTP testnet foundation

This document describes the testnet-only Circle CCTP V2 foundation included in the XDCID SDK. It prepares unsigned contract-write requests; it does not connect a wallet, sign, submit, relay, or custody a transaction.

Do not use these settings for real value.

## Supported testnet route

| Network | Chain ID | CCTP domain | Test USDC |
| --- | ---: | ---: | --- |
| Arbitrum Sepolia | 421614 | 3 | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |
| XDC Apothem | 51 | 18 | `0xb5AB69F7bBada22B28e79C8FFAECe55eF1c771D4` |

Circle's CCTP V2 testnet contracts used on both networks:

- TokenMessengerV2: `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA`
- MessageTransmitterV2: `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275`
- TokenMinterV2: `0xb43db544E2c27092c107639Ad201b3dEfAbcF192`

The XDC route supports Standard Transfer finality, so the burn request uses finality threshold `2000`. Fast Transfer is not configured for XDC.

## Transfer lifecycle

1. Resolve the recipient's destination-chain address from their XDCID multichain record.
2. Ask the source-chain wallet to approve TokenMessengerV2 to spend the exact test USDC amount.
3. Ask the source-chain wallet to call `depositForBurn` with the destination CCTP domain and recipient encoded as `bytes32`.
4. After the burn transaction is mined, poll Circle's testnet Iris endpoint no more often than every five seconds:
   `GET https://iris-api-sandbox.circle.com/v2/messages/{sourceDomain}?transactionHash={transactionHash}`
5. A `404` while the attestation is pending is expected. Wait until the response contains the message and attestation.
6. Ask a wallet on the destination chain to call `receiveMessage(message, attestation)` on MessageTransmitterV2.
7. Confirm the mint transaction and show source and destination explorer links.

Both directions are supported by the builders: Arbitrum Sepolia to XDC Apothem and XDC Apothem to Arbitrum Sepolia.

## SDK exports

- `CCTP_TESTNETS` — audited network, domain, test USDC, and CCTP contract metadata.
- `parseCctpUsdcAmount` — exact six-decimal USDC parsing with positive and per-transfer-limit checks.
- `addressToCctpBytes32` — non-zero EVM recipient validation and CCTP encoding.
- `prepareCctpBurn` — approval and `depositForBurn` request builders.
- `buildCctpAttestationUrl` — validated Circle Iris message lookup URL.
- `prepareCctpReceive` — destination `receiveMessage` request builder.

The builders deliberately return request data instead of sending transactions. The future wallet UI must display the route, amount, recipient, fee ceiling, and network before each signature.

## Test prerequisites

A manual end-to-end test requires:

- native testnet gas on both Arbitrum Sepolia and XDC Apothem;
- test USDC on the source network;
- a wallet able to switch to both testnets; and
- a destination address controlled by the tester.

Test tokens have no monetary value. Never enter or commit a private key, seed phrase, API key, WalletConnect project ID, RPC credential, or attestation secret for this flow.

## Production boundary

This foundation intentionally contains no mainnet route, frontend transfer button, automatic transaction submission, relayer, paymaster, backend signing service, bridge contract, or stored user data. A later PR can add the wallet-driven testnet lifecycle after this configuration and its validation rules pass review.

## Primary references

- [Circle CCTP supported chains and domains](https://developers.circle.com/cctp/concepts/supported-chains-and-domains)
- [Circle CCTP contract addresses](https://developers.circle.com/cctp/references/contract-addresses)
- [Circle USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)
- [Circle CCTP contract interfaces](https://developers.circle.com/cctp/references/contract-interfaces)
- [Circle CCTP V2 messages API](https://developers.circle.com/api-reference/cctp/all/get-messages-v2)
