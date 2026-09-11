import { isSameOrigin } from "../../../../lib/adminSecurity";
import {
  normalizeExchangeAddressBookInput,
  type ExchangeAddressBookInput,
} from "../../../../lib/exchangeAddressBook";
import { requirePrivateVaultSession } from "../../../../lib/privateVaultAuth";
import {
  deleteExchangeAddressBookEntry,
  updateExchangeAddressBookEntry,
} from "../../../../lib/privateVaultStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return json({ error: "Invalid request origin" }, 403);
  const session = requirePrivateVaultSession(request);
  if (!session) return json({ error: "Unlock the private address book first" }, 401);
  const { id } = await context.params;
  if (!/^[a-f0-9]{40}$/.test(id)) return json({ error: "Invalid address-book entry" }, 400);
  let input: ExchangeAddressBookInput;
  try {
    input = normalizeExchangeAddressBookInput(await request.json());
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : "Invalid address-book entry" }, 400);
  }
  try {
    const entry = await updateExchangeAddressBookEntry(session.address, id, input);
    return entry ? json({ entry }) : json({ error: "Address-book entry was not found" }, 404);
  } catch {
    return json({ error: "Address-book entry could not be updated" }, 503);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return json({ error: "Invalid request origin" }, 403);
  const session = requirePrivateVaultSession(request);
  if (!session) return json({ error: "Unlock the private address book first" }, 401);
  const { id } = await context.params;
  if (!/^[a-f0-9]{40}$/.test(id)) return json({ error: "Invalid address-book entry" }, 400);
  try {
    const deleted = await deleteExchangeAddressBookEntry(session.address, id);
    return deleted ? json({ deleted: true }) : json({ error: "Address-book entry was not found" }, 404);
  } catch {
    return json({ error: "Address-book entry could not be deleted" }, 503);
  }
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow, noarchive", "x-content-type-options": "nosniff" },
  });
}
