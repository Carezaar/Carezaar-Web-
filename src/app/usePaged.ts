import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiMeta } from "../api/types";

/** Page-by-page loading for every list screen. The backend pages at 10 (the only sizes it
 *  accepts are 10/25/50).
 *
 *  As on Android, more pages are requested while the user scrolls until the server
 *  returns an empty page; the `meta.last_page` reported with page 1 is not a stopping
 *  point, because the list can grow while it is being read.
 *
 *  Guards:
 *  - one request at a time, so two scroll callbacks can't fetch (and append) a page twice;
 *  - items already in the list (same key) are not added again;
 *  - a page that brings nothing new ends the list, so a server that keeps answering
 *    with the same non-empty page can't cause an endless loop;
 *  - a failed page keeps everything already loaded, and loading resumes on retry. */
export function pagedMerge<T>(existing: T[], incoming: T[], keyOf: (item: T) => unknown): { items: T[]; added: number } {
  const seen = new Set(existing.map(keyOf));
  const fresh = incoming.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { items: fresh.length ? [...existing, ...fresh] : existing, added: fresh.length };
}

const defaultKey = (item: unknown) => (item as { id?: unknown })?.id ?? item;

export function usePaged<T>(
  fetchPage: (page: number) => Promise<{ result: T[]; meta: ApiMeta | null }>,
  deps: unknown[],
  keyOf: (item: T) => unknown = defaultKey,
) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [ended, setEnded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  // The latest list and page as of the last response. `loadMore` reads these instead of
  // state: a fast response can land before the next render, and a stale closure would
  // request (and append) the same page again.
  const loaded = useRef<{ page: number; ended: boolean; items: T[] }>({ page: 0, ended: false, items: [] });
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const keyRef = useRef(keyOf);
  keyRef.current = keyOf;

  const apply = useCallback((next: { page: number; ended: boolean; items: T[] }, meta: ApiMeta | null) => {
    loaded.current = next;
    setItems(next.items); setPage(next.page); setEnded(next.ended);
    if (meta?.total !== undefined) setTotal(meta.total ?? null);
  }, []);

  const load = useCallback(async (target: number) => {
    const gen = generation.current;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const { result, meta } = await fetchRef.current(target);
      if (gen !== generation.current) return; // a newer reload superseded this one
      const base = target === 1 ? [] : loaded.current.items;
      const { items: merged, added } = pagedMerge(base, result, keyRef.current);
      apply({ page: target, ended: result.length === 0 || added === 0, items: merged }, meta);
    } catch (e) {
      if (gen === generation.current) setError(e);
    } finally {
      if (gen === generation.current) { setLoading(false); inFlight.current = false; }
    }
  }, [apply]);

  const reload = useCallback(() => {
    generation.current += 1;
    loaded.current = { page: 0, ended: false, items: [] };
    setItems([]); setPage(0); setEnded(false); setTotal(null);
    inFlight.current = false;
    return load(1);
  }, [load]);

  /** Pull-to-refresh: fetches page 1 again and replaces the list only when it arrives.
   *  A failed refresh keeps what is shown and rethrows, for the caller to report. */
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    const gen = ++generation.current;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const { result, meta } = await fetchRef.current(1);
      if (gen !== generation.current) return;
      const { items: merged } = pagedMerge([], result, keyRef.current);
      setError(null);
      apply({ page: 1, ended: result.length === 0, items: merged }, meta);
    } finally {
      if (gen === generation.current) { setRefreshing(false); inFlight.current = false; }
    }
  }, [apply]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller passes the list's own dependencies
  useEffect(() => { void reload(); }, deps);

  const hasMore = page > 0 && !ended;
  const loadMore = useCallback(() => {
    const { page: current, ended: done } = loaded.current;
    // Page 1 always comes from `reload`; loadMore only continues from there.
    if (inFlight.current || error || current === 0 || done) return;
    void load(current + 1);
  }, [error, load]);

  /** Optimistic local edit (e.g. a bookmark toggled on a card). */
  const mutate = useCallback((fn: (all: T[]) => T[]) => {
    setItems((all) => {
      const next = fn(all);
      loaded.current = { ...loaded.current, items: next };
      return next;
    });
  }, []);

  return { items, total, page, loading, refreshing, error, hasMore, loadMore, reload, refresh, mutate };
}
