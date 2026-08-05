# Five-network CCTP testnet flow

This testnet-only implementation validates XDCID USDC payments across:

| Network | Chain ID | Circle domain | Test USDC |
| --- | ---: | ---: | --- |
| Ethereum Sepolia | 11155111 | 0 | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| XDC Apothem | 51 | 18 | `0xb5AB69F7bBada22B28e79C8FFAECe55eF1c771D4` |
| Polygon Amoy | 80002 | 7 | `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582` |
| Base Sepolia | 84532 | 6 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Arbitrum Sepolia | 421614 | 3 | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |

Every directed pair is enabled. Test tokens have no monetary value.

## Test page

Use `/testnet/cctp` on the pull-request preview. The page is not linked from production navigation.

Choose:

- source and destination testnets;
- Automatic forwarding or Standard Transfer;
- amount and recipient address.

Automatic forwarding requests a live Circle quote, approves the exact gross burn amount, calls `depositForBurnWithHook`, and waits for Circle's destination transaction. The recipient receives the entered amount after Circle protocol and forwarding fees are added to the source burn amount.

Standard Transfer approves the exact amount, burns it, waits for the Circle attestation, and asks the wallet to call `receiveMessage` on the destination.

Both modes support recovery from the public source burn transaction hash after a reload.

## Contracts

Circle CCTP V2 testnet contracts on the five EVM testnets:

- TokenMessengerV2: `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA`
- MessageTransmitterV2: `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275`
- TokenMinterV2: `0xb43db544E2c27092c107639Ad201b3dEfAbcF192`

Standard finality uses threshold `2000`.

## Security boundary

- The connected wallet signs source approval and burn transactions.
- Standard mode also signs the destination mint.
- Automatic mode uses Circle's Forwarding Service; XDCID does not custody or relay funds.
- No private key, seed phrase, API key, RPC credential, or backend signer is required.
- The approval is limited to the prepared burn amount.
- Circle quotes are validated and capped before a transaction is prepared.
- The attestation endpoints accept only configured testnets and validated public transaction hashes.
- No transfer session is stored by XDCID.

## Validation order

1. Arbitrum Sepolia → XDC Apothem in both modes.
2. XDC Apothem ↔ Base Sepolia.
3. XDC Apothem ↔ Polygon Amoy.
4. XDC Apothem ↔ Ethereum Sepolia.
5. Remaining non-XDC pairs.
6. Resume both a Standard and an automatic transfer from their burn hashes.

## References

- [Circle supported chains](https://developers.circle.com/cctp/concepts/supported-chains-and-domains)
- [Circle testnet contracts](https://developers.circle.com/cctp/references/contract-addresses)
- [Circle USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)
- [Circle Forwarding Service](https://developers.circle.com/cctp/concepts/forwarding-service)
