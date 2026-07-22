import { createHash } from "crypto";
import { ethers } from "hardhat";
import {
  LegacyDomainLog,
  buildLegacyDomainSnapshot,
  findLegacyNameCollisions,
} from "./lib/legacy-domain-index";

const CHAIN_ID = 50;
const LEGACY_CONTRACT = "0x295a7aB79368187a6CD03c464cfaAb04d799784E";
const DEPLOYMENT_BLOCK = 48_393_303;
const DEFAULT_CONFIRMATIONS = 12;
const DEFAULT_BLOCK_SPAN = 250_000;

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const NEW_URI_TOPIC = ethers.id("NewURI(uint256,string)");
const legacyInterface = new ethers.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event NewURI(uint256 indexed tokenId, string uri)",
  "function totalSupply() view returns (uint256)",
]);

function readUnsignedInteger(
  name: string,
  fallback: number,
  minimum = 0,
): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(
      name + " must be a safe integer greater than or equal to " + minimum,
    );
  }
  return value;
}

function rpcUrls(): string[] {
  const configured = [
    process.env.XDC_MAINNET_RPC_URL,
    process.env.XDC_RPC_URL,
    ...(process.env.XDC_RPC_URLS ?? "").split(","),
  ];
  const publicFallbacks = [
    "https://earpc.xinfin.network",
    "https://rpc.xinfin.network",
  ];

  return [...new Set([...configured, ...publicFallbacks])]
    .map((value) => value?.trim())
    .filter(
      (value): value is string =>
        Boolean(value) && /^https?:\/\//i.test(value as string),
    );
}

async function usableProviders(): Promise<ethers.JsonRpcProvider[]> {
  const providers: ethers.JsonRpcProvider[] = [];

  for (const url of rpcUrls()) {
    const provider = new ethers.JsonRpcProvider(url);
    try {
      const chainId = Number(await provider.send("eth_chainId", []));
      if (chainId === CHAIN_ID) providers.push(provider);
    } catch {
      // Ignore unavailable endpoints. URLs are deliberately not logged because
      // configured RPC URLs can contain credentials.
    }
  }

  if (providers.length === 0) {
    throw new Error("No healthy XDC mainnet RPC endpoint is available");
  }
  return providers;
}

async function tryProviders<T>(
  providers: readonly ethers.JsonRpcProvider[],
  operation: (provider: ethers.JsonRpcProvider) => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (const provider of providers) {
    try {
      return await operation(provider);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All XDC RPC endpoints failed");
}

async function fetchLogsAdaptive(
  providers: readonly ethers.JsonRpcProvider[],
  fromBlock: number,
  toBlock: number,
): Promise<ethers.Log[]> {
  try {
    return await tryProviders(providers, (provider) =>
      provider.getLogs({
        address: LEGACY_CONTRACT,
        fromBlock,
        toBlock,
        topics: [[TRANSFER_TOPIC, NEW_URI_TOPIC]],
      }),
    );
  } catch (error) {
    if (fromBlock === toBlock) throw error;

    const midpoint = Math.floor((fromBlock + toBlock) / 2);
    const [left, right] = await Promise.all([
      fetchLogsAdaptive(providers, fromBlock, midpoint),
      fetchLogsAdaptive(providers, midpoint + 1, toBlock),
    ]);
    return [...left, ...right];
  }
}

function parseLegacyLog(log: ethers.Log): LegacyDomainLog | undefined {
  const parsed = legacyInterface.parseLog(log);
  if (!parsed) return undefined;

  const order = {
    blockNumber: log.blockNumber,
    transactionIndex: log.transactionIndex,
    logIndex: log.index,
    tokenId: parsed.args.tokenId.toString(),
  };

  if (parsed.name === "Transfer") {
    return {
      ...order,
      kind: "transfer",
      from: String(parsed.args.from),
      to: String(parsed.args.to),
    };
  }

  if (parsed.name === "NewURI") {
    return {
      ...order,
      kind: "new-uri",
      name: String(parsed.args.uri),
    };
  }

  return undefined;
}

async function readTotalSupply(
  providers: readonly ethers.JsonRpcProvider[],
  blockTag: number,
): Promise<string | null> {
  try {
    const data = legacyInterface.encodeFunctionData("totalSupply");
    const result = await tryProviders(providers, (provider) =>
      provider.send("eth_call", [
        { to: LEGACY_CONTRACT, data },
        ethers.toQuantity(blockTag),
      ]),
    );
    return legacyInterface.decodeFunctionResult("totalSupply", result)[0].toString();
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const providers = await usableProviders();
  const confirmations = readUnsignedInteger(
    "LEGACY_INDEX_CONFIRMATIONS",
    DEFAULT_CONFIRMATIONS,
  );
  const span = readUnsignedInteger(
    "LEGACY_INDEX_BLOCK_SPAN",
    DEFAULT_BLOCK_SPAN,
    1,
  );
  const tip = await tryProviders(providers, (provider) =>
    provider.getBlockNumber(),
  );
  const requestedToBlock = process.env.LEGACY_INDEX_TO_BLOCK
    ? readUnsignedInteger("LEGACY_INDEX_TO_BLOCK", tip)
    : undefined;
  const toBlock = requestedToBlock ?? tip - confirmations;

  if (toBlock < DEPLOYMENT_BLOCK || toBlock > tip) {
    throw new Error(
      "Index end block must be between " +
        DEPLOYMENT_BLOCK +
        " and current block " +
        tip,
    );
  }

  const rawLogs: ethers.Log[] = [];
  for (
    let fromBlock = DEPLOYMENT_BLOCK;
    fromBlock <= toBlock;
    fromBlock += span
  ) {
    const rangeEnd = Math.min(fromBlock + span - 1, toBlock);
    const logs = await fetchLogsAdaptive(providers, fromBlock, rangeEnd);
    rawLogs.push(...logs);
    process.stderr.write(
      "Indexed blocks " +
        fromBlock +
        "-" +
        rangeEnd +
        " (" +
        rawLogs.length +
        " matching logs)\n",
    );
  }

  const domainLogs = rawLogs
    .map(parseLegacyLog)
    .filter((log): log is LegacyDomainLog => Boolean(log));
  const names = buildLegacyDomainSnapshot(domainLogs);
  const canonicalCollisions = findLegacyNameCollisions(names);
  const totalSupply = await readTotalSupply(providers, toBlock);

  const payload = {
    schema: "xdcid/legacy-domain-index/v1",
    chainId: CHAIN_ID,
    contract: LEGACY_CONTRACT,
    fromBlock: DEPLOYMENT_BLOCK,
    toBlock,
    confirmations: requestedToBlock === undefined ? confirmations : null,
    sourceEvents: ["Transfer(address,address,uint256)", "NewURI(uint256,string)"],
    matchingEventCount: domainLogs.length,
    totalSupply,
    activeXdcNameCount: names.length,
    canonicalCollisionCount: canonicalCollisions.length,
    canonicalCollisions,
    names,
  };
  const snapshotSha256 = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");

  process.stdout.write(
    JSON.stringify({ ...payload, snapshotSha256 }, null, 2) + "\n",
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write("Legacy index failed: " + message + "\n");
  process.exitCode = 1;
});
import { createHash } from "crypto";
import { ethers } from "hardhat";
import {
  LegacyDomainLog,
  buildLegacyDomainSnapshot,
  findLegacyNameCollisions,
} from "./lib/legacy-domain-index";

const CHAIN_ID = 50;
const LEGACY_CONTRACT = "0x295a7aB79368187a6CD03c464cfaAb04d799784E";
const DEPLOYMENT_BLOCK = 48_393_303;
const DEFAULT_CONFIRMATIONS = 12;
const DEFAULT_BLOCK_SPAN = 250_000;

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const NEW_URI_TOPIC = ethers.id("NewURI(uint256,string)");
const legacyInterface = new ethers.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event NewURI(uint256 indexed tokenId, string uri)",
  "function totalSupply() view returns (uint256)",
]);

function readUnsignedInteger(
  name: string,
  fallback: number,
  minimum = 0,
): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(
      name + " must be a safe integer greater than or equal to " + minimum,
    );
  }
  return value;
}

function rpcUrls(): string[] {
  const configured = [
    process.env.XDC_MAINNET_RPC_URL,
    process.env.XDC_RPC_URL,
    ...(process.env.XDC_RPC_URLS ?? "").split(","),
  ];
  const publicFallbacks = [
    "https://earpc.xinfin.network",
    "https://rpc.xinfin.network",
  ];

  return [...new Set([...configured, ...publicFallbacks])]
    .map((value) => value?.trim())
    .filter(
      (value): value is string =>
        Boolean(value) && /^https?:\/\//i.test(value as string),
    );
}

async function usableProviders(): Promise<ethers.JsonRpcProvider[]> {
  const providers: ethers.JsonRpcProvider[] = [];

  for (const url of rpcUrls()) {
    const provider = new ethers.JsonRpcProvider(url);
    try {
      const chainId = Number(await provider.send("eth_chainId", []));
      if (chainId === CHAIN_ID) providers.push(provider);
    } catch {
      // Ignore unavailable endpoints. URLs are deliberately not logged because
      // configured RPC URLs can contain credentials.
    }
  }

  if (providers.length === 0) {
    throw new Error("No healthy XDC mainnet RPC endpoint is available");
  }
  return providers;
}

async function tryProviders<T>(
  providers: readonly ethers.JsonRpcProvider[],
  operation: (provider: ethers.JsonRpcProvider) => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (const provider of providers) {
    try {
      return await operation(provider);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All XDC RPC endpoints failed");
}

async function fetchLogsAdaptive(
  providers: readonly ethers.JsonRpcProvider[],
  fromBlock: number,
  toBlock: number,
): Promise<ethers.Log[]> {
  try {
    return await tryProviders(providers, (provider) =>
      provider.getLogs({
        address: LEGACY_CONTRACT,
        fromBlock,
        toBlock,
        topics: [[TRANSFER_TOPIC, NEW_URI_TOPIC]],
      }),
    );
  } catch (error) {
    if (fromBlock === toBlock) throw error;

    const midpoint = Math.floor((fromBlock + toBlock) / 2);
    const [left, right] = await Promise.all([
      fetchLogsAdaptive(providers, fromBlock, midpoint),
      fetchLogsAdaptive(providers, midpoint + 1, toBlock),
    ]);
    return [...left, ...right];
  }
}

function parseLegacyLog(log: ethers.Log): LegacyDomainLog | undefined {
  const parsed = legacyInterface.parseLog(log);
  if (!parsed) return undefined;

  const order = {
    blockNumber: log.blockNumber,
    transactionIndex: log.transactionIndex,
    logIndex: log.index,
    tokenId: parsed.args.tokenId.toString(),
  };

  if (parsed.name === "Transfer") {
    return {
      ...order,
      kind: "transfer",
      from: String(parsed.args.from),
      to: String(parsed.args.to),
    };
  }

  if (parsed.name === "NewURI") {
    return {
      ...order,
      kind: "new-uri",
      name: String(parsed.args.uri),
    };
  }

  return undefined;
}

async function readTotalSupply(
  providers: readonly ethers.JsonRpcProvider[],
  blockTag: number,
): Promise<string | null> {
  try {
    const data = legacyInterface.encodeFunctionData("totalSupply");
    const result = await tryProviders(providers, (provider) =>
      provider.call({ to: LEGACY_CONTRACT, data }, blockTag),
    );
    return legacyInterface.decodeFunctionResult("totalSupply", result)[0].toString();
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const providers = await usableProviders();
  const confirmations = readUnsignedInteger(
    "LEGACY_INDEX_CONFIRMATIONS",
    DEFAULT_CONFIRMATIONS,
  );
  const span = readUnsignedInteger(
    "LEGACY_INDEX_BLOCK_SPAN",
    DEFAULT_BLOCK_SPAN,
    1,
  );
  const tip = await tryProviders(providers, (provider) =>
    provider.getBlockNumber(),
  );
  const requestedToBlock = process.env.LEGACY_INDEX_TO_BLOCK
    ? readUnsignedInteger("LEGACY_INDEX_TO_BLOCK", tip)
    : undefined;
  const toBlock = requestedToBlock ?? tip - confirmations;

  if (toBlock < DEPLOYMENT_BLOCK || toBlock > tip) {
    throw new Error(
      "Index end block must be between " +
        DEPLOYMENT_BLOCK +
        " and current block " +
        tip,
    );
  }

  const rawLogs: ethers.Log[] = [];
  for (
    let fromBlock = DEPLOYMENT_BLOCK;
    fromBlock <= toBlock;
    fromBlock += span
  ) {
    const rangeEnd = Math.min(fromBlock + span - 1, toBlock);
    const logs = await fetchLogsAdaptive(providers, fromBlock, rangeEnd);
    rawLogs.push(...logs);
    process.stderr.write(
      "Indexed blocks " +
        fromBlock +
        "-" +
        rangeEnd +
        " (" +
        rawLogs.length +
        " matching logs)\n",
    );
  }

  const domainLogs = rawLogs
    .map(parseLegacyLog)
    .filter((log): log is LegacyDomainLog => Boolean(log));
  const names = buildLegacyDomainSnapshot(domainLogs);
  const canonicalCollisions = findLegacyNameCollisions(names);
  const totalSupply = await readTotalSupply(providers, toBlock);

  const payload = {
    schema: "xdcid/legacy-domain-index/v1",
    chainId: CHAIN_ID,
    contract: LEGACY_CONTRACT,
    fromBlock: DEPLOYMENT_BLOCK,
    toBlock,
    confirmations: requestedToBlock === undefined ? confirmations : null,
    sourceEvents: ["Transfer(address,address,uint256)", "NewURI(uint256,string)"],
    matchingEventCount: domainLogs.length,
    totalSupply,
    activeXdcNameCount: names.length,
    canonicalCollisionCount: canonicalCollisions.length,
    canonicalCollisions,
    names,
  };
  const snapshotSha256 = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");

  process.stdout.write(
    JSON.stringify({ ...payload, snapshotSha256 }, null, 2) + "\n",
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write("Legacy index failed: " + message + "\n");
  process.exitCode = 1;
});
