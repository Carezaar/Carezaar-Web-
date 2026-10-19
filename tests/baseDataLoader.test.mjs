import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

test('a cold cache starts required lists while metadata is pending and a complete cache still avoids downloads', { timeout: 15000 }, async () => {
  const repo = fileURLToPath(new URL('../', import.meta.url));
  const built = buildSync({
    stdin: { contents: 'export {loadBaseData} from "./src/app/baseDataLoader.ts";export {BASE_TABLES,EXTRA_TABLES} from "./src/api/services.ts";export const coldOrderingProbe = true;', resolveDir: repo, sourcefile: 'cold-cache-ordering-test.ts', loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false, treeShaking: true,
  });
  const previousFetch = globalThis.fetch, previousWindow = globalThis.window;
  const values = new Map(), requests = [];
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  const envelope = result => new Response(JSON.stringify({ result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  let releaseInfo, pending, names;
  let info = new Promise(resolve => { releaseInfo = resolve; });
  try {
    globalThis.window = { localStorage: storage, setTimeout, clearTimeout, dispatchEvent: () => true };
    globalThis.fetch = async (url, init = {}) => {
      const u = new URL(url), name = u.pathname.split('/').at(-1);
      assert.equal(u.origin, 'https://new.carezaar.com');
      assert.equal(u.pathname, '/api/base/' + name);
      assert.equal(init.method || 'GET', 'GET');
      assert.ok(name === 'info' || names.includes(name));
      requests.push(name);
      if (name === 'info') return info;
      return envelope(name === 'languages'
        ? [{ id: 1, code: 'en', name: 'English', is_default: true, is_rtl: false }]
        : [{ id: 1, code: 'synthetic', translations: [] }]);
    };
    const { loadBaseData, BASE_TABLES, EXTRA_TABLES } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
    names = [...BASE_TABLES, ...EXTRA_TABLES, 'languages'];
    pending = loadBaseData();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests.filter(name => name === 'info').length, 1);
    assert.deepEqual(requests.filter(name => name !== 'info').sort(), [...names].sort(), 'a fresh visit must not queue all required lists behind metadata');
    assert.equal(storage.getItem('carezaar.baseData.v3'), null, 'do not publish a cache before its version is known');
    releaseInfo(envelope({ ts_cache: 12 }));
    const cold = await pending;
    assert.equal(cold.failed, false);
    assert.equal(cold.cache.tsCache, 12);
    assert.equal(cold.upToDate, false);

    requests.length = 0;
    info = new Promise(resolve => { releaseInfo = resolve; });
    pending = loadBaseData();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(requests, ['info'], 'a complete cache must still wait for the version check before deciding to download');
    releaseInfo(envelope({ ts_cache: 12 }));
    const warm = await pending;
    assert.equal(warm.upToDate, true);
    assert.equal(warm.failed, false);
    assert.deepEqual(requests, ['info']);
  } finally {
    releaseInfo?.(envelope({ ts_cache: 12 }));
    if (pending) await pending.catch(() => undefined);
    globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

// Exercise the actual loader, services and decoder. fetch and storage below are
// process-local fixtures; no request can reach a real API or a browser session.
test('a last-finishing language failure keeps the retry marker until a complete retry', { timeout: 15000 }, async () => {
  const repo = fileURLToPath(new URL('../', import.meta.url));
  const built = buildSync({
    stdin: { contents: 'export {loadBaseData} from "./src/app/baseDataLoader.ts";export {BASE_TABLES,EXTRA_TABLES} from "./src/api/services.ts";', resolveDir: repo, sourcefile: 'base-cache-test.ts', loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false, treeShaking: true,
  });
  const previousFetch = globalThis.fetch, previousWindow = globalThis.window;
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  const requests = [];
  let mode = 'baseline', names, unknown = 0, timer, fixtureExpired = false;
  let releaseLanguage, allListsDone;
  const heldLanguage = new Promise(resolve => { releaseLanguage = resolve; });
  const listsDone = new Promise(resolve => { allListsDone = resolve; });
  const settled = new Set();
  const envelope = (result, status = 200) => new Response(JSON.stringify({ result, meta: null, message: 'Synthetic response', errors: null }), { status, headers: { 'Content-Type': 'application/json' } });
  const rows = (name, stamp) => name === 'languages'
    ? [{ id: 1, code: 'en', name: `Synthetic-${stamp}`, is_default: true, is_rtl: false }]
    : [{ id: 1, code: `stamp-${stamp}`, slug: 'synthetic', country_id: 1, faq_category_id: 1, translations: [] }];
  try {
    globalThis.window = { localStorage: storage, setTimeout, clearTimeout, dispatchEvent: () => true };
    globalThis.fetch = async (url, init = {}) => {
      const u = new URL(url), name = u.pathname.split('/').at(-1);
      if (u.origin !== 'https://new.carezaar.com' || !u.pathname.startsWith('/api/base/') || (init.method || 'GET') !== 'GET' || (name !== 'info' && !names.includes(name))) {
        unknown++; throw new Error('Unexpected fixture request');
      }
      requests.push({ stage: mode, name });
      const stamp = mode === 'baseline' ? 10 : 11;
      if (name === 'info') return envelope(Object.fromEntries([['ts_cache', stamp], ['total', names.length], ...names.map(n => [n, 1])]));
      if (mode === 'delayed-language-failure' && name === 'languages') return heldLanguage;
      return envelope(rows(name, stamp));
    };
    const { loadBaseData, BASE_TABLES, EXTRA_TABLES } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
    names = [...BASE_TABLES, ...EXTRA_TABLES, 'languages'];
    const baseline = await loadBaseData();
    assert.equal(baseline.failed, false);
    assert.equal(baseline.cache.tsCache, 10);
    assert.equal(baseline.cache.languages[0]?.name, 'Synthetic-10');
    assert.equal(names.length, 22);

    mode = 'delayed-language-failure';
    const pending = loadBaseData({ onDone: name => {
      if (name !== 'languages') settled.add(name);
      if (settled.size === names.length - 1) allListsDone();
    } });
    timer = setTimeout(() => { fixtureExpired = true; releaseLanguage(envelope(null, 503)); allListsDone(); }, 3000);
    await listsDone;
    // Drain the successful handlers: the only outstanding list is languages.
    await new Promise(resolve => setImmediate(resolve));
    releaseLanguage(envelope(null, 503)); clearTimeout(timer);
    const changed = await pending;
    assert.equal(fixtureExpired, false, 'fixture prerequisite must not time out');
    assert.equal(settled.size, 21);
    assert.equal(changed.failed, false, 'existing fallback cache remains usable');
    assert.equal(changed.cache.languages[0]?.name, 'Synthetic-10');
    assert.equal(changed.cache.tsCache, 10, 'late language failure must keep the old retry marker');
    assert.equal(JSON.parse(storage.getItem('carezaar.baseData.v3')).tsCache, 10);

    mode = 'healthy-retry';
    const retry = await loadBaseData();
    const retried = requests.filter(r => r.stage === mode);
    assert.equal(retry.upToDate, false);
    assert.equal(retry.failed, false);
    assert.equal(retry.cache.tsCache, 11);
    assert.equal(retry.cache.languages[0]?.name, 'Synthetic-11');
    assert.equal(retried.filter(r => r.name === 'info').length, 1);
    for (const name of names) assert.equal(retried.filter(r => r.name === name).length, 1, `${name} must be fetched once on retry`);

    mode = 'unchanged-control';
    const stored = storage.getItem('carezaar.baseData.v3');
    const control = await loadBaseData();
    assert.equal(control.upToDate, true);
    assert.equal(control.failed, false);
    assert.equal(control.cache.languages[0]?.name, 'Synthetic-11');
    assert.deepEqual(requests.filter(r => r.stage === mode).map(r => r.name), ['info']);
    assert.equal(storage.getItem('carezaar.baseData.v3'), stored);
    assert.equal(unknown, 0);
  } finally {
    releaseLanguage(envelope(null, 503)); if (timer) clearTimeout(timer);
    globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

// The build's snapshot (scripts/base-seed.mjs) is used on a first visit only while the
// server's marker still matches it; any doubt falls back to downloading every list.
test('a first visit uses the build snapshot only while base/info reports its marker', { timeout: 15000 }, async () => {
  const repo = fileURLToPath(new URL('../', import.meta.url));
  const built = buildSync({
    stdin: { contents: 'export {loadBaseData} from "./src/app/baseDataLoader.ts";export {BASE_TABLES,EXTRA_TABLES} from "./src/api/services.ts";export const seedProbe = true;', resolveDir: repo, sourcefile: 'base-seed-test.ts', loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false, treeShaking: true,
  });
  const previousFetch = globalThis.fetch, previousWindow = globalThis.window;
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  const envelope = (result, status = 200) => new Response(JSON.stringify({ result }), { status, headers: { 'Content-Type': 'application/json' } });
  const rows = (name, label) => name === 'languages'
    ? [{ id: 1, code: 'en', name: label, is_default: true, is_rtl: false }]
    : [{ id: 1, code: label, slug: 'synthetic', translations: [] }];
  let names, requests = [], seed, serverMarker, serverUp;
  try {
    globalThis.window = { localStorage: storage, location: { origin: 'https://site.test' }, setTimeout, clearTimeout, dispatchEvent: () => true };
    globalThis.fetch = async (url, init = {}) => {
      const u = new URL(url), name = u.pathname.split('/').at(-1);
      assert.equal(init.method || 'GET', 'GET');
      if (u.origin === 'https://site.test') {
        assert.equal(u.pathname, '/base-seed.json');
        requests.push('seed');
        return seed === null ? new Response('missing', { status: 404 }) : new Response(JSON.stringify(seed), { status: 200 });
      }
      assert.equal(u.origin, 'https://new.carezaar.com');
      assert.ok(name === 'info' || names.includes(name));
      requests.push(name);
      if (!serverUp) return envelope(null, 503);
      return envelope(name === 'info' ? { ts_cache: serverMarker } : rows(name, 'downloaded'));
    };
    const { loadBaseData, BASE_TABLES, EXTRA_TABLES } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
    names = [...BASE_TABLES, ...EXTRA_TABLES, 'languages'];
    const fullSeed = (marker) => ({ ts_cache: marker, lists: Object.fromEntries(names.map(n => [n, rows(n, 'snapshot')])) });
    const fresh = (s, marker, up = true) => { values.clear(); requests = []; seed = s; serverMarker = marker; serverUp = up; };

    // Marker matches: only the snapshot and the version check; the snapshot is stored.
    fresh(fullSeed(30), 30);
    const matched = await loadBaseData();
    assert.deepEqual(requests.sort(), ['info', 'seed']);
    assert.equal(matched.failed, false);
    assert.equal(matched.upToDate, true);
    assert.equal(matched.cache.tsCache, 30);
    assert.equal(matched.cache.languages[0]?.name, 'snapshot');
    assert.equal(Object.keys(matched.cache.tables).length, BASE_TABLES.length);
    assert.equal(Object.keys(matched.cache.extras).length, EXTRA_TABLES.length);
    assert.equal(JSON.parse(storage.getItem('carezaar.baseData.v3')).tsCache, 30);
    // The stored snapshot then behaves like any stored copy.
    requests = [];
    assert.equal((await loadBaseData()).upToDate, true);
    assert.deepEqual(requests, ['info']);

    // The server's lists changed after the build: download every list as before.
    fresh(fullSeed(30), 31);
    const stale = await loadBaseData();
    assert.equal(stale.failed, false);
    assert.equal(stale.upToDate, false);
    assert.equal(stale.cache.tsCache, 31);
    assert.equal(stale.cache.languages[0]?.name, 'downloaded');
    for (const name of names) assert.equal(requests.filter(r => r === name).length, 1, `${name} must be downloaded once`);

    // No snapshot (development, offline build): the previous behaviour.
    fresh(null, 32);
    const none = await loadBaseData();
    assert.equal(none.cache.tsCache, 32);
    assert.equal(none.cache.languages[0]?.name, 'downloaded');
    assert.equal(requests.filter(r => names.includes(r)).length, names.length);

    // An incomplete snapshot is ignored, even with a matching marker.
    const partial = fullSeed(33); delete partial.lists.faqs;
    fresh(partial, 33);
    const incomplete = await loadBaseData();
    assert.equal(incomplete.cache.languages[0]?.name, 'downloaded');
    assert.equal(requests.filter(r => names.includes(r)).length, names.length);

    // Server unreachable: the snapshot is not used on its own; the app reports the failure.
    fresh(fullSeed(34), 34, false);
    const offline = await loadBaseData();
    assert.equal(offline.failed, true);
    assert.equal(storage.getItem('carezaar.baseData.v3'), null);
    // Try Again (a forced reload) once reconnected, with nothing stored: the snapshot.
    requests = []; serverUp = true;
    const retried = await loadBaseData({ force: true });
    assert.equal(retried.failed, false);
    assert.equal(retried.cache.languages[0]?.name, 'snapshot');
    assert.deepEqual(requests.sort(), ['info', 'seed']);
    // A forced reload of a complete stored copy still downloads every list.
    requests = []; serverMarker = 35;
    const forced = await loadBaseData({ force: true });
    assert.equal(forced.cache.tsCache, 35);
    assert.equal(forced.cache.languages[0]?.name, 'downloaded');
    assert.equal(requests.filter(r => names.includes(r)).length, names.length);
    assert.ok(!requests.includes('seed'));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
