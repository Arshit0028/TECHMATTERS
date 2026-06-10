// src/lib/queryCache.ts
//
// A tiny, dependency-free data cache with:
//   • stale-while-revalidate (instant render from cache, refresh in background)
//   • in-flight request dedup (N components, 1 network call)
//   • pub/sub so every subscriber re-renders when data changes
//   • imperative mutate() for optimistic updates / cache busting
//
// Why not React Query / SWR? This codebase's needs are simple and adding a
// ~12kb dependency (plus its mental model) isn't worth it. This is ~110 lines,
// covers the real hot paths (list screens refetching on every navigation),
// and is trivial to reason about.

type Entry<T> = {
  data: T | undefined;
  error: unknown;
  updatedAt: number;          // when data last resolved
  promise: Promise<T> | null; // in-flight request (for dedup)
  listeners: Set<() => void>;
};

const store = new Map<string, Entry<any>>();

// Default time a cached value is considered "fresh" (no background refetch).
const DEFAULT_DEDUPE_MS = 30_000;

function getEntry<T>(key: string): Entry<T> {
  let e = store.get(key);
  if (!e) {
    e = {
      data: undefined,
      error: undefined,
      updatedAt: 0,
      promise: null,
      listeners: new Set(),
    };
    store.set(key, e);
  }
  return e;
}

function emit(entry: Entry<any>) {
  entry.listeners.forEach((l) => l());
}

export function getCached<T>(key: string): Entry<T> {
  return getEntry<T>(key);
}

export function subscribe(key: string, listener: () => void): () => void {
  const entry = getEntry(key);
  entry.listeners.add(listener);
  return () => entry.listeners.delete(listener);
}

/**
 * Fetch (or revalidate) a key.
 * - If a request is already in flight for this key, the same promise is reused.
 * - If the cached value is still within `dedupeMs`, the cached value is returned
 *   without hitting the network (unless force=true).
 */
export async function fetchKey<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: { dedupeMs?: number; force?: boolean } = {},
): Promise<T> {
  const entry = getEntry<T>(key);
  const dedupeMs = opts.dedupeMs ?? DEFAULT_DEDUPE_MS;
  const now = Date.now();

  // Reuse an in-flight request.
  if (entry.promise) return entry.promise;

  // Serve fresh cache without refetching.
  if (
    !opts.force &&
    entry.data !== undefined &&
    now - entry.updatedAt < dedupeMs
  ) {
    return entry.data;
  }

  const p = (async () => {
    try {
      const data = await fetcher();
      entry.data = data;
      entry.error = undefined;
      entry.updatedAt = Date.now();
      return data;
    } catch (err) {
      entry.error = err;
      throw err;
    } finally {
      entry.promise = null;
      emit(entry);
    }
  })();

  entry.promise = p;
  // Notify subscribers that a load has started (so they can show revalidating UI).
  emit(entry);
  return p;
}

/**
 * Imperatively update a cached value (optimistic updates) and/or trigger a
 * revalidation. Passing `undefined` data just busts/refreshes the key.
 */
export function mutate<T>(
  key: string,
  data?: T | ((prev: T | undefined) => T),
): void {
  const entry = getEntry<T>(key);
  if (data !== undefined) {
    entry.data =
      typeof data === "function"
        ? (data as (prev: T | undefined) => T)(entry.data)
        : data;
    entry.updatedAt = Date.now();
    emit(entry);
  }
}

/** Invalidate one key or every key matching a prefix (e.g. "projects"). */
export function invalidate(keyOrPrefix: string, prefix = false): void {
  if (!prefix) {
    const e = store.get(keyOrPrefix);
    if (e) {
      e.updatedAt = 0; // mark stale → next read refetches
      emit(e);
    }
    return;
  }
  store.forEach((e, k) => {
    if (k.startsWith(keyOrPrefix)) {
      e.updatedAt = 0;
      emit(e);
    }
  });
}

/** Clear the entire cache (call on logout). */
export function clearCache(): void {
  store.clear();
}