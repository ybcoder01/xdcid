# Privacy-safe product analytics

XDCID uses Vercel Web Analytics on the public production hosts only. Preview,
development, and test hosts are rejected by the analytics middleware.

## Collected data

Automatic Web Analytics supplies aggregate page, route, referrer, country,
device, browser, and operating-system dimensions. XDCID also emits the following
coarse product events:

- `registration_started`, `registration_confirmed`, `registration_failed`
- `pay_link_created`, `pay_link_creation_failed`, `pay_link_opened`, `pay_link_cancelled`
- `pay_link_started`, `pay_link_confirmed`, `pay_link_failed`
- `send_started`, `send_confirmed`, `send_failed`

Custom properties are restricted to an allowlist:

- `asset`: `xdc`, `usdc`, `eth`, `pol`, or `other`
- `route`: a pair of allowlisted network names, or `other`
- `term`: `1y`, `3y`, `5y`, `10y`, or `other`

## Data that must never be collected

Analytics events must not contain wallet addresses, XDCID names, searched names,
Pay Link or request IDs, transaction hashes, payment amounts, references,
descriptions, exchange addresses, labels, memo/tags, signatures, form contents,
or arbitrary error messages.

Every analytics property is normalized inside `frontend/lib/productAnalytics.ts`.
Callers must use that module instead of importing Vercel's `track` function.

## URL redaction

All query strings and fragments are removed before collection. Dynamic paths are
reported only as templates:

- `/pay/<name>` becomes `/pay/[name]`
- `/name/<name>` becomes `/name/[name]`

Malformed URLs and events from hosts other than `xdcid.xyz` and
`www.xdcid.xyz` are discarded.
