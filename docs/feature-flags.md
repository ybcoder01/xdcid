# Feature flags and launch modes

XDCID evaluates launch controls on the server through Vercel Flags. The same
decision gates the user interface and the signed-quote API, so hiding a button
is never the security boundary. Other platform features remain available while
registration is staged.

## Flags

| Flag key | Values | Effect |
| --- | --- | --- |
| `registration-rollout` | `closed`, `beta`, `public` | Controls new top-level `.xdc` registrations. Renewals remain available. |
| `subdomain-registration` | `false`, `true` | Controls new paid subdomain registrations. Subdomain renewals remain available. |

`registration-rollout=beta` is deliberately stricter than an ordinary feature
flag. The quote service will sign a new registration only when all of these are
true:

- the requested label is exactly five letters (`a-z`);
- the term is exactly one year;
- the beneficiary wallet and exact name have a stored beta-campaign grant;
- the grant is a 100% discount with one use and is still valid on-chain.

Consequently, switching the flag to beta cannot accidentally open paid
registration to the public. The limit is 50 distinct beneficiary wallets. The
admin dashboard shows issued and remaining places and rejects beta grants after
the allocation is full. Each wallet can receive only one beta-campaign grant.

## Safe rollout

1. Deploy this code to a Preview environment.
2. Create `registration-rollout` and `subdomain-registration` in the Vercel
   project and keep both Production values unchanged.
3. In Preview, select `beta` and disable subdomain registration.
4. Verify closed, beta, and public behavior, including a direct quote API call.
5. Add beta testers from the discount-signer admin panel only after receiving
   their wallet address and chosen five-letter name.
6. When launch is approved, change Production to `beta`; no redeployment is
   required.
7. After the beta, change Production to `public`. Existing grants stay scoped
   to their original wallet and name and cannot be reused.

Recommended initial values:

| Environment | Registration rollout | Subdomains |
| --- | --- | --- |
| Development | `public` | Enabled |
| Preview | `beta` | Disabled |
| Production | Preserve current behavior until launch approval | Disabled |

## Fallback configuration

Vercel deployments authenticate to Vercel Flags with project OIDC. Local
development uses server-only fallback values when no provider is available:

```text
FEATURE_FLAG_REGISTRATION_MODE_DEFAULT=closed
FEATURE_FLAG_SUBDOMAIN_REGISTRATION_DEFAULT=false
```

Allowed registration fallback values are `closed`, `beta`, and `public`. If the
new fallback is absent, XDCID preserves the existing
`NEXT_PUBLIC_SIGNED_REGISTRAR_ENABLED` behavior during migration. The old public
variables remain contract-configuration prerequisites; they are not the
long-term rollout switch.

The discovery endpoint is `/.well-known/vercel/flags`. Never store private
keys, wallet secrets, or the beta roster in flag values.

## Security boundary

These flags control the XDCID website and quote-signing service. They do not
pause deployed contracts, and a quote issued immediately before a flag change
remains valid until its short deadline. Contract owner controls remain the
emergency stop for on-chain activity.
