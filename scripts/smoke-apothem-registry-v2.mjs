import {
  createPublicClient,
  getAddress,
  http,
  keccak256,
  parseAbi,
  stringToHex,
  zeroAddress,
} from "viem";

const STACK = {
  registry: getAddress("0xA601b5e9114c0DfeCea4E0ef99D6Fc020B330512"),
  registrar: getAddress("0xd51EdbE27BffA0993D9CFf672613a2d6eC0a5D7b"),
  forwardResolver: getAddress("0x5F20A2eb2E3c81b4ecc5d5bA3177225d7E3E1a94"),
  reverseResolver: getAddress("0xD3909DC7461D06D0Eb57A3b23685cB6f11D474aD"),
  multichainResolver: getAddress("0x05Efa9641b03eEe2a4624F2974e1E1192019d363"),
  subdomainRegistrar: getAddress("0x826b8599d38fcE73b246143b61955Dde0E9AfF68"),
};

const NETWORKS = [50n, 1n, 8453n, 42161n, 137n];
const baseUrl = (process.env.XDCID_SMOKE_BASE_URL || "https://dev.xdcid.xyz").replace(/\/$/, "");
const name = process.env.XDCID_SMOKE_NAME?.trim().toLowerCase();
const expectedOwner = process.env.XDCID_SMOKE_OWNER
  ? getAddress(process.env.XDCID_SMOKE_OWNER)
  : undefined;

if (!name || !name.endsWith(".xdc")) {
  throw new Error("Set XDCID_SMOKE_NAME to an active disposable Apothem .xdc name");
}

const client = createPublicClient({
  transport: http(process.env.APOTHEM_RPC_URL || "https://rpc.apothem.network"),
});
const node = keccak256(stringToHex(name));
const registryAbi = parseAbi([
  "function registrar() view returns (address)",
  "function ownerOf(bytes32 node) view returns (address)",
  "function expiryOf(bytes32 node) view returns (uint256)",
]);
const reverseAbi = parseAbi([
  "function primaryNames(address account) view returns (string)",
]);
const multichainAbi = parseAbi([
  "function addressFor(bytes32 node,uint256 chainId) view returns (address)",
]);

const [activeRegistrar, owner, expiry] = await Promise.all([
  client.readContract({ address: STACK.registry, abi: registryAbi, functionName: "registrar" }),
  client.readContract({ address: STACK.registry, abi: registryAbi, functionName: "ownerOf", args: [node] }),
  client.readContract({ address: STACK.registry, abi: registryAbi, functionName: "expiryOf", args: [node] }),
]);

assertAddress("active registrar", activeRegistrar, STACK.registrar);
if (owner === zeroAddress || expiry <= BigInt(Math.floor(Date.now() / 1000))) {
  throw new Error(`${name} is not an active Registry V2 name`);
}
if (expectedOwner) assertAddress("name owner", owner, expectedOwner);

const primaryName = await client.readContract({
  address: STACK.reverseResolver,
  abi: reverseAbi,
  functionName: "primaryNames",
  args: [owner],
});
if (primaryName !== name) {
  throw new Error(`reverse resolution returned ${primaryName || "<empty>"}, expected ${name}`);
}

for (const chainId of NETWORKS) {
  const destination = await client.readContract({
    address: STACK.multichainResolver,
    abi: multichainAbi,
    functionName: "addressFor",
    args: [node, chainId],
  });
  if (destination === zeroAddress) {
    throw new Error(`chain ${chainId} resolved to the zero address`);
  }
  console.log(`chain ${chainId}: ${destination}`);
}

const [nameData, reverseData, ownedData] = await Promise.all([
  getData(`/api/v1/names/${encodeURIComponent(name)}?years=1`),
  getData(`/api/v1/reverse/${owner}`),
  getData(`/api/v1/addresses/${owner}/names?known=${encodeURIComponent(name)}`),
]);

assertAddress("API registry", nameData.registry?.xdcid?.contract, STACK.registry);
assertAddress("API owner", nameData.owner, owner);
if (reverseData.name !== name || reverseData.verified !== true) {
  throw new Error("reverse API did not return the verified primary name");
}
if (!ownedData.names?.some((entry) => entry.name === name)) {
  throw new Error("owned-name API did not include the smoke-test name");
}

console.log(`Registry V2 smoke test passed for ${name} (${owner}) at ${baseUrl}`);

async function getData(path) {
  const response = await fetch(baseUrl + path, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json();
  if (!response.ok || payload.version !== "v1" || !("data" in payload)) {
    throw new Error(`${path} failed: ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

function assertAddress(label, actual, expected) {
  if (!actual || getAddress(actual) !== getAddress(expected)) {
    throw new Error(`${label} was ${actual || "<empty>"}; expected ${expected}`);
  }
}
