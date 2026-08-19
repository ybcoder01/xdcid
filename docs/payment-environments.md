# Payment network environments

The send flow uses an explicit build-time profile so staging never asks users to spend mainnet assets.

## Vercel configuration

Set this variable for the `dev` deployment only:

```
NEXT_PUBLIC_PAYMENT_NETWORK_ENV=testnet
```

Leave the variable unset, or set it to `mainnet`, for production.

Because this is a `NEXT_PUBLIC_` variable, Vercel must rebuild the frontend after changing it. It is not a secret.

## Profiles

| Production | Staging |
| --- | --- |
| Ethereum | Ethereum Sepolia |
| XDC Network | XDC Apothem |
| Polygon | Polygon Amoy |
| Base | Base Sepolia |
| Arbitrum One | Arbitrum Sepolia |

The UI displays the active profile. Native symbols are ETH, XDC/TXDC, and POL as appropriate.

The staging profile uses Circle's testnet USDC and CCTP V2 contracts with the sandbox Iris API. Testnet assets have no value.

## Safety boundary

- A build exposes exactly one profile; mainnet and testnet networks are never mixed in one payment route.
- The production default remains mainnet for backward compatibility.
- Wallet switching uses the chain ID from the active profile.
- Cross-chain native assets remain unsupported.
- No private key or API key is required.
