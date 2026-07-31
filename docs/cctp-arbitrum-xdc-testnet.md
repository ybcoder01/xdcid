# Arbitrum Sepolia ↔ XDC Apothem CCTP testnet flow

This document describes XDCID's testnet-only Circle CCTP V2 integration. The SDK builds validated contract requests and the `/bridge` page asks the connected wallet to sign each source and destination transaction.

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

## Browser test flow

1. Open `/bridge` and connect a wallet that can switch to both testnets.
2. Choose Arbitrum Sepolia → XDC Apothem or the reverse route.
3. Enter an amount and destination address. Leaving the address blank uses the connected address.
4. Confirm the exact USDC approval in the source wallet.
5. Confirm `depositForBurn` in the source wallet.
6. The page polls XDCID's stateless attestation route, which validates the public burn hash and queries Circle Iris no more often than every five seconds.
7. When Circle returns a complete message and attestation, switch to the destination network and confirm `receiveMessage`.
8. Verify the source burn and destination mint using the explorer links displayed by the page.

If the page is reloaded after the burn, select the original source network and paste the public burn transaction hash into the resume field. No transfer session has to be stored by XDCID.

## SDK exports

- `CCTP_TESTNETS` — network, domain, test USDC, and CCTP contract metadata.
- `parseCctpUsdcAmount` — exact six-decimal USDC parsing with positive and per-transfer-limit checks.
- `addressToCctpBytes32` — non-zero EVM recipient validation and CCTP encoding.
- `prepareCctpBurn` — exact approval and `depositForBurn` request builders.
- `buildCctpAttestationUrl` — validated Circle Iris message lookup URL.
- `prepareCctpReceive` — destination `receiveMessage` request builder.

## Test prerequisites

A manual end-to-end test requires:

- native testnet gas on both Arbitrum Sepolia and XDC Apothem;
- test USDC on the source network;
- a wallet able to switch to both testnets; and
- a destination address controlled by the tester.

Test tokens have no monetary value. Never enter or commit a private key, seed phrase, API key, RPC credential, or attestation secret for this flow.

## Security and data boundary

- Every transaction is signed by the user's connected wallet.
- XDCID does not custody USDC or deploy an intermediary bridge contract.
- The approval is limited to the exact transfer amount.
- The attestation route accepts only a supported source and a validated public transaction hash.
- The route has no database and uses no API secret.
- The page keeps its current transfer state only in browser memory; a reload requires the public burn hash to resume.
- Mainnet routes, relayers, paymasters, backend signers, and automatic destination execution are not enabled.

## Primary references

- [Circle CCTP supported chains and domains](https://developers.circle.com/cctp/concepts/supported-chains-and-domains)
- [Circle CCTP contract addresses](https://developers.circle.com/cctp/references/contract-addresses)
- [Circle USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)
- [Circle CCTP contract interfaces](https://developers.circle.com/cctp/references/contract-interfaces)
- [Circle CCTP V2 messages API](https://developers.circle.com/api-reference/cctp/all/get-messages-v2)
