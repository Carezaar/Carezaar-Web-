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

/* ------------------------------------------------------------ live state */

/** Where each list stands for the screens that show it (client report, 29 Oct 2026: the app
 *  no longer waits for every list before opening). A list with a copy is `ready`, even while
 *  a newer copy downloads or after that download fails; `failed` means there is no copy. */
export type ListName = BaseTable | ExtraTable | "languages";
export type ListStatus = "idle" | "loading" | "ready" | "failed";
export interface BaseDataState { cache: BaseDataCache; status: Record<ListName, ListStatus> }

const EMPTY: BaseDataCache = { tsCache: 0, tables: {}, extras: {}, languages: [] };
const isExtra = (name: string): name is ExtraTable => (EXTRA_TABLES as readonly string[]).includes(name);

function hasList(cache: BaseDataCache, name: ListName): boolean {
  if (name === "languages") return cache.languages.length > 0;
  return Array.isArray(isExtra(name) ? cache.extras[name] : cache.tables[name as BaseTable]);
}

function withList(cache: BaseDataCache, name: ListName, value: unknown[]): BaseDataCache {
  if (name === "languages") return { ...cache, languages: value as Language[] };
  if (isExtra(name)) return { ...cache, extras: { ...cache.extras, [name]: value } };
  return { ...cache, tables: { ...cache.tables, [name]: value as BaseItem[] } };
}

/** Lists that have a copy are ready; the others take `missing`. */
function statusOf(cache: BaseDataCache, missing: ListStatus): BaseDataState["status"] {
  return Object.fromEntries(ALL_NAMES.map((n) => [n, hasList(cache, n as ListName) ? "ready" : missing])) as BaseDataState["status"];
}

/** Where a screen that shows several lists stands: `ready` once every one has a copy,
 *  `failed` once one of them has none and its load has ended, else `loading`. */
export function listsState(states: readonly ListStatus[]): "loading" | "ready" | "failed" {
  return states.every((s) => s === "ready") ? "ready" : states.includes("failed") ? "failed" : "loading";
}

let live: BaseDataState | null = null;
const listeners = new Set<() => void>();

/** What the screens show now: the stored copy until a load replaces lists one by one. */
export function baseDataState(): BaseDataState {
  if (!live) {
    const stored = readBaseCache() ?? EMPTY;
    live = { cache: stored, status: statusOf(stored, "idle") };
  }
  return live;
}

export function subscribeBaseData(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function publish(next: BaseDataState) {
  live = next;
  for (const listener of listeners) listener();
}

/** Shows a copy of every list it holds; lists it lacks keep what is shown, else `missing`. */
function show(cache: BaseDataCache, missing: ListStatus) {
  let shown = baseDataState().cache;
  for (const name of ALL_NAMES as ListName[]) {
    if (hasList(cache, name)) shown = withList(shown, name, name === "languages" ? cache.languages
      : isExtra(name) ? cache.extras[name]! : cache.tables[name as BaseTable]!);
  }
  publish({ cache: shown, status: statusOf(shown, missing) });
}

function showList(name: ListName, value: unknown[] | null) {
  const { cache, status } = baseDataState();
  const next = value ? withList(cache, name, value) : cache;
  // An empty language list is no copy (isComplete needs one), so it reads as failed.
  publish({ cache: next, status: { ...status, [name]: hasList(next, name) ? "ready" : "failed" } });
}

/** The request on its way for each list. A load and a Try Again join it, so one list is
 *  never asked for twice at once. */
const requesting = new Map<ListName, Promise<unknown[]>>();
/** Lists Try Again brought while a load ran, for that load to store with the others. */
const recovered = new Map<ListName, unknown[]>();

function fetchList(name: ListName): Promise<unknown[]> {
  const running = requesting.get(name);
  if (running) return running;
  const request: Promise<unknown[]> = name === "languages" ? baseService.languages()
    : isExtra(name) ? baseService.list(name) : baseService.items(name as BaseTable);
  const tracked = request.finally(() => { if (requesting.get(name) === tracked) requesting.delete(name); });
  requesting.set(name, tracked);
  return tracked;
}

let inFlight: Promise<LoadResult> | null = null;

/** Loads the reference lists unless the stored copy is current. Calls made while a load
 *  is running (the landing page's warm-up, the app) share it. */
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

/** Try Again on a screen whose lists failed: with no load running, a load as at start-up
 *  (it may find the build's snapshot current). While one runs (a list can fail while others
 *  are still arriving), the failed lists are asked for again at once, not after it ends, and
 *  that load stores what they bring with the rest (under the old marker, so the next start
 *  still checks for newer lists). */
export function retryBaseData(): Promise<unknown> {
  if (!inFlight) return loadBaseData();
  const { status } = baseDataState();
  const failed = (Object.keys(status) as ListName[]).filter((n) => status[n] === "failed" && !requesting.has(n));
  publish({ cache: baseDataState().cache, status: { ...status, ...Object.fromEntries(failed.map((n) => [n, "loading"])) } });
  return Promise.all(failed.map((name) => fetchList(name).then((v) => { recovered.set(name, v); showList(name, v); }, () => showList(name, null))));
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
  // A stored copy is shown at once; the version check below only decides whether to
  // download newer lists behind it. Lists with no copy show as loading.
  show(current ?? EMPTY, "loading");
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
        show(seed, "ready");
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
  recovered.clear();
  // Each list is shown as soon as it arrives; a failed one keeps the copy shown, if any.
  const failed = (name: ListName) => { anyFailed = true; showList(name, null); onDone(name); };
  const arrived = (name: ListName, value: unknown[]) => { showList(name, value); onDone(name); };
  const languages = (fetchList("languages") as Promise<Language[]>)
    .then((v) => { arrived("languages", v); return v; })
    .catch(() => { failed("languages"); return current?.languages ?? []; });
  await Promise.all([
    ...BASE_TABLES.map((name) => (fetchList(name) as Promise<BaseItem[]>)
      .then((items) => { tables[name] = items; arrived(name, items); })
      .catch(() => { if (current?.tables[name]) tables[name] = current.tables[name]; failed(name); })),
    ...EXTRA_TABLES.map((name) => fetchList(name)
      .then((items) => { extras[name] = items; arrived(name, items); })
      .catch(() => { if (current?.extras[name]) extras[name] = current.extras[name]; failed(name); })),
  ]);
  const [fetchedLanguages, info] = await Promise.all([languages, infoPromise]);
  let resolvedLanguages = fetchedLanguages;
  // A list that failed here but came back with Try Again in the meantime.
  for (const [name, value] of recovered) {
    if (name === "languages") { if (!resolvedLanguages.length) resolvedLanguages = value as Language[]; }
    else if (isExtra(name)) extras[name] ??= value;
    else tables[name as BaseTable] ??= value as BaseItem[];
  }
  recovered.clear();
  const next: BaseDataCache = {
    // A partial refresh keeps the old marker, so the next start downloads again.
    tsCache: anyFailed ? (current?.tsCache ?? 0) : (info?.ts_cache ?? 0),
    tables, extras, languages: resolvedLanguages,
  };
  if (isComplete(next)) writeBaseCache(next);
  return { cache: next, upToDate: false, failed: !isComplete(next) };
}
