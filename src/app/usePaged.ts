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

/** Pages 1..N fetched again, in order, rebuilt into one list with the same rules as loading
 *  them one by one: no item twice, and an empty page (or one that adds nothing) ends the list
 *  there. Records the server no longer lists drop out; new ones appear in their place. */
export function reconcilePages<T>(pages: T[][], keyOf: (item: T) => unknown): { items: T[]; page: number; ended: boolean } {
  let items: T[] = [];
  let page = 0;
  for (const result of pages) {
    const { items: merged, added } = pagedMerge(items, result, keyOf);
    page += 1;
    if (result.length === 0 || added === 0) return { items, page, ended: true };
    items = merged;
  }
  return { items, page, ended: false };
}

/** A list state to start from instead of loading page 1 (e.g. My Matches on return). */
export interface PagedStart<T> { items: T[]; page: number; ended: boolean; total: number | null }

export function usePaged<T>(
  fetchPage: (page: number) => Promise<{ result: T[]; meta: ApiMeta | null }>,
  deps: unknown[],
  keyOf: (item: T) => unknown = defaultKey,
  start: PagedStart<T> | null = null,
) {
  const [items, setItems] = useState<T[]>(() => start?.items ?? []);
  const [total, setTotal] = useState<number | null>(() => start?.total ?? null);
  const [page, setPage] = useState(() => start?.page ?? 0);
  const [ended, setEnded] = useState(() => start?.ended ?? false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // The quiet refresh of loaded pages shows nothing (unlike `refreshing`, which drives the
  // pull-to-refresh indicator); it only holds back further pages until it is done.
  const [revalidating, setRevalidating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  // The latest list and page as of the last response. `loadMore` reads these instead of
  // state: a fast response can land before the next render, and a stale closure would
  // request (and append) the same page again.
  const loaded = useRef<{ page: number; ended: boolean; items: T[] }>(start ? { page: start.page, ended: start.ended, items: start.items } : { page: 0, ended: false, items: [] });
  // A starting state replaces the first load; later dependency changes (a new sort) load again.
  const startRef = useRef(start);
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
      // A further page that fails shows nothing, as on Android: the list stays as it is and
      // the page is asked for again the next time the end of the list comes into view
      // (parity review v6.0, G2). Only a failed first page is shown as an error.
      if (gen === generation.current && target === 1) setError(e);
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
   *  It takes over from a page that is still loading (that answer is then ignored), so a
   *  pull is never dropped. A failed refresh keeps what is shown and rethrows, for the
   *  caller to report. `keepMore` (a periodic refresh) keeps the further pages already
   *  loaded after the fresh first page, so the list doesn't shrink under the reader. */
  const refreshRunning = useRef(false);
  const refresh = useCallback(async ({ keepMore = false }: { keepMore?: boolean } = {}) => {
    // Periodic refresh yields to an explicit page load/retry. It must not advance
    // the generation and discard that page's eventual successful response.
    if (refreshRunning.current || (keepMore && inFlight.current)) return;
    refreshRunning.current = true;
    setLoading(false);
    const gen = ++generation.current;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const { result, meta } = await fetchRef.current(1);
      if (gen !== generation.current) return;
      const { items: first } = pagedMerge([], result, keyRef.current);
      setError(null);
      const previous = loaded.current;
      if (keepMore && previous.page > 1) {
        apply({ page: previous.page, ended: previous.ended, items: pagedMerge(first, previous.items, keyRef.current).items }, meta);
      } else {
        apply({ page: 1, ended: result.length === 0, items: first }, meta);
      }
    } finally {
      refreshRunning.current = false;
      if (gen === generation.current) { setRefreshing(false); inFlight.current = false; }
    }
  }, [apply]);

  /** Quiet refresh of every page already loaded (My Matches on return): pages 1..N are asked
   *  for again without the loading window while the list stays on screen, and replace it only
   *  once all have answered. A failure keeps the list as it is; a newer load (a new sort, a
   *  reload) wins over this answer. Further pages wait until it is done. `fetchAll` lets the
   *  caller share one refresh between screens. Resolves true when the list was refreshed. */
  const refreshLoaded = useCallback(async (fetchAll?: (count: number) => Promise<{ result: T[]; meta: ApiMeta | null }[]>) => {
    const count = loaded.current.page;
    if (count < 1 || inFlight.current || refreshRunning.current) return false;
    const gen = generation.current;
    inFlight.current = true;
    setRevalidating(true);
    try {
      const answers = await (fetchAll ?? ((n: number) => Promise.all(Array.from({ length: n }, (_, i) => fetchRef.current(i + 1)))))(count);
      if (gen !== generation.current) return false;
      apply(reconcilePages(answers.map((a) => a.result), keyRef.current), answers[0]?.meta ?? null);
      return true;
    } catch {
      return false;
    } finally {
      if (gen === generation.current) inFlight.current = false;
      setRevalidating(false);
    }
  }, [apply]);

  useEffect(() => {
    if (startRef.current) { startRef.current = null; return; }
    void reload();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller passes the list's own dependencies
  }, deps);

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

  return { items, total, page, ended, loading, refreshing, revalidating, error, hasMore, loadMore, reload, refresh, refreshLoaded, mutate };
}
