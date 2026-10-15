export type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export function pruneExpiredRateLimitEntries(
  entries: Map<string, RateLimitEntry>,
  now = Date.now()
) {
  let removed = 0;
  for (const [key, entry] of entries) {
    if (entry.resetAt <= now) {
      entries.delete(key);
      removed += 1;
    }
  }
  return removed;
}
