import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    apothem: {
      url: process.env.APOTHEM_RPC_URL || "https://erpc.apothem.network",
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
    apiKey: process.env.XDCSCAN_API_KEY || "",
    customChains: [
      {
        network: "xdc",
        chainId: 50,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://xdcscan.com"
        }
      }
    ]
  },
  sourcify: {
    enabled: false
  }
};

export default config;
