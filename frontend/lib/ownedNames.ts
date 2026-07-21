import {
  decodeFunctionData,
  getAddress,
  isAddress,
  keccak256,
  stringToHex,
  type Address,
  type Hex
} from "viem";
import {
  addresses,
  registryAbi,
  reverseResolverAbi,
  xdcMainnet
} from "../config/contracts";
import { ApiInputError, ApiServiceError } from "./apiResponse";
import { parseXnsName } from "./names";
import { withShortCache } from "./shortCache";
import { xdcClient } from "./xdcClient";

const LEGACY_REGISTRAR = "0x31c41237A551FCadf22F8B231D8accA2c16f669b";
const DEFAULT_XDCSCAN_API_URL = "https://api.xdcscan.io/api";
const PAGE_SIZE = 1000;
const MAX_PAGES = 10;
const CATALOG_TTL_MS = 60_000;
const READ_BATCH_SIZE = 20;

const registrationAbi = [
  {
    type: "function",
    name: "register",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "nameOwner", type: "address" },
      { name: "years_", type: "uint256" }
    ],
    outputs: []
  }
] as const;

type ExplorerTransaction = {
  to?: string;
  input?: string;
  isError?: string;
  txreceipt_status?: string;
};

type ExplorerResponse = {
  status?: string;
  message?: string;
  result?: ExplorerTransaction[] | string;
};

export type OwnedName = {
  name: string;
  node: Hex;
  primary: boolean;
  expiry: {
    timestamp: string;
    iso: string;
  };
};

let catalog: string[] | null = null;
let catalogExpiresAt = 0;
let catalogRequest: Promise<string[]> | null = null;

function registrarHistory(): Address[] {
  const configured = (process.env.XDCID_REGISTRAR_HISTORY || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const unique = new Set(
    [LEGACY_REGISTRAR, addresses.registrar, ...configured].map((value) =>
      getAddress(value).toLowerCase()
    )
  );

  return Array.from(unique, (value) => getAddress(value));
}

async function fetchRegistrarTransactions(registrar: Address) {
  const apiKey = process.env.XDCSCAN_API_KEY?.trim();
  if (!apiKey) {
    throw new ApiServiceError(
      "XDC_INDEX_UNAVAILABLE",
      "Owned-name lookup is not configured"
    );
  }

  const transactions: ExplorerTransaction[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(
      process.env.XDCSCAN_API_URL?.trim() || DEFAULT_XDCSCAN_API_URL
    );
    url.search = new URLSearchParams({
      module: "account",
      action: "txlist",
      address: registrar,
      startblock: "0",
      endblock: "99999999",
      page: String(page),
      offset: String(PAGE_SIZE),
      sort: "asc",
      apikey: apiKey
    }).toString();

    const response = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      throw new Error("XDCScan request failed with status " + response.status);
    }

    const body = (await response.json()) as ExplorerResponse;
    if (!Array.isArray(body.result)) {
      if (body.message === "No transactions found") break;
      throw new Error("XDCScan returned an invalid transaction list");
    }

    transactions.push(...body.result);
    if (body.result.length < PAGE_SIZE) break;
  }

  return transactions;
}

function registeredName(
  transaction: ExplorerTransaction,
  registrar: Address
): string | null {
  if (
    transaction.to?.toLowerCase() !== registrar.toLowerCase() ||
    transaction.isError === "1" ||
    transaction.txreceipt_status === "0" ||
    !transaction.input
  ) {
    return null;
  }

  try {
    const input = (
      transaction.input.startsWith("0x")
        ? transaction.input
        : "0x" + transaction.input
    ) as Hex;
    const decoded = decodeFunctionData({ abi: registrationAbi, data: input });
    if (decoded.functionName !== "register") return null;

    const parsed = parseXnsName(decoded.args[0]);
    return parsed.isValid ? parsed.name : null;
  } catch {
    return null;
  }
}

async function loadCatalog() {
  if (catalog && Date.now() < catalogExpiresAt) return catalog;
  if (catalogRequest) return catalogRequest;

  catalogRequest = (async () => {
    try {
      const registrars = registrarHistory();
      const transactionSets = await Promise.all(
        registrars.map(fetchRegistrarTransactions)
      );
      const names = new Set<string>();

      transactionSets.forEach((transactions, index) => {
        transactions.forEach((transaction) => {
          const name = registeredName(transaction, registrars[index]);
          if (name) names.add(name);
        });
      });

      catalog = Array.from(names).sort();
      catalogExpiresAt = Date.now() + CATALOG_TTL_MS;
      return catalog;
    } catch (error) {
      console.error("Unable to build the XDCID name catalog", error);
      if (error instanceof ApiServiceError) throw error;
      throw new ApiServiceError(
        "XDC_INDEX_UNAVAILABLE",
        "Unable to read the XDCID name index"
      );
    } finally {
      catalogRequest = null;
    }
  })();

  return catalogRequest;
}

export async function getOwnedNamesData(input: string) {
  if (!isAddress(input)) {
    throw new ApiInputError(
      "INVALID_ADDRESS",
      "address must be a valid EVM address"
    );
  }

  const address = getAddress(input);
  return withShortCache("owned-names:" + address.toLowerCase(), async () => {
    const candidates = await loadCatalog();
    const owned: Array<Omit<OwnedName, "primary">> = [];
    const now = BigInt(Math.floor(Date.now() / 1000));

    for (let start = 0; start < candidates.length; start += READ_BATCH_SIZE) {
      const batch = candidates.slice(start, start + READ_BATCH_SIZE);
      const records = await Promise.all(
        batch.map(async (name) => {
          const node = keccak256(stringToHex(name));
          const [owner, expiry] = await Promise.all([
            xdcClient.readContract({
              address: addresses.registry,
              abi: registryAbi,
              functionName: "ownerOf",
              args: [node]
            }),
            xdcClient.readContract({
              address: addresses.registry,
              abi: registryAbi,
              functionName: "expiryOf",
              args: [node]
            })
          ]);
          return { name, node, owner, expiry };
        })
      );

      records.forEach(({ name, node, owner, expiry }) => {
        if (
          owner.toLowerCase() === address.toLowerCase() &&
          expiry > now
        ) {
          owned.push({
            name,
            node,
            expiry: {
              timestamp: expiry.toString(),
              iso: new Date(Number(expiry) * 1000).toISOString()
            }
          });
        }
      });
    }

    const storedPrimary = await xdcClient.readContract({
      address: addresses.reverseResolver,
      abi: reverseResolverAbi,
      functionName: "primaryNames",
      args: [address]
    });
    const parsedPrimary = parseXnsName(storedPrimary);
    const primaryName =
      parsedPrimary.isValid &&
      owned.some((record) => record.name === parsedPrimary.name)
        ? parsedPrimary.name
        : null;

    return {
      address,
      network: { chainId: xdcMainnet.id, name: xdcMainnet.name },
      primaryName,
      names: owned
        .map((record) => ({
          ...record,
          primary: record.name === primaryName
        }))
        .sort((left, right) => left.name.localeCompare(right.name))
    };
  });
}
