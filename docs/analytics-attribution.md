# Privacy-safe campaign attribution

Production supports one aggregate `campaign_visit` event with two allowlisted properties:

- `source`: `x`, `telegram`, `discord`, `github`, `partner`, or `newsletter`
- `campaign`: `launch`, `beta`, or `developer`

Example:

```text
https://xdcid.xyz/?utm_source=github&utm_campaign=launch
```

Any other value is ignored. The event is sent once per browser session for the exact source/campaign pair. XDCID does not send wallet addresses, names, Pay Link IDs, transaction hashes, amounts, free-form tags, URL queries, or URL fragments as analytics properties.

Only channels listed on the public Contact page should be treated as official. Adding an X, Telegram, Discord, email, or other account to the Contact page and structured metadata requires verifying ownership first.
