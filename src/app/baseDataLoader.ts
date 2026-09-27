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

/** Loads every lookup table unless the stored copy is current, then stores the result. */
export async function loadBaseData(opts: {
  force?: boolean;
  onStart?: (names: string[]) => void;
  onDone?: (name: string) => void;
} = {}): Promise<LoadResult> {
  const { force = false, onStart, onDone = () => {} } = opts;
  const current = readBaseCache();
  const info = await baseService.info().catch(() => null);
  if (!force && current && info && info.ts_cache === current.tsCache
      && Object.keys(current.tables).length >= BASE_TABLES.length) {
    return { cache: current, upToDate: true, failed: false };
  }
  onStart?.([...BASE_TABLES, "languages", "states"]);

  const tables: Partial<Record<BaseTable, BaseItem[]>> = {};
  let anyFailed = false;
  const [languages, states] = await Promise.all([
    baseService.languages().then((v) => { onDone("languages"); return v; })
      .catch(() => { anyFailed = true; onDone("languages"); return current?.languages ?? []; }),
    baseService.states().then((v) => { onDone("states"); return v; })
      .catch(() => { anyFailed = true; onDone("states"); return current?.states ?? []; }),
    ...BASE_TABLES.map((table) => baseService.items(table)
      .then((items) => { tables[table] = items; onDone(table); })
      .catch(() => {
        anyFailed = true;
        if (current?.tables[table]) tables[table] = current.tables[table];
        onDone(table);
      })),
  ]);
  const next: BaseDataCache = {
    tsCache: anyFailed ? (current?.tsCache ?? 0) : (info?.ts_cache ?? 0),
    tables, languages: languages as Language[], states: states as USState[],
  };
  writeBaseCache(next);
  return { cache: next, upToDate: false, failed: anyFailed && Object.keys(tables).length === 0 };
}
