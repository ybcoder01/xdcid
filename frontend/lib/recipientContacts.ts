export type RecipientAsset = "USDC" | "NATIVE";

export type RecipientContact = {
  version: 1;
  name: string;
  label: string;
  lastResolvedAddress: string;
  lastUsedAt: string;
  transactionCount: number;
  favorite: boolean;
  lastSourceChainId: number;
  lastDestinationChainId: number;
  lastAsset: RecipientAsset;
  lastTransactionHash: string;
};

export type RecipientContactInput = {
  name: string;
  resolvedAddress: string;
  sourceChainId: number;
  destinationChainId: number;
  asset: RecipientAsset;
  transactionHash: string;
};

const STORAGE_PREFIX = "xdcid:recipient-contacts:v1:";
const UPDATED_EVENT = "xdcid:recipient-contacts-updated";
const MAX_CONTACTS = 50;

export function recipientContactsStorageKey(owner: string): string {
  return STORAGE_PREFIX + owner.trim().toLowerCase();
}

export function normalizeRecipientName(value: string): string {
  const normalized = value.trim().toLowerCase();
  const label = normalized.endsWith(".xdc")
    ? normalized.slice(0, -4)
    : normalized;

  if (
    label.length < 3 ||
    label.length > 63 ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(label)
  ) {
    return "";
  }
  return label + ".xdc";
}

export function parseRecipientContacts(raw: string | null): RecipientContact[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const contacts = parsed
      .map(normalizeStoredContact)
      .filter((contact): contact is RecipientContact => contact !== null);

    return sortContacts(
      Array.from(new Map(contacts.map((contact) => [contact.name, contact])).values())
    ).slice(0, MAX_CONTACTS);
  } catch {
    return [];
  }
}

export function upsertRecipientContact(
  contacts: RecipientContact[],
  input: RecipientContactInput,
  usedAt = new Date().toISOString()
): RecipientContact[] {
  const name = normalizeRecipientName(input.name);
  if (!name || !isAddress(input.resolvedAddress) || !isTransactionHash(input.transactionHash)) {
    return contacts;
  }

  const existing = contacts.find((contact) => contact.name === name);
  const repeatedTransaction =
    existing?.lastTransactionHash.toLowerCase() ===
    input.transactionHash.toLowerCase();

  const next: RecipientContact = {
    version: 1,
    name,
    label: existing?.label || name,
    lastResolvedAddress: input.resolvedAddress,
    lastUsedAt: usedAt,
    transactionCount: repeatedTransaction
      ? existing.transactionCount
      : (existing?.transactionCount || 0) + 1,
    favorite: existing?.favorite || false,
    lastSourceChainId: input.sourceChainId,
    lastDestinationChainId: input.destinationChainId,
    lastAsset: input.asset,
    lastTransactionHash: input.transactionHash
  };

  return sortContacts([
    next,
    ...contacts.filter((contact) => contact.name !== name)
  ]).slice(0, MAX_CONTACTS);
}

export function setRecipientContactFavorite(
  contacts: RecipientContact[],
  name: string,
  favorite: boolean
): RecipientContact[] {
  const normalized = normalizeRecipientName(name);
  return sortContacts(
    contacts.map((contact) =>
      contact.name === normalized ? { ...contact, favorite } : contact
    )
  );
}

export function renameRecipientContact(
  contacts: RecipientContact[],
  name: string,
  label: string
): RecipientContact[] {
  const normalized = normalizeRecipientName(name);
  const cleanLabel = label.trim().slice(0, 40);
  if (!cleanLabel) return contacts;

  return contacts.map((contact) =>
    contact.name === normalized ? { ...contact, label: cleanLabel } : contact
  );
}

export function removeRecipientContact(
  contacts: RecipientContact[],
  name: string
): RecipientContact[] {
  const normalized = normalizeRecipientName(name);
  return contacts.filter((contact) => contact.name !== normalized);
}

export function loadRecipientContacts(owner: string): RecipientContact[] {
  if (typeof window === "undefined" || !isAddress(owner)) return [];
  return parseRecipientContacts(
    window.localStorage.getItem(recipientContactsStorageKey(owner))
  );
}

export function saveRecipientContacts(
  owner: string,
  contacts: RecipientContact[]
): void {
  if (typeof window === "undefined" || !isAddress(owner)) return;
  window.localStorage.setItem(
    recipientContactsStorageKey(owner),
    JSON.stringify(sortContacts(contacts).slice(0, MAX_CONTACTS))
  );
  window.dispatchEvent(new CustomEvent(UPDATED_EVENT));
}

export function recordRecipientContact(
  owner: string,
  input: RecipientContactInput
): void {
  const contacts = upsertRecipientContact(loadRecipientContacts(owner), input);
  saveRecipientContacts(owner, contacts);
}

export function subscribeToRecipientContacts(
  listener: () => void
): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(UPDATED_EVENT, listener);
  return () => window.removeEventListener(UPDATED_EVENT, listener);
}

function normalizeStoredContact(value: unknown): RecipientContact | null {
  if (!isRecord(value)) return null;

  const name = normalizeRecipientName(
    typeof value.name === "string" ? value.name : ""
  );
  const address =
    typeof value.lastResolvedAddress === "string"
      ? value.lastResolvedAddress
      : "";
  const hash =
    typeof value.lastTransactionHash === "string"
      ? value.lastTransactionHash
      : "";
  const asset = value.lastAsset === "NATIVE" ? "NATIVE" : "USDC";

  if (
    !name ||
    !isAddress(address) ||
    !isTransactionHash(hash) ||
    typeof value.lastUsedAt !== "string" ||
    !Number.isFinite(Date.parse(value.lastUsedAt))
  ) {
    return null;
  }

  return {
    version: 1,
    name,
    label:
      typeof value.label === "string" && value.label.trim()
        ? value.label.trim().slice(0, 40)
        : name,
    lastResolvedAddress: address,
    lastUsedAt: value.lastUsedAt,
    transactionCount:
      typeof value.transactionCount === "number" &&
      Number.isInteger(value.transactionCount) &&
      value.transactionCount > 0
        ? value.transactionCount
        : 1,
    favorite: value.favorite === true,
    lastSourceChainId:
      typeof value.lastSourceChainId === "number"
        ? value.lastSourceChainId
        : 50,
    lastDestinationChainId:
      typeof value.lastDestinationChainId === "number"
        ? value.lastDestinationChainId
        : 50,
    lastAsset: asset,
    lastTransactionHash: hash
  };
}

function sortContacts(contacts: RecipientContact[]): RecipientContact[] {
  return [...contacts].sort((left, right) => {
    if (left.favorite !== right.favorite) return left.favorite ? -1 : 1;
    return Date.parse(right.lastUsedAt) - Date.parse(left.lastUsedAt);
  });
}

function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isTransactionHash(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
