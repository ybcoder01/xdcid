import { requireAdminSession } from "../../../../../lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAdminSession(request);
  if (!session) {
    return Response.json(
      { authenticated: false },
      {
        status: 401,
        headers: { "cache-control": "no-store" },
      },
    );
  }

  return Response.json(
    {
      authenticated: true,
      address: session.address,
      expiresAt: new Date(session.expiresAt * 1_000).toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
