# Exchange Address Book

The Exchange Address Book is a dev-preview feature for keeping frequently used
centralized-exchange deposit destinations together with their operational
context. It is intentionally separate from Travel Rule identity credentials.

## First release

- Stores an exchange name, user label, asset, mainnet network, EVM deposit
  address, optional memo/tag, private notes, and an active/reconfirm/retired
  status.
- Lets the wallet owner search, edit, remove, copy, and select a saved
  destination from the Send screen.
- Locks a selected Send destination to its saved address, asset, and network.
  A mismatch blocks payment rather than silently changing the destination.
- Refuses to send to an entry with a memo/tag because the current EVM Send flow
  cannot safely include an exchange memo. This prevents a deposit that an
  exchange may be unable to credit.

## Privacy and authentication

- The browser unlocks the vault with a gasless wallet signature. The challenge
  is short-lived, one-time, origin-bound, and stored server-side.
- The resulting private-vault cookie is `HttpOnly`, `SameSite=Strict`, bound to
  the client, and expires after 30 minutes. Users can lock it immediately.
- Address-book contents are serialized into one AES-256-GCM encrypted payload.
  The database keeps only the entry ID, timestamps, a keyed wallet fingerprint,
  and ciphertext outside that payload.
- CRUD routes derive the owner from the authenticated vault session; they never
  accept an owner wallet in the request body.
- Mutations require same-origin requests and authentication endpoints are rate
  limited. Challenges are consumed atomically to prevent replay.

## Configuration

The feature uses `DATABASE_URL`, `PAYMENT_RECORD_ENCRYPTION_KEY`, and
`PAYMENT_PARTICIPANT_FINGERPRINT_KEY`. A separate
`PRIVATE_VAULT_SESSION_SECRET` of at least 32 random bytes is recommended. If it
is omitted, `ADMIN_SESSION_SECRET` is used with private-vault domain separation.

Configure independent secrets for Preview and Production. This feature should
remain preview-only until wallet authentication, encrypted persistence, CRUD,
and Send mismatch protections have completed acceptance testing.
