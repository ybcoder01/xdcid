import {
  clearAdminSessionCookie,
} from "../../../../../lib/adminAuth";
import { isSameOrigin } from "../../../../../lib/adminSecurity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }

  return Response.json(
    { authenticated: false },
    {
      headers: {
        "cache-control": "no-store",
        "set-cookie": clearAdminSessionCookie(),
      },
    },
  );
}
