import {
  decodeFunctionData,
  getAddress,
  isAddress,
  keccak256,
  parseAbi,
  stringToHex,
  type Hex,
} from "viem";
import {
  activeSubdomainRegistrarAddress,
  activeXnsChainId,
  isTestnetEnvironment,
} from "../config/contracts";
import { ApiInputError, ApiServiceError } from "./apiResponse";
import { parseXnsName } from "./names";
import { withShortCache } from "./shortCache";
import { xdcClient } from "./xdcClient";

const MAINNET_START_BLOCK = 107_000_000n;
const APOTHEM_START_BLOCK = 86_900_000n;
// Public XDC RPC providers cap eth_getLogs ranges at 30,000 blocks. Staying
// below that limit keeps the index portable across the configured fallbacks.
const LOG_BLOCK_RANGE = 25_000n;
const READ_BATCH_SIZE = 20;
const MAX_KNOWN_SUBDOMAINS = 50;
const CATALOG_TTL_MS = 60_000;

const registrationAbi = parseAbi([
  "function registerWithQuote(string parentName,string label,(bytes32 node,bytes32 parentNode,address payer,address subdomainOwner,uint256 termYears,address paymentToken,uint256 paymentAmount,uint256 usdMicros,uint256 policyVersion,uint256 nonce,uint256 issuedAt,uint256 deadline) quote,bytes quoteSignature)",
]);
const registeredEvent = parseAbi([
  "event SubdomainRegistered(bytes32 indexed node,bytes32 indexed parentNode,address indexed subdomainOwner,address payer,uint256 expiry,address paymentToken,uint256 paymentAmount,uint256 usdMicros,bytes32 quoteHash)",
]);
const recordsAbi = parseAbi([
  "function ownerOf(bytes32 node) view returns (address)",
  "function records(bytes32 node) view returns (address owner,bytes32 parentNode,uint256 expiry)",
]);

export type OwnedSubdomain = {
  name: string;
  parentName: string;
  label: string;
  node: Hex;
  expiry: { timestamp: string; iso: string };
};

let catalog: string[] | null = null;
let catalogExpiresAt = 0;
let catalogRequest: Promise<string[]> | null = null;

function validKnownSubdomains(values: string[]) {
  const names = new Set<string>();
  values.slice(0, MAX_KNOWN_SUBDOMAINS).forEach((value) => {
    const labels = value.trim().toLowerCase().split(".");
    if (labels.length < 3) return;
    const parent = parseXnsName(labels.slice(1).join("."));
    const label = labels[0];
    if (
      parent.isValid &&
      /^[a-z0-9-]+$/.test(label) &&
      !label.startsWith("-") &&
      !label.endsWith("-")
    ) {
      names.add(`${label}.${parent.name}`);
    }
  });
  return Array.from(names);
}

function registeredName(input: Hex): string | null {
  try {
    const decoded = decodeFunctionData({ abi: registrationAbi, data: input });
    if (decoded.functionName !== "registerWithQuote") return null;
    const parent = parseXnsName(decoded.args[0]);
    const label = decoded.args[1].trim().toLowerCase();
    if (!parent.isValid || !/^[a-z0-9-]+$/.test(label)) return null;
    return `${label}.${parent.name}`;
  } catch {
    return null;
  }
}

async function loadCatalog() {
  if (catalog && Date.now() < catalogExpiresAt) return catalog;
  if (catalogRequest) return catalogRequest;

  catalogRequest = (async () => {
    try {
      const latestBlock = await xdcClient.getBlockNumber();
      const startBlock = isTestnetEnvironment
        ? APOTHEM_START_BLOCK
        : MAINNET_START_BLOCK;
      const transactionHashes = new Set<Hex>();

      for (
        let fromBlock = startBlock;
        fromBlock <= latestBlock;
        fromBlock += LOG_BLOCK_RANGE
      ) {
        const toBlock =
          fromBlock + LOG_BLOCK_RANGE - 1n > latestBlock
            ? latestBlock
            : fromBlock + LOG_BLOCK_RANGE - 1n;
        const logs = await xdcClient.getLogs({
          address: getAddress(activeSubdomainRegistrarAddress),
          event: registeredEvent[0],
          fromBlock,
          toBlock,
        });
        logs.forEach((log) => {
          if (log.transactionHash) transactionHashes.add(log.transactionHash);
        });
      }

      const names = new Set<string>();
      const hashes = Array.from(transactionHashes);
      for (let start = 0; start < hashes.length; start += READ_BATCH_SIZE) {
        const transactions = await Promise.all(
          hashes.slice(start, start + READ_BATCH_SIZE).map((hash) =>
            xdcClient.getTransaction({ hash }),
          ),
        );
        transactions.forEach((transaction) => {
          const name = registeredName(transaction.input);
          if (name) names.add(name);
        });
      }

      catalog = Array.from(names).sort();
      catalogExpiresAt = Date.now() + CATALOG_TTL_MS;
      return catalog;
    } catch (error) {
      console.error("Unable to build the XDCID subdomain catalog", error);
      throw new ApiServiceError(
        "XDC_INDEX_UNAVAILABLE",
        "Unable to read the XDCID subdomain index",
      );
    } finally {
      catalogRequest = null;
    }
  })();

  return catalogRequest;
}

export async function getOwnedSubdomainsData(
  input: string,
  knownSubdomains: string[] = [],
) {
  if (!isAddress(input)) {
    throw new ApiInputError(
      "INVALID_ADDRESS",
      "address must be a valid EVM address",
    );
  }

  const address = getAddress(input);
  const known = validKnownSubdomains(knownSubdomains);
  const cacheSuffix = known.slice().sort().join(",");

  return withShortCache(
    `owned-subdomains:${activeXnsChainId}:${address.toLowerCase()}:${cacheSuffix}`,
    async () => {
      let indexedNames: string[] = [];
      try {
        indexedNames = await loadCatalog();
      } catch (error) {
        if (known.length === 0) throw error;
      }

      const candidates = Array.from(new Set([...indexedNames, ...known]));
      const owned: OwnedSubdomain[] = [];
      const now = BigInt(Math.floor(Date.now() / 1_000));

      for (let start = 0; start < candidates.length; start += READ_BATCH_SIZE) {
        const batch = candidates.slice(start, start + READ_BATCH_SIZE);
        const records = await Promise.all(
          batch.map(async (name) => {
            const node = keccak256(stringToHex(name));
            const [owner, record] = await Promise.all([
              xdcClient.readContract({
                address: getAddress(activeSubdomainRegistrarAddress),
                abi: recordsAbi,
                functionName: "ownerOf",
                args: [node],
              }),
              xdcClient.readContract({
                address: getAddress(activeSubdomainRegistrarAddress),
                abi: recordsAbi,
                functionName: "records",
                args: [node],
              }),
            ]);
            return { name, node, owner, expiry: record[2] };
          }),
        );

        records.forEach(({ name, node, owner, expiry }) => {
          if (owner.toLowerCase() !== address.toLowerCase() || expiry <= now) {
            return;
          }
          const labels = name.split(".");
          owned.push({
            name,
            label: labels[0],
            parentName: labels.slice(1).join("."),
            node,
            expiry: {
              timestamp: expiry.toString(),
              iso: new Date(Number(expiry) * 1_000).toISOString(),
            },
          });
        });
      }

      return {
        address,
        network: {
          chainId: activeXnsChainId,
          name: isTestnetEnvironment ? "XDC Apothem" : "XDC Network",
        },
        subdomains: owned.sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      };
    },
  );
}
