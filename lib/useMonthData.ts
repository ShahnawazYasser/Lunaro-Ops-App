"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { defer } from "@/lib/defer";

// One tiny cache for every screen that loads data per month (or per filter).
//
//   const { data, loading, error, refresh, setData } =
//     useMonthData(`entries:${month}`, fetchEntries, initialIfThisIsTheFirstMonth);
//
// - Keys look like "<screen>:<month>[:<filter>]". Cached data shows instantly and
//   is refetched quietly in the background, so a revisited month never flashes
//   empty and never stays stale.
// - `seed` is what the server already loaded for the first key. It is shown at
//   once and NOT refetched on mount (the server just produced it).
// - The store lives in the browser only. On the server nothing is read from or
//   written to it (a module-level Map there would be shared between requests).
// - No new dependency.

const store = new Map<string, unknown>();
const listeners = new Set<() => void>();
const isBrowser = typeof window !== "undefined";

function emit(): void {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Forget cached data whose key starts with any prefix (e.g. "dashboard:").
 * `keep` protects the key the calling screen is showing right now — that one
 * is updated by the screen's own refresh()/setData().
 */
export function invalidate(prefixes: string | string[], keep?: string): void {
  const list = Array.isArray(prefixes) ? prefixes : [prefixes];
  for (const key of [...store.keys()]) {
    if (key !== keep && list.some((p) => key.startsWith(p))) store.delete(key);
  }
  emit();
}

/** GET a JSON endpoint; throws an Error carrying the server's plain message. */
export async function fetchJson<T>(url: string, fallbackMessage: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Could not reach server — check your connection");
  }
  if (!res.ok) {
    let message = fallbackMessage;
    try {
      const e = (await res.json()) as { error?: string };
      if (e.error) message = e.error;
    } catch {
      // keep the fallback
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

/** Quietly load a key into the cache if it isn't there (used to warm the previous month). */
export function prefetch<T>(key: string, fetcher: () => Promise<T>): void {
  if (!isBrowser || store.has(key)) return;
  void fetcher()
    .then((data) => {
      if (!store.has(key)) {
        store.set(key, data);
        emit();
      }
    })
    .catch(() => {
      // best effort only
    });
}

export interface MonthData<T> {
  data: T | null;
  /** true only while there is nothing to show yet */
  loading: boolean;
  error: string | null;
  /** refetch this key now (cached data stays on screen meanwhile) */
  refresh: () => Promise<void>;
  /** change the cached data for this key (optimistic updates) */
  setData: (update: (prev: T) => T) => void;
}

export function useMonthData<T>(key: string, fetcher: () => Promise<T>, seed?: T): MonthData<T> {
  // The key the server already loaded data for. Seeding runs once, on the first
  // client render, and always wins over whatever was cached before.
  const [seededKey] = useState<string | null>(() => {
    if (seed === undefined) return null;
    if (isBrowser) store.set(key, seed);
    return key;
  });
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  const cached = useSyncExternalStore(
    subscribe,
    () => store.get(key) as T | undefined,
    () => (key === seededKey ? seed : undefined),
  );

  const load = useCallback(async () => {
    try {
      const next = await fetcher();
      store.set(key, next);
      setFailure((f) => (f && f.key === key ? null : f));
      emit();
    } catch (e) {
      setFailure({ key, message: e instanceof Error ? e.message : "Something went wrong" });
    }
  }, [key, fetcher]);

  useEffect(
    () =>
      defer(() => {
        if (key === seededKey && store.has(key)) return; // the server just loaded this one
        void load();
      }),
    [key, seededKey, load],
  );

  const refresh = useCallback(async () => {
    setFailure((f) => (f && f.key === key ? null : f));
    await load();
  }, [key, load]);

  const setData = useCallback(
    (update: (prev: T) => T) => {
      const prev = store.get(key) as T | undefined;
      if (prev === undefined) return;
      store.set(key, update(prev));
      emit();
    },
    [key],
  );

  const error = failure && failure.key === key ? failure.message : null;
  return {
    data: cached ?? null,
    loading: cached === undefined && error === null,
    error: cached === undefined ? error : null,
    refresh,
    setData,
  };
}
