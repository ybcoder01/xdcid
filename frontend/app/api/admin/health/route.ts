import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
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

  return Response.json(
    {
      checkedAt: new Date().toISOString(),
      database: {
        configured: databaseConfigured,
        healthy: databaseHealthy,
        latencyMs: databaseConfigured ? Date.now() - startedAt : null,
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
