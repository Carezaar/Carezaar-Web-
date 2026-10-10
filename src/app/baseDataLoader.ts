import { BASE_TABLES, EXTRA_TABLES, baseService, type BaseTable, type ExtraTable } from "../api/services";
import type { BaseItem, Language } from "../api/types";

/** Every reference list, cached the way Android caches them in Room: stored in the
 *  browser and downloaded again only when `base/info` reports a newer `ts_cache` (the
 *  server's change marker; it moves whenever any list changes). React-free so the
 *  landing page can warm the same cache (src/warm.ts) before the visitor opens the app. */
const CACHE_KEY = "carezaar.baseData.v3";
const LEGACY_KEYS = ["carezaar.baseData.v2"];

export interface BaseDataCache {
  tsCache: number;
  tables: Partial<Record<BaseTable, BaseItem[]>>;
  /** Lists with their own shapes (states, media, FAQs, FAQ categories). */
  extras: Partial<Record<ExtraTable, unknown[]>>;
  languages: Language[];
}

const ALL_NAMES: string[] = [...BASE_TABLES, ...EXTRA_TABLES, "languages"];

/** True when every list is present (an empty list counts as present). */
export function isComplete(cache: BaseDataCache | null): cache is BaseDataCache {
  return cache !== null
    && BASE_TABLES.every((name) => Array.isArray(cache.tables[name]))
    && EXTRA_TABLES.every((name) => Array.isArray(cache.extras[name]))
    && cache.languages.length > 0;
}

export function readBaseCache(): BaseDataCache | null {
  try {
    for (const key of LEGACY_KEYS) window.localStorage.removeItem(key);
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BaseDataCache>;
    const tables: BaseDataCache["tables"] = {};
    for (const name of BASE_TABLES) if (Array.isArray(parsed.tables?.[name])) tables[name] = parsed.tables[name];
    const extras: BaseDataCache["extras"] = {};
    for (const name of EXTRA_TABLES) if (Array.isArray(parsed.extras?.[name])) extras[name] = parsed.extras[name];
    return {
      tsCache: typeof parsed.tsCache === "number" ? parsed.tsCache : 0,
      tables, extras,
      languages: Array.isArray(parsed.languages) ? parsed.languages : [],
    };
  } catch {
    // Storage blocked or the stored copy is unreadable: start from the server.
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
  /** Some list is missing entirely (failed and never stored), so the app can't continue. */
  failed: boolean;
}

type Options = { force?: boolean; onStart?: (names: string[]) => void; onDone?: (name: string) => void };

let inFlight: Promise<LoadResult> | null = null;

/** Loads the reference lists unless the stored copy is current. Calls made while a load
 *  is running (the landing page's warm-up, the app, a Try Again) share it. */
export function loadBaseData(opts: Options = {}): Promise<LoadResult> {
  if (!inFlight) {
    inFlight = load(opts).finally(() => { inFlight = null; });
  } else {
    // Joining a running load: report its lists as still pending until it settles.
    opts.onStart?.(ALL_NAMES);
    void inFlight.then(() => ALL_NAMES.forEach((n) => opts.onDone?.(n)), () => undefined);
  }
  return inFlight;
}

async function load({ force = false, onStart, onDone = () => {} }: Options): Promise<LoadResult> {
  const current = readBaseCache();
  const info = await baseService.info().catch(() => null);
  if (!force && isComplete(current)) {
    // Unchanged on the server (or the server can't be reached): keep the stored copy.
    if (!info || info.ts_cache === current.tsCache) return { cache: current, upToDate: true, failed: false };
  }
  onStart?.(ALL_NAMES);

  const tables: BaseDataCache["tables"] = {};
  const extras: BaseDataCache["extras"] = {};
  let anyFailed = false;
  const failed = (name: string) => { anyFailed = true; onDone(name); };
  const languages = baseService.languages()
    .then((v) => { onDone("languages"); return v; })
    .catch(() => { failed("languages"); return current?.languages ?? []; });
  await Promise.all([
    ...BASE_TABLES.map((name) => baseService.items(name)
      .then((items) => { tables[name] = items; onDone(name); })
      .catch(() => { if (current?.tables[name]) tables[name] = current.tables[name]; failed(name); })),
    ...EXTRA_TABLES.map((name) => baseService.list(name)
      .then((items) => { extras[name] = items; onDone(name); })
      .catch(() => { if (current?.extras[name]) extras[name] = current.extras[name]; failed(name); })),
  ]);
  const next: BaseDataCache = {
    // A partial refresh keeps the old marker, so the next start downloads again.
    tsCache: anyFailed ? (current?.tsCache ?? 0) : (info?.ts_cache ?? 0),
    tables, extras, languages: await languages,
  };
  if (isComplete(next)) writeBaseCache(next);
  return { cache: next, upToDate: false, failed: !isComplete(next) };
}
