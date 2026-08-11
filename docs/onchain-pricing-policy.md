# Configurable on-chain pricing policy

`XNSPricingPolicy` is the future on-chain source of USD/USDC-denominated pricing and quote authorization configuration. Adding it to source does not change the deployed registrar. It must be deployed, tested, verified, and explicitly connected to a later registrar version before it can affect payments.

## Configuration

Version 1 is initialized with:

- $20 per year for three-character root names;
- $10 per year for four-character root names;
- $5 per year for root names with five or more characters;
- $1 per year for every subdomain;
- the same root-name pricing for renewal;
- a fixed $3 migration fee;
- 10%, 15%, and 20% discounts for 3, 5, and 10 years;
- a 2% XDC quote buffer;
- a dedicated quote signer;
- the accepted six-decimal USDC token;
- the payment treasury;
- independent XDC and USDC payment switches.

Prices are stored in six-decimal USD/USDC base units. Migration has no term discount. Only 1, 3, 5, and 10-year terms are accepted.

## Delayed administration

The owner proposes a complete replacement configuration. It becomes activatable after 48 hours, can be cancelled before activation, and emits proposal, cancellation, and activation events. Anyone may execute an eligible activation, so a delayed change cannot be blocked merely because the owner interface is unavailable.

After activation, quotes using the previous policy version and signer remain valid for five minutes. This avoids invalidating a legitimate short-lived quote at the exact moment a policy update activates.

The future admin interface will show current and pending values, activation time, a human-readable comparison, and wallet actions for proposing, cancelling, and activating updates.

## Deployment boundaries

Routine changes to prices, discounts, quote buffer, signer, treasury, USDC address, and payment pause states do not require deploying a new registrar or pricing policy. They use the delayed configuration flow.

A new contract may still be required for a fundamental change to immutable calculation or authorization logic, or to correct a security defect. The future registrar will reference the policy through an interface so a replacement policy can be adopted through a delayed process without replacing the registry.

This contract does not implement registration, custody payments, verify EIP-712 signatures, create subdomains, or modify the current registry.
