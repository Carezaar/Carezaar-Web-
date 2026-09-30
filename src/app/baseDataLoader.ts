import { BASE_TABLES, baseService, type BaseTable } from "../api/services";
import type { BaseItem, Language, USState } from "../api/types";

/** The lookup tables, cached the way Android caches them in Room: a table is only
 *  refetched when `base/info` reports a newer `ts_cache`. React-free so the landing
 *  page can warm the same cache (src/warm.ts) before the visitor opens the app. */
const CACHE_KEY = "carezaar.baseData.v2";

export interface BaseDataCache {
  tsCache: number;
  tables: Partial<Record<BaseTable, BaseItem[]>>;
  languages: Language[];
  states: USState[];
}

export function readBaseCache(): BaseDataCache | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as BaseDataCache) : null;
  } catch {
    return null;
  }
}

function writeBaseCache(cache: BaseDataCache) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota exceeded or private mode: the in-memory copy still serves this session */
  }
}

export interface LoadResult {
  cache: BaseDataCache;
  /** True when nothing had to be fetched: the stored copy matches `base/info`. */
  upToDate: boolean;
  /** Every table failed and nothing was cached before. */
  failed: boolean;
}

/** Loads every lookup table unless the stored copy is current, then stores the result.
 *
 *  The server answers these requests a few at a time, and every screen needs the content
 *  table (all copy is server-driven) and the language list before anything else. So those
 *  two are fetched first and reported through `onEssentials`, which lets the app open
 *  while the other tables finish. Without a stored copy nothing can be skipped, so the
 *  tables start at once instead of waiting for `base/info`. */
export async function loadBaseData(opts: {
  force?: boolean;
  onStart?: (names: string[]) => void;
  onDone?: (name: string) => void;
  onEssentials?: (partial: BaseDataCache) => void;
} = {}): Promise<LoadResult> {
  const { force = false, onStart, onDone = () => {}, onEssentials } = opts;
  const current = readBaseCache();
  const infoRequest = baseService.info().catch(() => null);
  if (!force && current) {
    const info = await infoRequest;
    if (info && info.ts_cache === current.tsCache && Object.keys(current.tables).length >= BASE_TABLES.length) {
      return { cache: current, upToDate: true, failed: false };
    }
  }
  onStart?.([...BASE_TABLES, "languages", "states"]);

  const tables: Partial<Record<BaseTable, BaseItem[]>> = {};
  let anyFailed = false;
  const table = (name: BaseTable) => baseService.items(name)
    .then((items) => { tables[name] = items; onDone(name); })
    .catch(() => {
      anyFailed = true;
      if (current?.tables[name]) tables[name] = current.tables[name];
      onDone(name);
    });
  const list = <T,>(name: string, request: () => Promise<T>, fallback: T) => request()
    .then((v) => { onDone(name); return v; })
    .catch(() => { anyFailed = true; onDone(name); return fallback; });

  const [languages] = await Promise.all([
    list("languages", () => baseService.languages(), current?.languages ?? []),
    table("contents"),
  ]);
  if (tables.contents) {
    onEssentials?.({ tsCache: 0, tables: { ...tables }, languages, states: current?.states ?? [] });
  }
  const [states] = await Promise.all([
    list("states", () => baseService.states(), current?.states ?? []),
    ...BASE_TABLES.filter((name) => name !== "contents").map(table),
  ]);
  const info = await infoRequest;
  const next: BaseDataCache = {
    tsCache: anyFailed ? (current?.tsCache ?? 0) : (info?.ts_cache ?? 0),
    tables, languages: languages as Language[], states: states as USState[],
  };
  writeBaseCache(next);
  return { cache: next, upToDate: false, failed: anyFailed && Object.keys(tables).length === 0 };
}
