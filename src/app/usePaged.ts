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
  // The page/last page as of the latest response. `loadMore` reads these instead of
  // state: a fast response can finish before the next render, and a stale `page` from
  // the closure would request (and append) the same page again.
  const loaded = useRef({ page: 0, lastPage: 1 });
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
      loaded.current = { page: target, lastPage: meta?.last_page ?? target };
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
    loaded.current = { page: 0, lastPage: 1 };
    inFlight.current = false;
    return load(1, true);
  }, [load]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller passes the list's own dependencies
  useEffect(() => { void reload(); }, deps);

  const hasMore = page < lastPage;
  const loadMore = useCallback(() => {
    const { page: current, lastPage: last } = loaded.current;
    // Page 1 always comes from `reload`; loadMore only continues from there.
    if (inFlight.current || error || current === 0 || current >= last) return;
    void load(current + 1, false);
  }, [error, load]);

  /** Optimistic local edit (e.g. a bookmark toggled on a card). */
  const mutate = useCallback((fn: (all: T[]) => T[]) => setItems(fn), []);

  return { items, total, page, loading, error, hasMore, loadMore, reload, mutate };
}
