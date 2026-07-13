import fs from "node:fs";
import { createPublicClient, formatEther, http } from "viem";

const addressesSource = fs.readFileSync("frontend/config/addresses.ts", "utf8");
const registrar = addressesSource.match(/"registrar": "([^"]+)"/)?.[1];

if (!registrar || registrar === "0x0000000000000000000000000000000000000000") {
  throw new Error("Registrar address is not configured.");
}

const envSource = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
const rpc =
  envSource.match(/^NEXT_PUBLIC_XDC_RPC_URL=(.+)$/m)?.[1]?.trim() ||
  "https://rpc.xdcrpc.com";

const client = createPublicClient({
  chain: {
    id: 50,
    name: "XDC Network",
    nativeCurrency: { name: "XDC", symbol: "XDC", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } }
  },
  transport: http(rpc)
});

const abi = [
  {
    type: "function",
    name: "available",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "price",
    stateMutability: "pure",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ type: "uint256" }]
  }
];

const name = process.argv[2] || "adam.xdc";

const [available, price] = await Promise.all([
  client.readContract({ address: registrar, abi, functionName: "available", args: [name] }),
  client.readContract({ address: registrar, abi, functionName: "price", args: [name] })
]);

console.log(`registrar=${registrar}`);
console.log(`${name} available=${available}`);
console.log(`${name} price=${formatEther(price)} XDC/year`);
