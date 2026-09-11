import { isSameOrigin } from "../../../lib/adminSecurity";
import {
  normalizeExchangeAddressBookInput,
  type ExchangeAddressBookInput,
} from "../../../lib/exchangeAddressBook";
import { requirePrivateVaultSession } from "../../../lib/privateVaultAuth";
import {
  createExchangeAddressBookEntry,
  listExchangeAddressBookEntries,
} from "../../../lib/privateVaultStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = requirePrivateVaultSession(request);
  if (!session) return json({ error: "Unlock the private address book first" }, 401);
  try {
    return json({ entries: await listExchangeAddressBookEntries(session.address) });
  } catch {
    return json({ error: "Private address book is temporarily unavailable" }, 503);
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "Invalid request origin" }, 403);
  const session = requirePrivateVaultSession(request);
  if (!session) return json({ error: "Unlock the private address book first" }, 401);
  let input: ExchangeAddressBookInput;
  try {
    input = normalizeExchangeAddressBookInput(await request.json());
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : "Invalid address-book entry" }, 400);
  }
  try {
    const entry = await createExchangeAddressBookEntry(session.address, input);
    return json({ entry }, 201);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Address-book entry could not be saved";
    return json(
      { error: message === "Address book limit reached" ? message : "Address-book entry could not be saved" },
      message === "Address book limit reached" ? 409 : 503,
    );
  }
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow, noarchive", "x-content-type-options": "nosniff" },
  });
}
