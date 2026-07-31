# Registry-aware name status

XDCID name lookups compare the XDCID registry with the legacy XDCDomains
contract on XDC mainnet. The comparison is read directly from both contracts;
it does not require a database or a stored copy of the legacy name list.

The legacy contract is
`0x295a7aB79368187a6CD03c464cfaAb04d799784E`. Its token identifier is the
unsigned integer representation of `keccak256(lowercase canonical name)`.

## Response

Name, resolve, availability, and profile responses include a `registry`
object with one of these states:

- `unregistered`: neither registry contains the name.
- `xdcid`: only XDCID contains the name.
- `legacy`: only XDCDomains contains the name.
- `collision`: both registries contain the same canonical name.

The object also includes the contract and owner reported by each registry.

Use `registry.registrationAllowed` when deciding whether to offer a new
registration. It is true only for `unregistered`.

The existing top-level `available` field remains the raw XDCID registrar
result for API compatibility. It must not be treated as global namespace
availability.

## Authority policy

- XDCID-only names may use XDCID resolution.
- Legacy-only names remain blocked from new registration and require an
  explicit migration process before XDCID can become authoritative.
- Collisions have no automatic authoritative registry and require human
  review.
- Unregistered names have no resolver until registration.

This layer does not migrate, transfer, burn, or register a name. It only
reports on-chain state so later registration and payment flows can fail safely.
