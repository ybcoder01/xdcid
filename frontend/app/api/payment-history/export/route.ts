import { isHex } from "viem";
import {
  isPaymentHistoryConfigured,
  readAuthorizedPaymentHistory,
  type PaymentHistoryFilters
} from "../../../../lib/paymentHistory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHAINS: Record<number, { name: string; explorer: string }> = {
  1: { name: "Ethereum", explorer: "https://etherscan.io/tx/" },
  50: { name: "XDC Network", explorer: "https://xdcscan.com/tx/" },
  51: { name: "XDC Apothem", explorer: "https://testnet.xdcscan.com/tx/" },
  137: { name: "Polygon", explorer: "https://polygonscan.com/tx/" },
  8453: { name: "Base", explorer: "https://basescan.org/tx/" },
  42161: { name: "Arbitrum One", explorer: "https://arbiscan.io/tx/" },
  11155111: { name: "Ethereum Sepolia", explorer: "https://sepolia.etherscan.io/tx/" },
  80002: { name: "Polygon Amoy", explorer: "https://amoy.polygonscan.com/tx/" },
  84532: { name: "Base Sepolia", explorer: "https://sepolia.basescan.org/tx/" },
  421614: { name: "Arbitrum Sepolia", explorer: "https://sepolia.arbiscan.io/tx/" }
};

type ExportRequest = {
  challengeId?: unknown;
  signature?: unknown;
  timeZone?: unknown;
  filters?: {
    from?: unknown;
    to?: unknown;
    token?: unknown;
    sourceChainId?: unknown;
    destinationChainId?: unknown;
    name?: unknown;
    counterparty?: unknown;
  };
};

export async function POST(request: Request) {
  if (!isPaymentHistoryConfigured()) {
    return json({ error: "Private payment history is unavailable" }, 503);
  }

  try {
    const body = await request.json() as ExportRequest;
    if (
      typeof body.challengeId !== "string" ||
      typeof body.signature !== "string" ||
      !isHex(body.signature)
    ) {
      return json({ error: "A valid signed challenge is required" }, 400);
    }

    const timeZone = validTimeZone(body.timeZone) ? body.timeZone : "UTC";
    const filters = parseFilters(body.filters);
    const records = await readAuthorizedPaymentHistory(
      body.challengeId,
      body.signature,
      { ...filters, limit: null }
    );
    if (!records) return json({ error: "Payment history access was denied" }, 403);

    const header = [
      "Completed UTC",
      "Completed local time",
      "Local timezone",
      "Payment ID",
      "Type",
      "Status",
      "XNS ID",
      "Sender",
      "Receiver",
      "Source network",
      "Destination network",
      "Asset",
      "Amount atomic",
      "Token decimals",
      "Amount",
      "Reference",
      "Description",
      "Source transaction hash",
      "Source explorer URL",
      "Destination transaction hash",
      "Destination explorer URL"
    ];

    const rows = records.map((record) => {
      const source = CHAINS[record.sourceChainId];
      const destination = CHAINS[record.destinationChainId];
      return [
        new Date(record.completedAt).toISOString(),
        formatLocal(new Date(record.completedAt), timeZone),
        timeZone,
        record.id,
        record.sourceChainId === record.destinationChainId ? "same-chain" : "cross-chain",
        "completed",
        record.name || "",
        record.payer,
        record.creator,
        source?.name || "Chain " + record.sourceChainId,
        destination?.name || "Chain " + record.destinationChainId,
        record.token,
        record.amountAtomic,
        String(record.tokenDecimals),
        formatAtomic(record.amountAtomic, record.tokenDecimals),
        record.privateContext?.reference || "",
        record.privateContext?.description || "",
        record.sourceTransactionHash,
        (source?.explorer || "") + record.sourceTransactionHash,
        record.destinationTransactionHash || "",
        record.destinationTransactionHash
          ? (destination?.explorer || "") + record.destinationTransactionHash
          : ""
      ];
    });

    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    return new Response("\uFEFF" + csv, {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-disposition": 'attachment; filename="xdcid-payment-history.csv"',
        "content-type": "text/csv; charset=utf-8",
        "x-content-type-options": "nosniff",
        "x-robots-tag": "noindex, nofollow, noarchive"
      }
    });
  } catch {
    return json({ error: "Payment history export could not be generated" }, 400);
  }
}

function parseFilters(value: ExportRequest["filters"]): PaymentHistoryFilters {
  const filters: PaymentHistoryFilters = {};
  if (!value) return filters;
  if (typeof value.from === "string" && value.from) {
    const from = new Date(value.from);
    if (!Number.isNaN(from.valueOf())) filters.from = from;
  }
  if (typeof value.to === "string" && value.to) {
    const to = new Date(value.to);
    if (!Number.isNaN(to.valueOf())) filters.to = to;
  }
  if (filters.from && filters.to && filters.from > filters.to) {
    throw new Error("Invalid date range");
  }
  if (typeof value.token === "string" && /^[A-Za-z0-9]{1,32}$/.test(value.token)) {
    filters.token = value.token;
  }
  if (Number.isInteger(value.sourceChainId) && Number(value.sourceChainId) > 0) {
    filters.sourceChainId = Number(value.sourceChainId);
  }
  if (Number.isInteger(value.destinationChainId) && Number(value.destinationChainId) > 0) {
    filters.destinationChainId = Number(value.destinationChainId);
  }
  if (typeof value.name === "string" && value.name.trim()) {
    filters.name = value.name.trim().toLowerCase();
  }
  if (typeof value.counterparty === "string" && value.counterparty.trim()) {
    filters.counterparty = value.counterparty.trim();
  }
  return filters;
}

function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function formatLocal(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short"
  }).format(value);
}

function formatAtomic(value: string, decimals: number): string {
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const fraction = decimals ? padded.slice(-decimals).replace(/0+$/, "") : "";
  return (negative ? "-" : "") + whole + (fraction ? "." + fraction : "");
}

function csvCell(value: string): string {
  let safe = value;
  if (/^[=+\-@]/.test(safe)) safe = "'" + safe;
  return '"' + safe.replace(/"/g, '""') + '"';
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow, noarchive"
    }
  });
}
