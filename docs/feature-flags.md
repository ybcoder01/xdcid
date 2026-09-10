# Feature flags

XDCID uses Vercel Flags for runtime product rollout decisions. These flags are
evaluated on the server and passed to the browser as booleans. Transactional
API routes evaluate the same flag independently, so hiding a control in the UI
is never the only enforcement.

## Initial flags

| Flag key | Disabled behavior | Behavior kept available |
| --- | --- | --- |
| `domain-registration` | Blocks new top-level `.xdc` quotes and shows registration as paused | Top-level renewals |
| `subdomain-registration` | Blocks new subdomain quotes and disables the registration action | Subdomain renewals |

Both flags can have different values in Development, Preview, and Production.
Changing a Vercel flag takes effect at request time and does not require a new
application deployment. A browser refresh or navigation obtains the latest UI
value.

## Vercel configuration

1. Deploy the flag definitions so Vercel can discover them through
   `/.well-known/vercel/flags`.
2. Create or adopt `domain-registration` and `subdomain-registration` in the
   Vercel project and configure each environment deliberately.
3. Generate a unique `FLAGS_SECRET` for Development, Preview, and Production:

   ```sh
   node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
   ```

4. Store each value only in its matching Vercel environment. Preview and
   Production values must be marked sensitive.
5. After the Vercel flags are active, set both server-only outage fallbacks to
   `false` in Production:

   ```text
   FEATURE_FLAG_DOMAIN_REGISTRATION_DEFAULT=false
   FEATURE_FLAG_SUBDOMAIN_REGISTRATION_DEFAULT=false
   ```

During the first migration, leaving the fallback variables unset preserves the
current `NEXT_PUBLIC_SIGNED_REGISTRAR_ENABLED` and
`NEXT_PUBLIC_SUBDOMAIN_REGISTRATION_ENABLED` behavior. The old public variables
remain contract-configuration prerequisites; they are not the runtime rollout
switch after the migration.

Local development does not contact Vercel unless a `FLAGS` SDK credential is
present. It uses the fallback values instead, which avoids requiring Vercel OIDC
for ordinary local work.

## Safe rollout

Recommended initial values:

| Environment | Domain registration | Subdomain registration |
| --- | --- | --- |
| Development | Enabled | Enabled |
| Preview | Disabled until the preview is approved | Disabled until the preview is approved |
| Production | Match the current live state during migration | Match the current live state during migration |

After migration, keep both Production fallbacks disabled and control the live
state from Vercel Flags. Test each flag independently: disabled UI, direct API
rejection, enabled registration, and unaffected renewal.

## Security boundary

Feature flags control XDCID's website and quote-signing service. They do not
pause an already-deployed smart contract. A quote issued immediately before a
flag is disabled remains usable until its short deadline. For an on-chain
emergency stop, use the contract's existing owner-controlled activation,
payment, or signer-authorization controls as applicable.
