import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const explorerApiKey =
  process.env.ETHERSCAN_API_KEY || process.env.XDCSCAN_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    apothem: {
      url: process.env.APOTHEM_RPC_URL || "https://rpc.apothem.network",
      chainId: 51,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    },
    xdc: {
      url: process.env.XDC_MAINNET_RPC_URL || "https://earpc.xinfin.network",
      chainId: 50,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    }
  },
  etherscan: {
    apiKey: explorerApiKey,
    customChains: [
      {
        network: "apothem",
        chainId: 51,
        urls: {
          apiURL:
            process.env.XDCSCAN_APOTHEM_API_URL ||
            "https://api.etherscan.io/v2/api",
          browserURL: "https://testnet.xdcscan.com"
        }
      },
      {
        network: "xdc",
        chainId: 50,
        urls: {
          apiURL:
            process.env.XDCSCAN_API_URL ||
            "https://api.etherscan.io/v2/api",
          browserURL: "https://xdcscan.com"
        }
      }
    ]
  }
};

export default config;
