$ErrorActionPreference = "Stop"

Get-Content ".env" | ForEach-Object {
  if ($_ -match "^([^#=]+)=(.*)$") {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
  }
}

$env:XDC_MAINNET_RPC_URL = "https://earpc.xinfin.network"
$env:NODE_OPTIONS = "--use-system-ca"
$env:PATH = "C:\Users\Vahit\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\Vahit\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;$env:PATH"

& "C:\Users\Vahit\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd" hardhat run work/check-xdc-balance.ts --network xdc
