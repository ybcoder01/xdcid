# XDCID terminology

Use **XDCID name** or **.xdc name** in user-facing copy. Use **XDCID owner** for the wallet or smart account that currently owns an active name.

`XNS` remains in some Solidity contract names, environment variables, database fields, and internal APIs for backwards compatibility. Those identifiers are implementation details and should not be presented as a separate customer-facing product.

The supported destination-network claim is exactly five networks:

- XDC Network
- Ethereum
- Base
- Arbitrum
- Polygon

Registration and canonical ownership live on XDC Network. A single XDCID name can store distinct destination addresses for the five supported EVM networks; the name is not independently registered on each destination chain.
