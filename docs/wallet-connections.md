# Wallet connections

XDCID supports browser-injected wallets by default. WalletConnect is added only when a WalletConnect Cloud project ID is available at build time.

## Configure WalletConnect

1. Create a project in WalletConnect Cloud and copy its project ID.
2. In the Vercel project, add `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` to the required Preview and Production environments.
3. Redeploy the affected environment.

The project ID identifies the application and is exposed to the browser by design. Keep private keys, RPC credentials, API secrets, and signing material out of this variable and out of source control.

If the variable is missing or blank, XDCID continues to offer injected browser wallets and does not initialize the WalletConnect connector.

## Validation

After deployment:

1. Open the wallet connection dialog and select WalletConnect.
2. Scan the QR code with a compatible mobile wallet.
3. Confirm that the wallet connects to XDC Network, chain ID 50.
4. Test a read-only lookup before attempting a small-value Pay Link transaction.

A successful WalletConnect session does not by itself prove ERC-4337 support. The connected wallet must separately support smart-account execution on XDC.
