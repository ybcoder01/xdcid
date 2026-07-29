# Multichain name resolution

XDCID remains the canonical ownership registry on XDC Network. The multichain resolver adds chain-qualified EVM destination records to every registered XDCID name; it does not create independent copies of a name on other chains.

## Initial networks

| Network | EVM chain ID | CAIP-2 identifier |
| --- | ---: | --- |
| XDC Network | 50 | `eip155:50` |
| Ethereum | 1 | `eip155:1` |
| Base | 8453 | `eip155:8453` |
| Arbitrum One | 42161 | `eip155:42161` |
| Polygon PoS | 137 | `eip155:137` |

The contract accepts any non-zero EVM chain ID. Adding a supported network to the website, API, or SDK therefore does not require upgrading or redeploying the resolver.

## Record model

A record is identified by:

- the existing XDCID name node;
- an EVM chain ID; and
- the destination address for that chain.

Only the current, unexpired name owner may set or clear a record. Each record is bound to the owner that created it. If the name expires or transfers, the old record stops resolving immediately. A new owner must explicitly set their own destination address.

The existing `XNSResolver` continues to provide the current XDC address and profile records. During integration, clients should use the multichain record for chain 50 when one exists and otherwise fall back to the existing XDC resolver. Other chains have no implicit fallback.

An externally owned account often has the same address on all five EVM networks, but clients must not assume that. Safe, ERC-4337, and other contract accounts can have different addresses or may not be deployed on every network.

## Security requirements for client integrations

- Display the selected network and chain ID beside every destination address.
- Require an explicit confirmation before saving each network record.
- Never infer a contract-wallet address on another chain without checking that chain.
- Resolve to no address when a record is absent, inactive, or the XDCID name has expired.
- Do not silently fall back from one non-XDC chain to another.
- Treat a changed recipient address as a security-sensitive event in APIs and monitoring.

## Resolution boundary

This feature only answers a question such as: “Which Base address should receive funds for `alice.xdc`?” It does not:

- bridge or transfer funds;
- combine balances across networks;
- swap assets;
- operate a relayer, solver, or paymaster;
- custody private keys or user funds; or
- guarantee that a destination account is deployed or recoverable.

Unified balance display and Circle CCTP payment routing are separate future phases and require their own reviews.

## Deployment and verification

The contract must be reviewed before deployment. No private key or API key belongs in the repository.

Set the existing registry address only in the deployment environment, then run:

```bash
XNS_REGISTRY_ADDRESS=0x... npx hardhat run scripts/deploy-multichain-resolver.ts --network xdc
```

After deployment, verify the constructor argument with Hardhat CLI and publish the source on XDCScan. Record the verified address in public configuration only after the deployment transaction and constructor argument have been independently checked.

## Follow-up integration sequence

1. Deploy and verify `XNSMultichainResolver` on XDC Network.
2. Add owner controls to the XDCID name page.
3. Add chain-qualified resolution to the API and SDK.
4. Add endpoint tests and short-lived RPC caching.
5. Add a read-only unified USDC balance view.
6. Evaluate a separate, noncustodial Circle CCTP payment-routing feature.
