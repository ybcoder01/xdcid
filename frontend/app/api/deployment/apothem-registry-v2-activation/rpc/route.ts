import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_METHODS = new Set([
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getTransactionReceipt",
]);

type RpcRequest = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };

export async function POST(request: Request) {
  if (
    (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") ||
    process.env.ENABLE_APOTHEM_REGISTRY_V2_DEPLOYMENT !== "true"
  ) {
    return new NextResponse(null, { status: 404 });
  }

  let body: RpcRequest | RpcRequest[];
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON-RPC request" }, { status: 400 });
  }

  const calls = Array.isArray(body) ? body : [body];
  if (
    calls.length === 0 ||
    calls.length > 30 ||
    calls.some((call) => typeof call.method !== "string" || !ALLOWED_METHODS.has(call.method))
  ) {
    return NextResponse.json({ error: "JSON-RPC method is not allowed" }, { status: 400 });
  }

  const response = await fetch("https://rpc.apothem.network", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
