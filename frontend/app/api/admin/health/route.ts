import { neon } from "@neondatabase/serverless";
import { isHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { requireAdminSession } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAdminSession(request);
  if (!session) {
    return Response.json(
      { error: "Admin authentication required" },
      {
        status: 401,
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "x-robots-tag": "noindex, nofollow, noarchive",
        },
      },
    );
  }

  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const startedAt = Date.now();
  let databaseHealthy = false;

  if (databaseConfigured) {
    try {
      const client = neon(process.env.DATABASE_URL as string);
      await client`SELECT 1 AS healthy`;
      databaseHealthy = true;
    } catch {
      databaseHealthy = false;
    }
  }

  const configuredQuoteSignerKey =
    process.env.XNS_QUOTE_SIGNER_PRIVATE_KEY?.trim();
  const normalizedQuoteSignerKey =
    configuredQuoteSignerKey && /^[0-9a-fA-F]{64}$/.test(configuredQuoteSignerKey)
      ? `0x${configuredQuoteSignerKey}`
      : configuredQuoteSignerKey;
  const quoteSignerAddress =
    normalizedQuoteSignerKey &&
    isHex(normalizedQuoteSignerKey) &&
    normalizedQuoteSignerKey.length === 66
      ? privateKeyToAccount(normalizedQuoteSignerKey as Hex).address
      : null;

  return Response.json(
    {
      checkedAt: new Date().toISOString(),
      database: {
        configured: databaseConfigured,
        healthy: databaseHealthy,
        latencyMs: databaseConfigured ? Date.now() - startedAt : null,
      },
      quoteSigner: {
        configured: quoteSignerAddress !== null,
        address: quoteSignerAddress,
      },
    },
    {
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-robots-tag": "noindex, nofollow, noarchive",
      },
    },
  );
}
