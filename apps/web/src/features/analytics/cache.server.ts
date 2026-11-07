export type Cache<T> = Map<string, { at: number; value: Promise<T> }>;

/** A TTL cache of promises: concurrent callers share one load, and a failed load is dropped so the next call retries. */
export function cached<T>(map: Cache<T>, key: string, ttl: number, load: () => Promise<T>) {
  const hit = map.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = load();
  const entry = { at: Date.now(), value };
  map.set(key, entry);
  value.catch(() => {
    if (map.get(key) === entry) map.delete(key);
  });
  return value;
}
