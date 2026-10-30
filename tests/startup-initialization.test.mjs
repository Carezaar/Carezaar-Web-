import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Start-up without the blocking "Please wait…" sheet (client report, 29 Oct 2026): the
// reference lists load behind the screens, each with its own state. These run the actual
// loader, services and API client; fetch, storage and timers are process-local fixtures.
// Timers are compressed (the 120 s deadline and the 500/1,000/1,500 ms retry delays run in
// a few milliseconds), so a request that never answers is cut off exactly as in the app.

const repo = fileURLToPath(new URL('../', import.meta.url));
const NAMES = () => [...mod.BASE_TABLES, ...mod.EXTRA_TABLES, 'languages'];
let mod;
let probe = 0;

/** A fresh copy of the loader (its live state is per page, like a new tab). */
async function freshLoader() {
  const built = buildSync({
    stdin: {
      contents: `export {loadBaseData, retryBaseData, baseDataState, subscribeBaseData, listsState} from "./src/app/baseDataLoader.ts";export {BASE_TABLES,EXTRA_TABLES} from "./src/api/services.ts";export const probe = ${++probe};`,
      resolveDir: repo, sourcefile: `startup-${probe}.ts`, loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'esm', write: false, treeShaking: true,
  });
  mod = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
  return mod;
}

const envelope = (result, status = 200) => new Response(JSON.stringify({ result, meta: null, message: 'Synthetic', errors: null }), { status, headers: { 'Content-Type': 'application/json' } });
const rows = (name, stamp) => name === 'languages'
  ? [{ id: 1, code: 'en', name: `Synthetic-${stamp}`, is_default: true, is_rtl: false }]
  : [{ id: 1, code: `stamp-${stamp}`, slug: 'synthetic', translations: [] }];
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
/** Never answers; ends only when the client aborts it (its deadline). */
const stall = (init) => new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
const tick = () => new Promise((r) => setImmediate(r));

/** Installs window/fetch fixtures. `handler(name, init, attempt)` answers one request. */
function fixture(handler, stored = null) {
  const values = new Map(stored ? [['carezaar.baseData.v3', stored]] : []);
  const requests = [];
  const inFlight = new Map();
  let maxConcurrent = 0;
  const previous = { fetch: globalThis.fetch, window: globalThis.window };
  globalThis.window = {
    localStorage: { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) },
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)), clearTimeout, dispatchEvent: () => true,
  };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url), name = u.pathname.split('/').at(-1);
    assert.equal(u.origin, 'https://new.carezaar.com', 'no request may leave the fixture');
    assert.equal(init.method || 'GET', 'GET');
    const attempt = requests.filter((r) => r === name).length + 1;
    requests.push(name);
    inFlight.set(name, (inFlight.get(name) ?? 0) + 1);
    maxConcurrent = Math.max(maxConcurrent, inFlight.get(name));
    try { return await handler(name, init, attempt); } finally { inFlight.set(name, inFlight.get(name) - 1); }
  };
  return {
    values, requests, count: (name) => requests.filter((r) => r === name).length,
    get maxConcurrent() { return maxConcurrent; },
    restore() {
      globalThis.fetch = previous.fetch;
      if (previous.window === undefined) delete globalThis.window; else globalThis.window = previous.window;
    },
  };
}

const healthy = (stamp = 1) => (name) => envelope(name === 'info' ? { ts_cache: stamp } : rows(name, stamp));
const statusOf = (name) => mod.baseDataState().status[name];
/** What a screen showing these lists shows (the hook `useBaseLists` reads the same). */
const screen = (names) => mod.listsState(names.map(statusOf));

test('1. all lists succeed: each is shown as it arrives, before the slowest has finished', { timeout: 20000 }, async () => {
  const held = deferred();
  const fx = fixture(async (name) => {
    if (name === 'contents') await held.promise;
    return healthy(5)(name);
  });
  try {
    await freshLoader();
    const seen = [];
    const stop = mod.subscribeBaseData(() => seen.push({ ...mod.baseDataState().status }));
    const pending = mod.loadBaseData();
    assert.equal(statusOf('genders'), 'loading', 'missing lists show as loading at once');
    const others = NAMES().filter((n) => n !== 'contents');
    while (screen(others) !== 'ready') await tick();
    // The app is usable for everything but the one slow list.
    assert.equal(statusOf('contents'), 'loading');
    assert.equal(screen(['genders', 'roles', 'faqs']), 'ready');
    assert.equal(screen(['contents']), 'loading');
    held.resolve();
    const result = await pending;
    stop();
    assert.equal(result.failed, false);
    for (const name of NAMES()) assert.equal(statusOf(name), 'ready', name);
    assert.ok(seen.length > 2, 'lists are published one by one, not once at the end');
    assert.equal(JSON.parse(fx.values.get('carezaar.baseData.v3')).tsCache, 5);
  } finally { fx.restore(); }
});

test('2. an optional list failing leaves the rest usable and only that list failed', { timeout: 20000 }, async () => {
  const fx = fixture((name) => (name === 'faqs' ? envelope(null, 503) : healthy(6)(name)));
  try {
    await freshLoader();
    const result = await mod.loadBaseData();
    assert.equal(result.failed, true);
    assert.equal(statusOf('faqs'), 'failed');
    for (const name of NAMES().filter((n) => n !== 'faqs')) assert.equal(statusOf(name), 'ready', name);
    assert.equal(screen(['genders', 'careconditions']), 'ready');
    assert.equal(screen(['faqs', 'faq_categories']), 'failed');
    assert.equal(fx.count('faqs'), 1, 'an HTTP answer is final: not repeated');
    assert.equal(fx.values.get('carezaar.baseData.v3'), undefined, 'an incomplete set is not stored as current');
  } finally { fx.restore(); }
});

test('3 and 11. a required list failing is recoverable: Try Again asks for it again and it loads', { timeout: 20000 }, async () => {
  let down = true;
  const fx = fixture((name) => (name === 'careconditions' && down ? envelope(null, 500) : healthy(7)(name)));
  try {
    await freshLoader();
    await mod.loadBaseData();
    assert.equal(screen(['careconditions', 'genders']), 'failed');
    down = false;
    const retry = mod.retryBaseData();
    assert.equal(statusOf('careconditions'), 'loading', 'Try Again shows progress at once');
    const result = await retry;
    assert.equal(result.failed, false);
    assert.equal(screen(['careconditions', 'genders']), 'ready');
    assert.equal(fx.count('careconditions'), 2);
    assert.equal(JSON.parse(fx.values.get('carezaar.baseData.v3')).tsCache, 7);
  } finally { fx.restore(); }
});

test('4. a list that never answers is cut off by the request deadline and the load settles', { timeout: 20000 }, async () => {
  const fx = fixture((name, init) => (name === 'contents' ? stall(init) : healthy(8)(name)));
  try {
    await freshLoader();
    const pending = mod.loadBaseData();
    const result = await pending;
    assert.equal(result.failed, true, 'the load ends instead of waiting forever');
    assert.equal(statusOf('contents'), 'failed');
    assert.equal(fx.count('contents'), 1, 'a timed-out read is not repeated');
    assert.equal(screen(['genders']), 'ready');
  } finally { fx.restore(); }
});

test('5. the connection lost during start-up: every list fails, then Try Again recovers them', { timeout: 20000 }, async () => {
  let online = false;
  const fx = fixture((name) => {
    if (!online) throw new TypeError('Failed to fetch');
    return healthy(9)(name);
  });
  try {
    await freshLoader();
    const offline = await mod.loadBaseData();
    assert.equal(offline.failed, true);
    for (const name of NAMES()) assert.equal(statusOf(name), 'failed', name);
    assert.equal(fx.count('genders'), 4);
    online = true;
    const back = await mod.retryBaseData();
    assert.equal(back.failed, false);
    for (const name of NAMES()) assert.equal(statusOf(name), 'ready', name);
  } finally { fx.restore(); }
});

test('9. repeated starts (warm-up, app, remount) share one load: each list is asked for once', { timeout: 20000 }, async () => {
  const held = deferred();
  const fx = fixture(async (name) => { if (name === 'info') await held.promise; return healthy(10)(name); });
  try {
    await freshLoader();
    const loads = [mod.loadBaseData(), mod.loadBaseData(), mod.loadBaseData()];
    held.resolve();
    await Promise.all(loads);
    for (const name of [...NAMES(), 'info']) assert.equal(fx.count(name), 1, `${name} requested once`);
    assert.equal(fx.maxConcurrent, 1);
  } finally { fx.restore(); }
});

test('11 and 12. Try Again during a running load asks again at once for the failed list only, never twice at once', { timeout: 20000 }, async () => {
  const held = deferred();
  let faqsDown = true;
  const fx = fixture(async (name) => {
    if (name === 'faqs' && faqsDown) return envelope(null, 503);
    if (name === 'contents') { await held.promise; return envelope(rows(name, 'slow')); }
    return healthy(20)(name);
  });
  try {
    await freshLoader();
    const first = mod.loadBaseData();
    while (statusOf('faqs') !== 'failed') await tick();
    assert.equal(statusOf('contents'), 'loading', 'the start-up load is still running');
    faqsDown = false;
    const retry = mod.retryBaseData();
    assert.equal(statusOf('faqs'), 'loading', 'Try Again shows progress at once');
    await retry;
    assert.equal(statusOf('faqs'), 'ready', 'recovered without waiting for the slow list');
    assert.equal(statusOf('contents'), 'loading');
    assert.equal(fx.count('faqs'), 2);
    assert.equal(fx.count('contents'), 1, 'a list already on its way is not asked for again');
    assert.equal(fx.count('genders'), 1, 'lists that arrived are not downloaded again');
    // A second Try Again while nothing has failed sends nothing.
    await mod.retryBaseData();
    assert.equal(fx.requests.length, NAMES().length + 2);
    held.resolve();
    await first;
    assert.equal(fx.maxConcurrent, 1, 'never two requests for one list at once, so no late answer can land over a newer one');
    assert.equal(screen(NAMES()), 'ready');
  } finally { fx.restore(); }
});

test('overlapping Try Agains and a new load join a list already on its way; a recovered list is stored', { timeout: 20000 }, async () => {
  const heldContents = deferred(), heldFaqs = deferred();
  let faqsTry = 0, reasonsTry = 0;
  const fx = fixture(async (name) => {
    if (name === 'contents') { await heldContents.promise; return healthy(70)(name); }
    if (name === 'faqs') { faqsTry++; if (faqsTry === 1) return envelope(null, 503); await heldFaqs.promise; return healthy(70)(name); }
    if (name === 'reasons') { reasonsTry++; if (reasonsTry <= 2) return envelope(null, 503); }
    return healthy(70)(name);
  });
  try {
    await freshLoader();
    const first = mod.loadBaseData();
    while (statusOf('faqs') !== 'failed' || statusOf('reasons') !== 'failed') await tick();
    const retry1 = mod.retryBaseData();            // faqs#2 (held), reasons#2 (fails again)
    while (statusOf('reasons') !== 'failed') await tick();
    heldContents.resolve();
    await first;                                   // the start-up load ends while faqs#2 is open
    const retry2 = mod.retryBaseData();            // no load running: a full load, which joins faqs#2
    await tick();
    assert.equal(fx.count('faqs'), 2, 'the new load joined the faqs request already on its way');
    heldFaqs.resolve();
    await Promise.all([retry1, retry2]);
    assert.equal(fx.maxConcurrent, 1, 'never two requests for one list at once');
    assert.equal(screen(NAMES()), 'ready');
    assert.ok(fx.values.get('carezaar.baseData.v3'), 'the complete set is stored once everything arrived');
  } finally { fx.restore(); }
});

test('a list recovered by Try Again while the start-up load runs is stored with the others', { timeout: 20000 }, async () => {
  const held = deferred();
  let faqsTry = 0;
  const fx = fixture(async (name) => {
    if (name === 'contents') { await held.promise; return healthy(80)(name); }
    if (name === 'faqs' && ++faqsTry === 1) return envelope(null, 503);
    return healthy(80)(name);
  });
  try {
    await freshLoader();
    const first = mod.loadBaseData();
    while (statusOf('faqs') !== 'failed') await tick();
    await mod.retryBaseData();
    held.resolve();
    const result = await first;
    assert.equal(result.failed, false);
    const stored = JSON.parse(fx.values.get('carezaar.baseData.v3'));
    assert.ok(Array.isArray(stored.extras.faqs), 'faqs stored');
    assert.equal(stored.tsCache, 0, 'stored under the old marker, so the next start checks for newer lists');
  } finally { fx.restore(); }
});

test('the build snapshot shows every list once base/info confirms it; until then they are loading', { timeout: 20000 }, async () => {
  const info = deferred();
  const fx = fixture(async (name) => { if (name === 'info') { await info.promise; return envelope({ ts_cache: 40 }); } return healthy(40)(name); });
  const seed = { ts_cache: 40, lists: Object.fromEntries([...['careconditions', 'caredays', 'carespecials', 'certifications', 'clienttypes', 'commutes', 'contents', 'countries', 'experiences', 'genders', 'issuetypes', 'languageskills', 'reasons', 'roles', 'shifts', 'subjects', 'worktypes', 'states', 'media', 'faqs', 'faq_categories', 'languages']].map((n) => [n, rows(n, 'seed')])) };
  const apiFetch = globalThis.fetch;
  globalThis.window.location = { origin: 'https://site.test' };
  globalThis.fetch = async (url, init) => (new URL(url).origin === 'https://site.test' ? new Response(JSON.stringify(seed), { status: 200 }) : apiFetch(url, init));
  try {
    await freshLoader();
    const pending = mod.loadBaseData();
    await tick();
    assert.equal(statusOf('genders'), 'loading');
    info.resolve();
    const result = await pending;
    assert.equal(result.upToDate, true);
    for (const name of NAMES()) assert.equal(statusOf(name), 'ready', name);
    assert.equal(mod.baseDataState().cache.tables.genders[0].code, 'stamp-seed');
    assert.equal(fx.count('genders'), 0, 'the snapshot saves the downloads');
  } finally { fx.restore(); }
});

test('an empty language list is not a copy: it reads as failed, not ready', { timeout: 20000 }, async () => {
  const fx = fixture((name) => (name === 'languages' ? envelope([]) : healthy(50)(name)));
  try {
    await freshLoader();
    await mod.loadBaseData();
    assert.equal(statusOf('languages'), 'failed');
    assert.equal(statusOf('contents'), 'ready');
  } finally { fx.restore(); }
});

test('a list keeps its identity while other lists arrive (translations are not rebuilt each time)', { timeout: 20000 }, async () => {
  const held = deferred();
  const fx = fixture(async (name) => { if (name !== 'contents' && name !== 'info') await held.promise; return healthy(60)(name); });
  try {
    await freshLoader();
    const pending = mod.loadBaseData();
    while (statusOf('contents') !== 'ready') await tick();
    const contents = mod.baseDataState().cache.tables.contents;
    const languages = mod.baseDataState().cache.languages;
    held.resolve();
    await pending;
    assert.equal(mod.baseDataState().cache.tables.contents, contents);
    assert.notEqual(mod.baseDataState().cache.languages, languages, 'languages arrived after');
  } finally { fx.restore(); }
});

test('15. a returning visit shows the stored lists at once, even while base/info never answers', { timeout: 20000 }, async () => {
  const seedFx = fixture(healthy(30));
  let stored;
  try { await freshLoader(); await mod.loadBaseData(); stored = seedFx.values.get('carezaar.baseData.v3'); } finally { seedFx.restore(); }
  const fx = fixture((name, init) => (name === 'info' ? stall(init) : healthy(31)(name)), stored);
  try {
    await freshLoader();
    for (const name of NAMES()) assert.equal(statusOf(name), 'ready', `${name} ready before any request`);
    const pending = mod.loadBaseData();
    await tick();
    assert.equal(screen(NAMES()), 'ready', 'nothing waits for the version check');
    const result = await pending;
    assert.equal(result.upToDate, true, 'an unreachable version check keeps the stored copy');
    assert.equal(fx.count('genders'), 0);
  } finally { fx.restore(); }
});

test('the combined state of a screen\'s lists', async () => {
  await freshLoader();
  assert.equal(mod.listsState(['ready', 'ready']), 'ready');
  assert.equal(mod.listsState(['ready', 'loading']), 'loading');
  assert.equal(mod.listsState(['idle']), 'loading', 'not started yet reads as loading');
  assert.equal(mod.listsState(['loading', 'failed']), 'failed', 'a failure is shown without waiting for the others');
  assert.equal(mod.listsState([]), 'ready');
});
