type CacheEntry = {
  expiresAt: number;
  value: Promise<unknown>;
};

const MAX_CACHE_ENTRIES = 500;
const cache = new Map<string, CacheEntry>();

function boundedInteger(
  value: string | undefined,
  fallbackValue: number,
  minimum: number,
  maximum: number
): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallbackValue;
}

export const apiCacheTtlMs = boundedInteger(
  process.env.XDC_API_CACHE_TTL_MS,
  15_000,
  1_000,
  60_000
);

function pruneCache(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }

  while (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

export async function withShortCache<T>(
  key: string,
  loader: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const cached = cache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.value as Promise<T>;
  }

  if (cached) cache.delete(key);
  pruneCache(now);

  const value = Promise.resolve().then(loader);
  cache.set(key, {
    expiresAt: now + apiCacheTtlMs,
    value
  });

  try {
    return await value;
  } catch (error) {
    if (cache.get(key)?.value === value) cache.delete(key);
    throw error;
  }
}
