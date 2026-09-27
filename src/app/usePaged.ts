import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiMeta } from "../api/types";

/** Page-by-page loading for every list screen. The backend pages at 10 (the only
 *  sizes it accepts are 10/25/50) and reports `meta.total` / `meta.last_page`. */
export function usePaged<T>(
  fetchPage: (page: number) => Promise<{ result: T[]; meta: ApiMeta | null }>,
  deps: unknown[],
) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const generation = useRef(0);
  // State updates are async, so two scroll callbacks can both see `loading === false`
  // and fetch the same page twice. A ref closes that window.
  const inFlight = useRef(false);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const load = useCallback(async (target: number, replace: boolean) => {
    const gen = generation.current;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const { result, meta } = await fetchRef.current(target);
      if (gen !== generation.current) return; // a newer reload superseded this one
      setItems((prev) => (replace ? result : [...prev, ...result]));
      setPage(target);
      setLastPage(meta?.last_page ?? target);
      setTotal(meta?.total ?? null);
    } catch (e) {
      if (gen === generation.current) setError(e);
    } finally {
      if (gen === generation.current) { setLoading(false); inFlight.current = false; }
    }
  }, []);

  const reload = useCallback(() => {
    generation.current += 1;
    setItems([]); setPage(0); setTotal(null);
    inFlight.current = false;
    return load(1, true);
  }, [load]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, deps);

  const hasMore = page < lastPage;
  const loadMore = useCallback(() => {
    if (!inFlight.current && hasMore && !error) void load(page + 1, false);
  }, [hasMore, error, load, page]);

  /** Optimistic local edit (e.g. a bookmark toggled on a card). */
  const mutate = useCallback((fn: (all: T[]) => T[]) => setItems(fn), []);

  return { items, total, page, loading, error, hasMore, loadMore, reload, mutate };
}
