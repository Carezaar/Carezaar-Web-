import { asBaseItems, asLanguages } from "../api/schema";
import { BASE_TABLES, EXTRA_TABLES, asExtraList, baseService, type BaseTable, type ExtraTable } from "../api/services";
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

/** The build's snapshot of every list (scripts/base-seed.mjs), served by the site itself.
 *  Null when there is none (development, a build made offline) or it can't be read. */
async function readSeed(): Promise<BaseDataCache | null> {
  const origin = typeof window !== "undefined" ? window.location?.origin : undefined;
  if (!origin || origin === "null") return null;
  try {
    const response = await fetch(new URL("/base-seed.json", origin), { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const seed = await response.json() as { ts_cache?: unknown; lists?: Record<string, unknown> };
    if (typeof seed.ts_cache !== "number" || seed.ts_cache <= 0 || !seed.lists) return null;
    const lists = seed.lists;
    const tables: BaseDataCache["tables"] = {};
    for (const name of BASE_TABLES) if (Array.isArray(lists[name])) tables[name] = asBaseItems(lists[name]);
    const extras: BaseDataCache["extras"] = {};
    for (const name of EXTRA_TABLES) if (Array.isArray(lists[name])) extras[name] = asExtraList(lists[name]);
    const cache: BaseDataCache = { tsCache: seed.ts_cache, tables, extras, languages: asLanguages(lists.languages) };
    return isComplete(cache) ? cache : null;
  } catch {
    return null;
  }
}

async function load({ force = false, onStart, onDone = () => {} }: Options): Promise<LoadResult> {
  const current = readBaseCache();
  const infoPromise = baseService.info().catch(() => null);
  if (!force && isComplete(current)) {
    const info = await infoPromise;
    // Unchanged on the server (or the server can't be reached): keep the stored copy.
    if (!info || info.ts_cache === current.tsCache) return { cache: current, upToDate: true, failed: false };
  } else if (!isComplete(current)) {
    // First visit, or Try Again after one failed: the server answers the list reads one
    // after another, so downloading them all takes several seconds. Use the build's
    // snapshot when the server still reports its marker (the same check that keeps a
    // stored copy); otherwise download. A forced reload of a complete copy downloads.
    const seed = await readSeed();
    if (seed) {
      const info = await infoPromise;
      if (info && info.ts_cache === seed.tsCache) {
        writeBaseCache(seed);
        return { cache: seed, upToDate: true, failed: false };
      }
    }
  }
  // An incomplete cache must download every list regardless of the version.
  // Start those reads alongside metadata; keep the version/cache commit gate below.
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
  const [resolvedLanguages, info] = await Promise.all([languages, infoPromise]);
  const next: BaseDataCache = {
    // A partial refresh keeps the old marker, so the next start downloads again.
    tsCache: anyFailed ? (current?.tsCache ?? 0) : (info?.ts_cache ?? 0),
    tables, extras, languages: resolvedLanguages,
  };
  if (isComplete(next)) writeBaseCache(next);
  return { cache: next, upToDate: false, failed: !isComplete(next) };
}
