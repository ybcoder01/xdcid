import {
  neon,
  type NeonQueryFunction,
} from "@neondatabase/serverless";
import {
  decodeEventLog,
  getAddress,
  isAddress,
  parseAbi,
  zeroAddress,
  type Address,
  type Hash,
} from "viem";
import {
  activeRegistrarAddress,
  activeSubdomainRegistrarAddress,
  activeXnsChainId,
} from "../config/contracts";
import { xdcClient } from "./xdcClient";
import { domainRevenueEventId } from "./domainRevenueIdentity";

const MAINNET_V2_ACTIVATION_BLOCK = 106_877_702n;
const APOTHEM_REVENUE_FALLBACK_BLOCK = 85_500_000n;
const FINALITY_BLOCKS = 12n;
const DEFAULT_CHUNK_SIZE = 5_000n;
const DEFAULT_MAX_CHUNKS = 25;

const revenueEventsAbi = parseAbi([
  "event NameRegistered(bytes32 indexed node,address indexed nameOwner,address indexed payer,uint256 expiry,address paymentToken,uint256 paymentAmount,uint256 grossUsdMicros,uint256 netUsdMicros,uint16 discountBps,bytes32 quoteHash)",
  "event NameRenewed(bytes32 indexed node,address indexed nameOwner,address indexed payer,uint256 expiry,address paymentToken,uint256 paymentAmount,uint256 grossUsdMicros,uint256 netUsdMicros,uint16 discountBps,bytes32 quoteHash)",
  "event SubdomainRegistered(bytes32 indexed node,bytes32 indexed parentNode,address indexed subdomainOwner,address payer,uint256 expiry,address paymentToken,uint256 paymentAmount,uint256 usdMicros,bytes32 quoteHash)",
  "event SubdomainRenewed(bytes32 indexed node,address indexed subdomainOwner,address indexed payer,uint256 expiry,address paymentToken,uint256 paymentAmount,uint256 usdMicros,bytes32 quoteHash)",
]);

export type DomainRevenueCategory =
  | "registration"
  | "renewal"
  | "subdomain-registration"
  | "subdomain-renewal"
  | "migration";

export type DomainRevenueTrendInterval = "day" | "week" | "month";

export type DomainRevenueReport = {
  generatedAt: string;
  trendDays: number;
  trendInterval: DomainRevenueTrendInterval;
  totals: {
    eventCount: number;
    netUsdMicros: string;
  };
  assets: Array<{
    symbol: "XDC" | "USDC";
    tokenAddress: string;
    decimals: number;
    eventCount: number;
    paymentAmount: string;
    netUsdMicros: string;
  }>;
  categories: Array<{
    category: DomainRevenueCategory;
    eventCount: number;
    netUsdMicros: string;
  }>;
  trend: Array<{
    period: string;
    eventCount: number;
    netUsdMicros: string;
  }>;
  recentEvents: Array<{
    eventId: string;
    category: DomainRevenueCategory;
    symbol: "XDC" | "USDC";
    decimals: number;
    paymentAmount: string;
    netUsdMicros: string;
    transactionHash: string;
    occurredAt: string;
  }>;
  index: {
    complete: boolean;
    indexedThroughBlock: string;
    finalizedBlock: string;
  };
};

type RevenueSource = {
  kind: "top-level" | "subdomain";
  address: Address;
};

type IndexedRevenueEvent = {
  eventId: string;
  chainId: number;
  contractAddress: Address;
  transactionHash: Hash;
  logIndex: number;
  blockNumber: bigint;
  category: DomainRevenueCategory;
  paymentToken: Address;
  tokenSymbol: "XDC" | "USDC";
  tokenDecimals: number;
  paymentAmount: bigint;
  grossUsdMicros: bigint;
  netUsdMicros: bigint;
  discountBps: number;
  occurredAt: Date;
};

let schemaPromise: Promise<void> | undefined;
type DomainRevenueDatabase = NeonQueryFunction<false, false>;

export async function getDomainRevenueReport(
  requestedDays = 30,
  requestedInterval: DomainRevenueTrendInterval = "day",
): Promise<DomainRevenueReport> {
  const client = await ensureDomainRevenueSchema();
  const trendDays = Math.min(365, Math.max(7, Math.trunc(requestedDays)));
  const trendInterval = normalizeTrendInterval(requestedInterval);
  const index = await syncDomainRevenueEvents(client);

  const [totalRows, assetRows, categoryRows, trendRows, recentRows] =
    await Promise.all([
      client`
        SELECT count(*)::integer AS event_count,
               COALESCE(sum(net_usd_micros), 0)::text AS net_usd_micros
        FROM domain_revenue_events
        WHERE chain_id = ${activeXnsChainId}
      `,
      client`
        SELECT token_symbol, payment_token, token_decimals,
               count(*)::integer AS event_count,
               COALESCE(sum(payment_amount), 0)::text AS payment_amount,
               COALESCE(sum(net_usd_micros), 0)::text AS net_usd_micros
        FROM domain_revenue_events
        WHERE chain_id = ${activeXnsChainId}
        GROUP BY token_symbol, payment_token, token_decimals
        ORDER BY token_symbol
      `,
      client`
        SELECT category, count(*)::integer AS event_count,
               COALESCE(sum(net_usd_micros), 0)::text AS net_usd_micros
        FROM domain_revenue_events
        WHERE chain_id = ${activeXnsChainId}
        GROUP BY category
        ORDER BY category
      `,
      client`
        SELECT to_char(
                 date_trunc(${trendInterval}, occurred_at),
                 CASE
                   WHEN ${trendInterval} = 'month' THEN 'YYYY-MM'
                   ELSE 'YYYY-MM-DD'
                 END
               ) AS period,
               count(*)::integer AS event_count,
               COALESCE(sum(net_usd_micros), 0)::text AS net_usd_micros
        FROM domain_revenue_events
        WHERE chain_id = ${activeXnsChainId}
          AND occurred_at >= now() - (${trendDays} * interval '1 day')
        GROUP BY date_trunc(${trendInterval}, occurred_at)
        ORDER BY date_trunc(${trendInterval}, occurred_at)
      `,
      client`
        SELECT event_id, category, token_symbol, token_decimals,
               payment_amount::text, net_usd_micros::text,
               transaction_hash, occurred_at
        FROM domain_revenue_events
        WHERE chain_id = ${activeXnsChainId}
        ORDER BY occurred_at DESC, log_index DESC
        LIMIT 25
      `,
    ]);

  const totals = totalRows[0];
  return {
    generatedAt: new Date().toISOString(),
    trendDays,
    trendInterval,
    totals: {
      eventCount: Number(totals?.event_count || 0),
      netUsdMicros: String(totals?.net_usd_micros || "0"),
    },
    assets: assetRows.map((row) => ({
      symbol: row.token_symbol as "XDC" | "USDC",
      tokenAddress: String(row.payment_token),
      decimals: Number(row.token_decimals),
      eventCount: Number(row.event_count),
      paymentAmount: String(row.payment_amount),
      netUsdMicros: String(row.net_usd_micros),
    })),
    categories: categoryRows.map((row) => ({
      category: row.category as DomainRevenueCategory,
      eventCount: Number(row.event_count),
      netUsdMicros: String(row.net_usd_micros),
    })),
    trend: trendRows.map((row) => ({
      period: String(row.period),
      eventCount: Number(row.event_count),
      netUsdMicros: String(row.net_usd_micros),
    })),
    recentEvents: recentRows.map((row) => ({
      eventId: String(row.event_id),
      category: row.category as DomainRevenueCategory,
      symbol: row.token_symbol as "XDC" | "USDC",
      decimals: Number(row.token_decimals),
      paymentAmount: String(row.payment_amount),
      netUsdMicros: String(row.net_usd_micros),
      transactionHash: String(row.transaction_hash),
      occurredAt: new Date(String(row.occurred_at)).toISOString(),
    })),
    index,
  };
}

async function syncDomainRevenueEvents(
  client: DomainRevenueDatabase,
): Promise<DomainRevenueReport["index"]> {
  const latestBlock = await xdcClient.getBlockNumber();
  const finalizedBlock =
    latestBlock > FINALITY_BLOCKS ? latestBlock - FINALITY_BLOCKS : latestBlock;
  const sources = revenueSources();
  const results = [];

  for (const source of sources) {
    results.push(await syncRevenueSource(client, source, finalizedBlock));
  }

  const indexedThroughBlock = results.reduce(
    (minimum, result) =>
      result.indexedThroughBlock < minimum ? result.indexedThroughBlock : minimum,
    finalizedBlock,
  );

  return {
    complete: results.every((result) => result.complete),
    indexedThroughBlock: indexedThroughBlock.toString(),
    finalizedBlock: finalizedBlock.toString(),
  };
}

async function syncRevenueSource(
  client: DomainRevenueDatabase,
  source: RevenueSource,
  finalizedBlock: bigint,
) {
  const cursorRows = await client`
    SELECT last_scanned_block::text
    FROM domain_revenue_index_state
    WHERE chain_id = ${activeXnsChainId}
      AND contract_address = ${source.address.toLowerCase()}
    LIMIT 1
  `;
  const startBlock = configuredStartBlock();
  let indexedThroughBlock = cursorRows[0]
    ? BigInt(String(cursorRows[0].last_scanned_block))
    : startBlock - 1n;
  let chunks = 0;

  while (indexedThroughBlock < finalizedBlock && chunks < maximumChunks()) {
    const fromBlock = indexedThroughBlock + 1n;
    const toBlock = minBigInt(
      finalizedBlock,
      fromBlock + configuredChunkSize() - 1n,
    );
    const logs = await xdcClient.getLogs({
      address: source.address,
      fromBlock,
      toBlock,
    });
    const blockDates = await timestampsForLogs(logs);

    for (const log of logs) {
      const event = decodeRevenueLog(source, log, blockDates);
      if (event) await insertRevenueEvent(client, event);
    }

    await client`
      INSERT INTO domain_revenue_index_state (
        chain_id, contract_address, last_scanned_block, updated_at
      ) VALUES (
        ${activeXnsChainId}, ${source.address.toLowerCase()},
        ${toBlock.toString()}, now()
      )
      ON CONFLICT (chain_id, contract_address) DO UPDATE SET
        last_scanned_block = GREATEST(
          domain_revenue_index_state.last_scanned_block,
          EXCLUDED.last_scanned_block
        ),
        updated_at = now()
    `;
    indexedThroughBlock = toBlock;
    chunks += 1;
  }

  return {
    complete: indexedThroughBlock >= finalizedBlock,
    indexedThroughBlock,
  };
}

async function timestampsForLogs(
  logs: Awaited<ReturnType<typeof xdcClient.getLogs>>,
) {
  const blockNumbers = Array.from(
    new Set(
      logs
        .map((log) => log.blockNumber)
        .filter((value): value is bigint => value !== null),
    ),
  );
  const entries = await Promise.all(
    blockNumbers.map(async (blockNumber) => {
      const block = await xdcClient.getBlock({ blockNumber });
      return [blockNumber.toString(), new Date(Number(block.timestamp) * 1_000)] as const;
    }),
  );
  return new Map(entries);
}

function decodeRevenueLog(
  source: RevenueSource,
  log: Awaited<ReturnType<typeof xdcClient.getLogs>>[number],
  blockDates: Map<string, Date>,
): IndexedRevenueEvent | null {
  if (
    log.blockNumber === null ||
    log.transactionHash === null ||
    log.logIndex === null
  ) {
    return null;
  }

  try {
    const decoded = decodeEventLog({
      abi: revenueEventsAbi,
      data: log.data,
      topics: log.topics,
      strict: true,
    });
    const args = decoded.args as Record<string, unknown>;
    const category = categoryForEvent(source.kind, decoded.eventName);
    if (!category) return null;
    const paymentToken = String(args.paymentToken);
    const paymentAmount = args.paymentAmount;
    const netUsdMicros = args.netUsdMicros ?? args.usdMicros;
    const grossUsdMicros = args.grossUsdMicros ?? netUsdMicros;
    if (
      !isAddress(paymentToken) ||
      typeof paymentAmount !== "bigint" ||
      typeof netUsdMicros !== "bigint" ||
      typeof grossUsdMicros !== "bigint"
    ) {
      return null;
    }
    const nativePayment = paymentToken.toLowerCase() === zeroAddress;
    const occurredAt = blockDates.get(log.blockNumber.toString());
    if (!occurredAt) return null;

    return {
      eventId: domainRevenueEventId({
        chainId: activeXnsChainId,
        contractAddress: source.address,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
      }),
      chainId: activeXnsChainId,
      contractAddress: source.address,
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      blockNumber: log.blockNumber,
      category,
      paymentToken: getAddress(paymentToken),
      tokenSymbol: nativePayment ? "XDC" : "USDC",
      tokenDecimals: nativePayment ? 18 : 6,
      paymentAmount,
      grossUsdMicros,
      netUsdMicros,
      discountBps:
        typeof args.discountBps === "number" ? args.discountBps : 0,
      occurredAt,
    };
  } catch {
    return null;
  }
}

function categoryForEvent(
  source: RevenueSource["kind"],
  eventName: string,
): DomainRevenueCategory | null {
  if (source === "top-level") {
    if (eventName === "NameRegistered") return "registration";
    if (eventName === "NameRenewed") return "renewal";
  } else {
    if (eventName === "SubdomainRegistered") return "subdomain-registration";
    if (eventName === "SubdomainRenewed") return "subdomain-renewal";
  }
  return null;
}

async function insertRevenueEvent(
  client: DomainRevenueDatabase,
  event: IndexedRevenueEvent,
) {
  await client`
    INSERT INTO domain_revenue_events (
      event_id, chain_id, contract_address, transaction_hash, log_index,
      block_number, category, payment_token, token_symbol, token_decimals,
      payment_amount, gross_usd_micros, net_usd_micros, discount_bps,
      occurred_at
    ) VALUES (
      ${event.eventId}, ${event.chainId},
      ${event.contractAddress.toLowerCase()},
      ${event.transactionHash.toLowerCase()}, ${event.logIndex},
      ${event.blockNumber.toString()}, ${event.category},
      ${event.paymentToken.toLowerCase()}, ${event.tokenSymbol},
      ${event.tokenDecimals}, ${event.paymentAmount.toString()},
      ${event.grossUsdMicros.toString()}, ${event.netUsdMicros.toString()},
      ${event.discountBps}, ${event.occurredAt.toISOString()}
    )
    ON CONFLICT (event_id) DO NOTHING
  `;
}

async function ensureDomainRevenueSchema() {
  if (!schemaPromise) {
    schemaPromise = createDomainRevenueSchema().catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  await schemaPromise;
  return neon(databaseUrl());
}

async function createDomainRevenueSchema() {
  const client = neon(databaseUrl());
  await client`
    CREATE TABLE IF NOT EXISTS domain_revenue_events (
      event_id varchar(160) PRIMARY KEY,
      chain_id integer NOT NULL,
      contract_address varchar(42) NOT NULL,
      transaction_hash varchar(66) NOT NULL,
      log_index integer NOT NULL,
      block_number bigint NOT NULL,
      category varchar(32) NOT NULL,
      payment_token varchar(42) NOT NULL,
      token_symbol varchar(8) NOT NULL,
      token_decimals integer NOT NULL,
      payment_amount numeric(78, 0) NOT NULL,
      gross_usd_micros numeric(78, 0) NOT NULL,
      net_usd_micros numeric(78, 0) NOT NULL,
      discount_bps integer NOT NULL DEFAULT 0,
      occurred_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (chain_id, contract_address, transaction_hash, log_index)
    )
  `;
  await client`
    CREATE INDEX IF NOT EXISTS domain_revenue_events_time_idx
    ON domain_revenue_events (chain_id, occurred_at DESC)
  `;
  await client`
    CREATE INDEX IF NOT EXISTS domain_revenue_events_category_idx
    ON domain_revenue_events (chain_id, category)
  `;
  await client`
    CREATE TABLE IF NOT EXISTS domain_revenue_index_state (
      chain_id integer NOT NULL,
      contract_address varchar(42) NOT NULL,
      last_scanned_block bigint NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (chain_id, contract_address)
    )
  `;
}

function revenueSources(): RevenueSource[] {
  const candidates: RevenueSource[] = [
    { kind: "top-level", address: getAddress(activeRegistrarAddress) },
  ];
  if (activeSubdomainRegistrarAddress !== zeroAddress) {
    candidates.push({
      kind: "subdomain",
      address: getAddress(activeSubdomainRegistrarAddress),
    });
  }
  const seen = new Set<string>();
  return candidates.filter((source) => {
    const key = source.address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function configuredStartBlock() {
  const configured = process.env.XDCID_DOMAIN_REVENUE_START_BLOCK?.trim();
  if (configured && /^\d+$/.test(configured)) return BigInt(configured);
  return activeXnsChainId === 50
    ? MAINNET_V2_ACTIVATION_BLOCK
    : APOTHEM_REVENUE_FALLBACK_BLOCK;
}

function configuredChunkSize() {
  const configured = Number(process.env.XDCID_DOMAIN_REVENUE_CHUNK_SIZE);
  return Number.isSafeInteger(configured) && configured >= 100 && configured <= 10_000
    ? BigInt(configured)
    : DEFAULT_CHUNK_SIZE;
}

function maximumChunks() {
  const configured = Number(process.env.XDCID_DOMAIN_REVENUE_MAX_CHUNKS);
  return Number.isSafeInteger(configured) && configured >= 1 && configured <= 100
    ? configured
    : DEFAULT_MAX_CHUNKS;
}

function normalizeTrendInterval(
  value: string,
): DomainRevenueTrendInterval {
  return value === "week" || value === "month" ? value : "day";
}

function minBigInt(left: bigint, right: bigint) {
  return left < right ? left : right;
}

function databaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("Domain revenue storage is not configured");
  return value;
}
