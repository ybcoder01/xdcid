import {
  createPublicClient,
  decodeFunctionData,
  defineChain,
  fallback,
  getAddress,
  http,
  isAddress,
  keccak256,
  stringToHex,
  type Address,
  type Hex
} from "viem";
import {
  addresses,
  apothemRegistration,
  registryAbi,
  reverseResolverAbi,
  xdcMainnet
} from "../config/contracts";
import { ApiInputError, ApiServiceError } from "./apiResponse";
import { parseXnsName } from "./names";
import { withShortCache } from "./shortCache";
import { xdcClient } from "./xdcClient";

// The registry is intentionally non-enumerable, so owned-name discovery must
// inspect every registrar that has ever been allowed to create names. Keep
// these addresses even after changing the active registrar; removing one
// makes names registered through it disappear from the dashboard catalog.
const MAINNET_REGISTRAR_HISTORY = [
  "0x31c41237A551FCadf22F8B231D8accA2c16f669b",
  "0x6955Be33d0B414784F9d3a6E71BAc1bb9B376cD7",
  "0xa1584cb17523CEb991155328EdFAD2293b66bd94",
  "0xdEaf1742614908a8d170f4c9520c3cd1e967ef36"
] as const;
const APOTHEM_REGISTRY = "0x2BeD8EB404e1BD8D690e3dD2Fd06F287e5A92Eb1";
const DEFAULT_XDCSCAN_API_URL = "https://api.etherscan.io/v2/api";
const PAGE_SIZE = 1000;
const MAX_PAGES = 10;
const CATALOG_TTL_MS = 60_000;
const READ_BATCH_SIZE = 20;
const MAX_KNOWN_NAMES = 50;
const EXPLORER_RETRY_DELAYS_MS = [250, 750] as const;

const apothem = defineChain({
  id: 51,
  name: "XDC Apothem",
  nativeCurrency: { name: "Test XDC", symbol: "TXDC", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.apothem.network", "https://erpc.apothem.network"]
    }
  }
});

const apothemClient = createPublicClient({
  chain: apothem,
  transport: fallback(
    apothem.rpcUrls.default.http.map((url) => http(url, { timeout: 8_000 }))
  )
});

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
  },
  {
    type: "function",
    name: "registerWithQuote",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      {
        name: "quote",
        type: "tuple",
        components: [
          { name: "node", type: "bytes32" },
          { name: "payer", type: "address" },
          { name: "nameOwner", type: "address" },
          { name: "product", type: "uint8" },
          { name: "termYears", type: "uint256" },
          { name: "paymentToken", type: "address" },
          { name: "paymentAmount", type: "uint256" },
          { name: "usdMicros", type: "uint256" },
          { name: "policyVersion", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "issuedAt", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      },
      { name: "signature", type: "bytes" }
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

function useApothemIndex() {
  return (
    process.env.XNS_QUOTE_CHAIN_ID?.trim() === "51" ||
    process.env.NEXT_PUBLIC_PAYMENT_NETWORK_ENV?.trim().toLowerCase() === "testnet"
  );
}

function registrarHistory(): Address[] {
  if (useApothemIndex()) return [getAddress(apothemRegistration.registrar)];

  const configured = (process.env.XDCID_REGISTRAR_HISTORY || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const unique = new Set(
    [...MAINNET_REGISTRAR_HISTORY, addresses.registrar, ...configured].map(
      (value) => getAddress(value).toLowerCase()
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
      chainid: String(xdcMainnet.id),
      module: "account",
      action: "txlist",
      address: registrar,
      startblock: "0",
      endblock: "999999999",
      page: String(page),
      offset: String(PAGE_SIZE),
      sort: "asc",
      apikey: apiKey
    }).toString();

    let body: ExplorerResponse | null = null;
    let lastError: unknown;
    for (
      let attempt = 0;
      attempt <= EXPLORER_RETRY_DELAYS_MS.length;
      attempt += 1
    ) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(8_000),
          headers: { Accept: "application/json" }
        });
        if (!response.ok) {
          throw new Error(
            "XDCScan request failed with status " + response.status
          );
        }

        const candidate = (await response.json()) as ExplorerResponse;
        if (
          Array.isArray(candidate.result) ||
          candidate.message === "No transactions found"
        ) {
          body = candidate;
          break;
        }
        lastError = new Error("XDCScan returned an invalid transaction list");
      } catch (error) {
        lastError = error;
      }

      const retryDelay = EXPLORER_RETRY_DELAYS_MS[attempt];
      if (retryDelay !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }

    if (!body) {
      throw lastError ?? new Error("XDCScan returned an invalid response");
    }
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
    if (
      decoded.functionName !== "register" &&
      decoded.functionName !== "registerWithQuote"
    ) {
      return null;
    }

    const parsed = parseXnsName(decoded.args[0]);
    return parsed.isValid ? parsed.name : null;
  } catch {
    return null;
  }
}

async function loadCatalog() {
  if (useApothemIndex()) return [];
  if (catalog && Date.now() < catalogExpiresAt) return catalog;
  if (catalogRequest) return catalogRequest;

  catalogRequest = (async () => {
    try {
      const registrars = registrarHistory();
      // XDCScan applies a shared request budget. Querying every historical
      // registrar concurrently causes otherwise valid requests to be rejected
      // as a burst, so keep this deliberately sequential.
      const transactionSets: PromiseSettledResult<ExplorerTransaction[]>[] = [];
      for (const registrar of registrars) {
        try {
          transactionSets.push({
            status: "fulfilled",
            value: await fetchRegistrarTransactions(registrar)
          });
        } catch (reason) {
          transactionSets.push({ status: "rejected", reason });
        }
      }
      const names = new Set<string>();
      let successfulLookups = 0;
      let firstFailure: unknown;

      transactionSets.forEach((result, index) => {
        if (result.status === "rejected") {
          firstFailure ??= result.reason;
          console.warn(
            "Unable to read historical registrations for registrar",
            registrars[index],
            result.reason
          );
          return;
        }

        successfulLookups += 1;
        result.value.forEach((transaction) => {
          const name = registeredName(transaction, registrars[index]);
          if (name) names.add(name);
        });
      });

      if (successfulLookups === 0) {
        throw firstFailure ?? new Error("No registrar history was available");
      }

      // A temporary explorer failure for one historical registrar must not
      // erase names that this warm instance discovered successfully earlier.
      // Every candidate is still verified against the registry below.
      if (successfulLookups < registrars.length && catalog) {
        catalog.forEach((name) => names.add(name));
      }

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

function validKnownNames(values: string[]) {
  const names = new Set<string>();
  values.slice(0, MAX_KNOWN_NAMES).forEach((value) => {
    const parsed = parseXnsName(value);
    if (parsed.isValid) names.add(parsed.name);
  });
  return Array.from(names);
}

export async function getOwnedNamesData(
  input: string,
  knownNames: string[] = []
) {
  if (!isAddress(input)) {
    throw new ApiInputError(
      "INVALID_ADDRESS",
      "address must be a valid EVM address"
    );
  }

  const address = getAddress(input);
  const isApothem = useApothemIndex();
  const activeClient = isApothem ? apothemClient : xdcClient;
  const registryAddress = getAddress(
    isApothem ? APOTHEM_REGISTRY : addresses.registry
  );
  const known = validKnownNames(knownNames);
  const cacheSuffix = known.slice().sort().join(",");

  return withShortCache(
    "owned-names:" +
      (isApothem ? "51:" : "50:") +
      address.toLowerCase() +
    ":" +
      cacheSuffix,
    async () => {
      let indexedNames: string[] = [];
      try {
        indexedNames = await loadCatalog();
      } catch (error) {
        // Browser-known names are only candidates and are verified against the
        // registry below, so they remain safe to use while the explorer index
        // is temporarily unavailable.
        if (known.length === 0) throw error;
      }
      const candidates = Array.from(new Set([...indexedNames, ...known]));
      const owned: Array<Omit<OwnedName, "primary">> = [];
      const now = BigInt(Math.floor(Date.now() / 1000));

      for (let start = 0; start < candidates.length; start += READ_BATCH_SIZE) {
        const batch = candidates.slice(start, start + READ_BATCH_SIZE);
        const records = await Promise.all(
          batch.map(async (name) => {
            const node = keccak256(stringToHex(name));
            const [owner, expiry] = await Promise.all([
              activeClient.readContract({
                address: registryAddress,
                abi: registryAbi,
                functionName: "ownerOf",
                args: [node]
              }),
              activeClient.readContract({
                address: registryAddress,
                abi: registryAbi,
                functionName: "expiryOf",
                args: [node]
              })
            ]);
            return { name, node, owner, expiry };
          })
        );

        records.forEach(({ name, node, owner, expiry }) => {
          if (owner.toLowerCase() === address.toLowerCase() && expiry > now) {
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

      let primaryName: string | null = null;
      if (!isApothem) {
        const storedPrimary = await xdcClient.readContract({
          address: addresses.reverseResolver,
          abi: reverseResolverAbi,
          functionName: "primaryNames",
          args: [address]
        });
        const parsedPrimary = parseXnsName(storedPrimary);
        primaryName =
          parsedPrimary.isValid &&
          owned.some((record) => record.name === parsedPrimary.name)
            ? parsedPrimary.name
            : null;
      }

      return {
        address,
        network: isApothem
          ? { chainId: apothem.id, name: apothem.name }
          : { chainId: xdcMainnet.id, name: xdcMainnet.name },
        primaryName,
        names: owned
          .map((record) => ({
            ...record,
            primary: record.name === primaryName
          }))
          .sort((left, right) => left.name.localeCompare(right.name))
      };
    }
  );
}
