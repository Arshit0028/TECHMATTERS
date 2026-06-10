// src/hooks/useQuery.ts
//
// React binding over the queryCache store. Gives components:
//   • instant render from cache (stale-while-revalidate)
//   • automatic dedup across components requesting the same key
//   • background refresh on mount + on window refocus
//   • a manual refetch()
//
// Drop-in replacement for the repeated `useState + useEffect + axios` blocks.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchKey,
  subscribe,
  getCached,
  invalidate as invalidateKey,
  mutate as mutateKey,
} from "../lib/queryCache";

interface UseQueryOptions {
  /** Skip fetching until true (e.g. wait for an id/user). Default true. */
  enabled?: boolean;
  /** How long a cached value stays "fresh" before background refetch (ms). */
  dedupeMs?: number;
  /** Refetch when the window/tab regains focus. Default true. */
  refetchOnFocus?: boolean;
}

interface UseQueryResult<T> {
  data: T | undefined;
  error: unknown;
  /** True only on the very first load when there's no cached data yet. */
  loading: boolean;
  /** True whenever a background refresh is running. */
  isValidating: boolean;
  refetch: () => Promise<T | undefined>;
  /** Optimistically set this key's cached data. */
  mutate: (data: T | ((prev: T | undefined) => T)) => void;
}

export function useQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options: UseQueryOptions = {},
): UseQueryResult<T> {
  const {
    enabled = true,
    dedupeMs,
    refetchOnFocus = true,
  } = options;

  // Keep the latest fetcher without making it a dependency (avoids refetch loops
  // when callers pass an inline arrow function).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Local tick to force re-render when the cache entry emits.
  const [, forceRender] = useState(0);
  const rerender = useCallback(() => forceRender((n) => n + 1), []);

  const active = enabled && key !== null;

  // Subscribe to cache changes for this key.
  useEffect(() => {
    if (!active || !key) return;
    const unsub = subscribe(key, rerender);
    return unsub;
  }, [key, active, rerender]);

  // Initial / key-change fetch.
  useEffect(() => {
    if (!active || !key) return;
    fetchKey(key, () => fetcherRef.current(), { dedupeMs }).catch(() => {
      /* error is captured in the cache entry; surfaced via `error` below */
    });
  }, [key, active, dedupeMs]);

  // Refetch on window focus (revalidate stale data when user returns).
  useEffect(() => {
    if (!active || !key || !refetchOnFocus) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        fetchKey(key, () => fetcherRef.current(), { dedupeMs }).catch(() => {});
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [key, active, refetchOnFocus, dedupeMs]);

  const entry = key ? getCached<T>(key) : null;
  const data = entry?.data;
  const error = entry?.error;
  const isValidating = !!entry?.promise;
  const loading = active && data === undefined && (isValidating || !entry?.updatedAt);

  const refetch = useCallback(async () => {
    if (!key) return undefined;
    return fetchKey(key, () => fetcherRef.current(), { force: true }).catch(
      () => undefined,
    );
  }, [key]);

  const mutate = useCallback(
    (next: T | ((prev: T | undefined) => T)) => {
      if (key) mutateKey<T>(key, next);
    },
    [key],
  );

  return { data, error, loading, isValidating, refetch, mutate };
}

// Re-export cache utilities so components import from one place.
export { invalidateKey as invalidate, mutateKey as mutate };