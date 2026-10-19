import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

// The returning-user prefetch makes My Matches' own first-page request early, and only
// hands it over for the same stored login, role, sort and page, once, while fresh.
test('My Matches first page starts early only for the hinted login and is used once', { timeout: 15000 }, async () => {
  const repo = fileURLToPath(new URL('../', import.meta.url));
  const built = buildSync({
    stdin: { contents: 'export * from "./src/app/matchesPrefetch.ts";', resolveDir: repo, sourcefile: 'prefetch-test.ts', loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false,
  });
  const previousFetch = globalThis.fetch, previousWindow = globalThis.window, previousNow = Date.now;
  const values = new Map(), requests = [];
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) };
  let offset = 0;
  try {
    globalThis.window = { localStorage: storage, setTimeout, clearTimeout, dispatchEvent: () => true, addEventListener: () => {} };
    Date.now = () => previousNow() + offset;
    globalThis.fetch = async (url, init = {}) => {
      const u = new URL(url);
      requests.push(`${init.method || 'GET'} ${u.pathname}${u.search}`);
      return new Response(JSON.stringify({ result: [], meta: { current_page: 1, last_page: 1, per_page: 10, total: 0 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const m = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
    const login = (owner) => { values.set('carezaar.accessToken', 'synthetic-access'); values.set('carezaar.refreshToken', 'synthetic-refresh'); values.set('carezaar.sessionOwner', owner); };

    // No hint yet (first sign-in on this browser): nothing starts.
    login('owner-a');
    m.startMatchesPrefetch('/main/matches');
    assert.deepEqual(requests, []);

    // Hint for this login: the first page starts once; handed over once.
    m.rememberRole('owner-a', 'client');
    m.startMatchesPrefetch('/main/matches');
    assert.deepEqual(requests, ['GET /api/clients/matches?sort=distance&page=1&perPage=10']);
    assert.ok(m.takeMatchesPrefetch('client', 'distance', 1));
    assert.equal(m.takeMatchesPrefetch('client', 'distance', 1), null, 'single use');

    // Another page opened, another login stored, or a different role in the hint: nothing.
    requests.length = 0;
    m.startMatchesPrefetch('/main/messages');
    login('owner-b'); m.startMatchesPrefetch('/main/matches');
    assert.deepEqual(requests, []);
    values.delete('carezaar.accessToken'); values.set('carezaar.sessionOwner', 'owner-a'); m.startMatchesPrefetch('/main/matches');
    assert.deepEqual(requests, [], 'no stored session');

    // Caregiver hint uses the caregiver list.
    login('owner-c'); m.rememberRole('owner-c', 'caregiver'); m.startMatchesPrefetch('/main/matches');
    assert.deepEqual(requests, ['GET /api/caregivers/matches?sort=distance&page=1&perPage=10']);
    // Wrong role, sort or page is refused (and the early page is dropped).
    assert.equal(m.takeMatchesPrefetch('client', 'distance', 1), null);
    m.startMatchesPrefetch('/main/matches');
    assert.equal(m.takeMatchesPrefetch('caregiver', 'salary', 1), null);
    m.startMatchesPrefetch('/main/matches');
    assert.equal(m.takeMatchesPrefetch('caregiver', 'distance', 2), null);

    // Login replaced after it started (another tab): refused.
    m.startMatchesPrefetch('/main/matches');
    values.set('carezaar.sessionOwner', 'owner-d');
    assert.equal(m.takeMatchesPrefetch('caregiver', 'distance', 1), null);

    // Older than 20 s: refused.
    values.set('carezaar.sessionOwner', 'owner-c');
    m.startMatchesPrefetch('/main/matches');
    offset += 20_001;
    assert.equal(m.takeMatchesPrefetch('caregiver', 'distance', 1), null);

    // Invalid hints are ignored.
    m.rememberRole(null, 'client'); m.rememberRole('owner-c', 'admin');
    assert.equal(JSON.parse(values.get('carezaar.roleHint')).role, 'caregiver');
    assert.ok(requests.every(r => r.startsWith('GET ')), 'reads only');
    // Let the started requests settle while the fixture window still exists.
    await new Promise(resolve => setTimeout(resolve, 100));
  } finally {
    globalThis.fetch = previousFetch; Date.now = previousNow;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
});
