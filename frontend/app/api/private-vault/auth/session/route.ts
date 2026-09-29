import { requirePrivateVaultSession } from "../../../../../lib/privateVaultAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = requirePrivateVaultSession(request);
  return Response.json(
    session
      ? { authenticated: true, address: session.address, expiresAt: new Date(session.expiresAt * 1_000).toISOString() }
      : { authenticated: false },
    { status: session ? 200 : 401, headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow, noarchive" } },
  );
}
