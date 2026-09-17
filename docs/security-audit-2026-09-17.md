# XDCID Smart Contract Security Review

**Review date:** 17 September 2026  
**Scope:** XDC mainnet registry, Registrar V2, Pricing Policy V2, Discount Authorization, forward/reverse/multichain resolvers, and the deployed Subdomain Registrar  
**Review type:** Internal source, test, configuration, bytecode, and live-state review  
**Status:** High-severity issue remediated in code; Resolver V2 deployment and activation remain pending

## Executive summary

The active XDCID registrar does not retain user payments: native XDC is forwarded to the configured treasury during registration, and USDC is transferred directly from the payer to the treasury. This materially reduces custody risk, but it does not remove the need to secure domain ownership, resolution, quote authorization, and administrative controls.

No critical vulnerability was identified. One high-severity resolver flaw was reproduced: a legacy forward address and text records remain active after a name is transferred, expires, or is registered to a new owner. A payment system that trusts this resolver can therefore send funds to the former owner's address.

The deployed runtime bytecode for every documented mainnet contract matched the repository's compiled artifacts after accounting for immutable constructor values. The existing test suites passed. Administrative ownership remains concentrated in a single externally owned account, and the checked-in ownership-transfer and frontend-default configuration do not cover the complete active V2 deployment.

### Finding count

| Severity | Count |
| --- | ---: |
| Critical | 0 |
| High | 1 |
| Medium | 2 |
| Low | 3 |
| Informational | 2 |

## Scope and deployed-state verification

The review covered these documented XDC mainnet deployments:

| Component | Address |
| --- | --- |
| Registry | `0x05fa64a05bc205DeDF47e023d2D90c2d119cd097` |
| Registrar V2 | `0xdEaf1742614908a8d170f4c9520c3cd1e967ef36` |
| Pricing Policy V2 | `0x8aE4b7E57b6693c70FD40F5De17974CA5AB6DB94` |
| Discount Authorization | `0x9EE907230d351264403555fA6967EA44Ba31A5d1` |
| Subdomain Registrar | `0x27b6Ef20912B50F7b86f6C0Aed75d0ddFD7DA1C7` |
| Forward Resolver | `0x52bfa70B30190050F77033Fe427De8B3d4A8F453` |
| Reverse Resolver | `0x8b1a236845b0CC84094578cEd97844b8dC5f139f` |
| Multichain Resolver | `0x978d46Ba080Ae71b5cB39691106A1cCf6C6c7240` |

At the reviewed block, the Registry authorized Registrar V2, the registrar referenced the documented Registry, Pricing Policy, and Discount Authorization contracts, and the contracts were not paused. Deployed runtime bytecode matched the locally compiled contracts.

## Findings

### H-01 — Forward resolver records survive ownership changes and expiry

**Affected contracts:** `XNSResolver`, `XNSRegistry`  
**Impact:** Payments or integrations can resolve a name to a former owner's address after transfer, expiry, or re-registration.

`XNSResolver` stores an address and text records only by node. It does not store the owner that created a record and does not verify current ownership when reading it. `XNSRegistry.transferName` changes only the owner, while `register` overwrites owner and expiry without clearing resolver state. `resolverOf` also returns a configured resolver without checking whether the name is active.

A local proof reproduced this sequence:

1. The original owner registered a name and set a forward address.
2. The name was transferred to another wallet.
3. `addresses(node)` continued returning the original owner's address.
4. The same address remained after expiry and after the name was re-registered to the new owner.

The multichain resolver already demonstrates the correct pattern: it records `recordOwner` and returns zero when the current registry owner differs.

**Recommendation:** Deploy a versioned or owner-bound forward resolver. Store the record owner alongside every address/text record and return no record unless it equals the active registry owner. Update first-party resolution to fail closed and require the new owner to set a destination. Consider adding registry record-version increments on transfer and re-registration so all attached records are invalidated atomically. Do not rely on the existing forward resolver for payments until migration is complete.

**Remediation implemented:** First-party Send, Pay Link, public API, and SDK resolution no longer use the legacy forward resolver. They use the owner-bound multichain record for the destination chain and otherwise fall back to the current Registry owner. `XNSResolverV2` binds address and text records to the active owner and invalidates them automatically on transfer, expiry, and re-registration. Profile access fails closed until the verified V2 deployment address is configured through `NEXT_PUBLIC_XNS_RESOLVER_V2`. Five regression tests cover the ownership lifecycle. Production deployment and record migration are still required.

### M-01 — A single EOA controls the core protocol administration

**Impact:** Compromise or loss of one private key can change the authorized registrar, pause registration/renewal, control future pricing and treasury configuration after the delay, rotate discount authorization, and administer the subdomain module.

The reviewed owner address is an externally owned account rather than a contract wallet. The Registry's registrar replacement has no delay, while the pricing and discount modules have a 48-hour delay. The Registry, Registrar V2, Pricing Policy V2, Discount Authorization, and Subdomain Registrar use one-step `Ownable` administration.

**Recommendation:** Move ownership to a hardware-backed multisig with separated signers. Prefer `Ownable2Step` for future deployments. Add a timelock or delayed two-step registrar change to the Registry, monitoring for every proposed/activated policy change, and an incident runbook for pausing the registrar. Keep the quote signer and treasury operationally separate from protocol administration.

### M-02 — Checked-in deployment and ownership tooling targets the legacy registrar

**Impact:** A production build missing the expected environment override can target the obsolete registrar. An administrator following the ownership-transfer script can transfer the Registry and legacy registrar while leaving Registrar V2, Pricing Policy V2, Discount Authorization, and Subdomain Registrar controlled by the former owner.

`frontend/config/addresses.ts` defaults `registrar` to `0x6955...6cD7`, while the documented and Registry-authorized active registrar is `0xdEaf...ef36`. `scripts/transfer-ownership.ts` imports that legacy address and transfers only two contracts.

**Recommendation:** Introduce a single typed mainnet deployment manifest as the source of truth. Validate at build/deploy time that the configured registrar equals `registry.registrar()`, has code, and references the expected dependencies. Replace the transfer script with a complete, resumable ownership-migration script that enumerates every governed V2 contract and verifies final ownership before reporting success.

### L-01 — Reverse names remain stale after transfer or expiry

**Impact:** Direct consumers of `primaryNames(address)` can display a name that the wallet no longer owns.

The reverse resolver validates ownership only when setting a primary name. Reads do not revalidate current ownership or expiry. First-party API code currently performs additional validation, which reduces exposure, but raw on-chain consumers remain vulnerable to stale identity data.

**Recommendation:** Add a verified getter that returns an empty name unless its node is actively owned by the queried wallet. Store the node with the name, emit update/clear events, and have the SDK and UI use only the verified getter.

**Remediation implemented:** `XNSReverseResolverV2` stores the node with each reverse record and returns an empty result after transfer, expiry, or re-registration. First-party API, dashboard, profile UI, and SDK reverse operations fail closed until the verified V2 deployment is configured through `NEXT_PUBLIC_XNS_REVERSE_RESOLVER_V2`. Five lifecycle tests cover ownership validation and clearing. Production deployment and primary-name migration remain pending.

### L-02 — Registry permits unsafe values and exposes stale resolver metadata

**Impact:** Users can irreversibly transfer a name to the zero address, the owner can accidentally disable registration by setting a zero registrar, and `resolverOf` can expose a resolver for an expired record.

The Registry does not reject zero addresses in `setRegistrar`, `register`, or `transferName`. It also emits no registrar, transfer, registration, or resolver-change events, limiting monitoring and reliable indexing.

**Recommendation:** Reject zero addresses unless an explicit burn/release operation is intended. Make release a distinct operation. Return no resolver for inactive names, and emit events for every registry mutation.

### L-03 — Previous-version quote grace is ineffective when prices change

**Impact:** Quotes signed under the prior policy version can fail immediately after configuration activation even though the policy advertises a five-minute previous-signer grace period.

Registrar V2 accepts a previous signer/version during the grace period but recalculates the expected USD amount using the new current configuration. A prior quote based on an old price therefore fails `quote.usdMicros` validation.

**Recommendation:** Either remove the advertised grace behavior and let clients request a new quote, or retain the previous pricing configuration for the grace interval and validate previous-version quotes against that configuration.

### I-01 — The deployed subdomain contract is usable independently of its UI flag

The Subdomain Registrar is deployed and unpaused even though the product is labelled upcoming in the UI. The signed-quote and parent-controller requirements limit abuse, but a UI feature flag is not an on-chain launch control.

**Recommendation:** Pause the contract until launch if direct use is not intended, or document that the contract is live while the first-party interface remains unreleased.

### I-02 — Automated analysis coverage should be expanded

The repository's contract and SDK test suites pass, including 243 contract/application tests and 27 SDK tests during this review. Slither, Aderyn, Mythril, and Foundry were not configured in this workspace, so this review did not include their automated detectors or invariant fuzzing.

**Recommendation:** Add Slither to CI, add property/invariant tests for ownership transitions and resolver freshness, and commission an independent external audit before materially increasing protocol value or dependence.

## Positive security properties

- Registrar V2 binds signed quotes to the node, payer, name owner, product, term, token, amount, policy version, nonce, issuance time, and deadline using EIP-712.
- Quotes have a maximum 15-minute lifetime and per-payer nonces.
- Registration, renewal, and subdomain payment entry points are reentrancy guarded.
- ERC-20 payments use OpenZeppelin `SafeERC20` and move directly to the treasury.
- Native XDC is forwarded during the transaction rather than accumulated in Registrar V2.
- Pricing and discount configuration changes have 48-hour activation delays.
- Discount authorizations bind the exact node, beneficiary, product, term, discount, validity window, and use limit.
- The multichain and subdomain resolvers invalidate owner-associated records on ownership transitions.
- The deployed bytecode reviewed matches the repository artifacts.

## Prioritized remediation plan

1. **Before re-enabling custom default/profile records:** deploy and verify `XNSResolverV2`, configure `NEXT_PUBLIC_XNS_RESOLVER_V2`, and have current owners re-save their records. First-party payment routing already fails closed without the legacy resolver.
2. **Before broader production rollout:** move protocol ownership to a multisig and repair the deployment manifest and ownership-transfer tooling.
3. Add verified reverse resolution and Registry input/event hardening.
4. Add static analysis and invariant tests to CI.
5. After fixes, obtain independent review focused on resolver migration, Registry authority, quote/payment accounting, and administrative operations.

## Limitations

This is an internal engineering review, not a certification or guarantee that the contracts are vulnerability-free. It did not include private infrastructure, signer-host security, treasury procedures, social engineering, wallet firmware, third-party RPC internals, or exhaustive formal verification. Findings are based on the repository and public on-chain state available on the review date.
