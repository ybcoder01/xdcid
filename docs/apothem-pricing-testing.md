# Apothem pricing acceptance test

This Preview-only page exercises the deployed Apothem pricing stack without a server-held private key.

## Public deployment

- Registry: `0x2BeD8EB404e1BD8D690e3dD2Fd06F287e5A92Eb1`
- Legacy collision mock: `0xe7CfeC8729686CcB2FB25B8275D6bd6Bc68A4bf0`
- Pricing policy: `0xB082dE6B5E6cAaA4752e36CF173e4325a5AaAF91`
- Signed-quote registrar: `0x29cDc15B0Ff1AD8dCBa69E7218810a8868878a8A`
- Apothem USDC: `0xb5AB69F7bBada22B28e79C8FFAECe55eF1c771D4`
- Chain ID: 51

## Preview setup

Set `ENABLE_APOTHEM_PRICING_TEST=true` in Vercel Preview only and redeploy. Visit
`/testing/apothem-pricing`.

The designated wallet signs an EIP-712 quote in the browser, then submits the corresponding registrar transaction. No private key, quote, signature, name, or wallet record is stored by the page.

## Test order

1. Connect the designated Apothem wallet.
2. Choose a fresh name, term, product, and payment currency.
3. Prepare and sign the ten-minute quote.
4. For USDC, approve only the exact quoted amount if allowance is insufficient.
5. Submit registration and verify owner/expiry.
6. Prepare a new renewal quote and submit renewal.
7. Try the previously used quote again and confirm nonce replay protection rejects it.
8. Prepare a fresh unused quote and click **Test expired and modified quote**. Both read-only simulations must be rejected without a wallet transaction.
9. Enter a fresh unregistered name and click **Mark and test legacy collision**. Approve the test-only mock transaction and confirm the registrar reports the name unavailable.
10. Click **Clear legacy test marker** and approve cleanup before using that name in another test.

The XDC path obtains only the market conversion from the existing pricing endpoint. The on-chain policy remains authoritative for the USD amount, policy version, nonce, signer authorization, and payment configuration.

After testing, remove the Preview flag. Do not enable this self-signing test harness in Production.

The legacy mock is an Apothem test dependency only. Its mutation functions are intentionally permissionless and must never be used as a production legacy-data source.
