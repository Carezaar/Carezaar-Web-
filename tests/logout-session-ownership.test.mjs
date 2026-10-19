import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
// Exercise exported services/store/client, not a duplicate implementation. Every fetch is synthetic.
const built = buildSync({ stdin: { contents: 'export {authService} from "./src/api/services.ts";export {tokenStore} from "./src/api/session.ts";export {api,clearConnectionProblem} from "./src/api/client.ts";', resolveDir: repo, sourcefile: 'logout-ownership-test.ts', loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false, treeShaking: true });
const { authService, tokenStore, api, clearConnectionProblem } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const old = { access_token: 'synthetic-old-access', refresh_token: 'synthetic-old-refresh' };
const newer = { access_token: 'synthetic-new-access', refresh_token: 'synthetic-new-refresh' };
const renewed = { access_token: 'synthetic-renewed-access', refresh_token: 'synthetic-renewed-refresh' };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const json = (result, status = 200) => new Response(JSON.stringify({ result, meta: null, message: 'Synthetic response', errors: null }), { status, headers: { 'content-type': 'application/json' } });
const empty = () => new Response(null, { status: 204 });
const pairIs = pair => pair === null ? tokenStore.accessToken === null && tokenStore.refreshToken === null : tokenStore.accessToken === pair.access_token && tokenStore.refreshToken === pair.refresh_token;

async function scenario({ legacy = false, initialEmpty = false, hold = null, answer = 'success', replace = false, generic = false, ownRefusal = false }) {
  const previousFetch = globalThis.fetch, previousWindow = globalThis.window;
  const storage = new Map(), win = new EventTarget(), started = deferred(), release = deferred();
  const counts = { oldLogout: 0, newLogout: 0, renewedLogout: 0, emptyLogout: 0, login: 0, refresh: 0, oldRead: 0, newRead: 0, unknown: 0 };
  const events = [];
  let pending, timer, bodyController, delivered = false;
  Object.assign(win, { setTimeout, clearTimeout, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) } });
  win.addEventListener('carezaar:connection-problem', event => events.push(event.detail));
  function deliver() {
    if (delivered) return;
    delivered = true;
    if (hold === 'refresh-body' && bodyController) { bodyController.enqueue(new TextEncoder().encode(JSON.stringify({ result: renewed, meta: null, message: 'Synthetic response', errors: null }))); bodyController.close(); }
    else release.resolve(answer === 'refusal' ? json(null, 403) : answer === 'network' ? Promise.reject(new TypeError('Synthetic offline')) : hold?.startsWith('refresh') ? json(renewed) : empty());
  }
  try {
    globalThis.window = win;
    globalThis.fetch = async (input, init = {}) => {
      const u = new URL(String(input)), headers = new Headers(init.headers), method = init.method, form = new URLSearchParams(init.body || '');
      const unknown = () => { counts.unknown++; throw new Error('Unknown synthetic request cannot reach a network'); };
      if (u.origin !== 'https://new.carezaar.com' || u.search) return unknown();
      if (u.pathname === '/api/auth/login' && method === 'POST' && replace) {
        const allowed = ['email', 'password', 'version_app', 'os', 'version_os', 'browser', 'version_browser'];
        if (counts.login || headers.has('authorization') || ![...form.keys()].every(key => allowed.includes(key)) || form.get('email') !== 'synthetic@example.test' || form.get('password') !== 'Synthetic7!' || form.get('version_app') !== '1.0.0') return unknown();
        counts.login++; return json(newer);
      }
      if (generic && u.pathname === '/api/users/notifications/count' && method === 'GET') {
        if (headers.get('authorization') === 'Bearer ' + old.access_token && !counts.oldRead) { counts.oldRead++; started.resolve(); return release.promise; }
        if (headers.get('authorization') === 'Bearer ' + newer.access_token && !counts.newRead) { counts.newRead++; return json(7); }
        return unknown();
      }
      if (u.pathname === '/api/auth/logout' && method === 'DELETE' && !init.body && !generic) {
        const bearer = headers.get('authorization');
        if (!bearer && initialEmpty && !counts.emptyLogout) { counts.emptyLogout++; if (hold === 'logout') { started.resolve(); return release.promise; } return json(null, 403); }
        if (bearer === 'Bearer ' + old.access_token && !counts.oldLogout) {
          counts.oldLogout++;
          if (hold === 'logout') { started.resolve(); return release.promise; }
          if (ownRefusal || hold?.startsWith('refresh')) return json(null, 401);
          return empty();
        }
        // Allow the red product's unsafe replay to settle, then assert that it never occurred.
        if (bearer === 'Bearer ' + newer.access_token && !counts.newLogout) { counts.newLogout++; return empty(); }
        if (bearer === 'Bearer ' + renewed.access_token && !counts.renewedLogout) { counts.renewedLogout++; return empty(); }
        return unknown();
      }
      if (u.pathname === '/api/auth/refresh' && method === 'PUT' && !counts.refresh && headers.get('authorization') === 'Bearer ' + old.refresh_token && [...form.keys()].join(',') === 'version_app' && form.get('version_app') === '1.0.0') {
        counts.refresh++;
        if (hold === 'refresh-body') {
          const response = new Response(new ReadableStream({ start(controller) { bodyController = controller; } }), { status: 200, headers: { 'content-type': 'application/json' } });
          const realJSON = response.json.bind(response); response.json = () => { started.resolve(); return realJSON(); }; return response;
        }
        if (hold === 'refresh') { started.resolve(); return release.promise; }
        return json(renewed);
      }
      return unknown();
    };
    clearConnectionProblem(); tokenStore.clear();
    if (legacy) {
      // A real pre-stamp storage shape: only the existing two token keys, no future-key assumptions.
      storage.set('carezaar.accessToken', old.access_token); storage.set('carezaar.refreshToken', old.refresh_token);
      assert.equal(storage.size, 2);
    } else if (!initialEmpty) tokenStore.save(old);
    pending = (generic ? api.send({ method: 'GET', path: 'users/notifications/count' }) : authService.logout()).then(value => ({ fulfilled: true, value }), () => ({ fulfilled: false }));
    if (hold || generic) {
      await Promise.race([started.promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Synthetic prerequisite timed out')), 3000); })]); clearTimeout(timer);
      if (replace) { await authService.login('synthetic@example.test', 'Synthetic7!'); assert.ok(pairIs(newer), 'new public login is installed before the old settlement'); }
      if (generic) { delivered = true; release.resolve(json(null, 403)); } else deliver();
    }
    const settled = await pending;
    assert.equal(counts.unknown, 0, 'all requests were exact synthetic contracts; none was forwarded');
    assert.ok(pairIs(replace ? newer : null), 'a completed new sign-in must survive an older logout, while an owned logout clears its own session');
    assert.equal(counts.newLogout, 0, 'the old logout must never be dispatched with the new identity Bearer');
    assert.equal(counts.login, replace ? 1 : 0);
    assert.equal(events.includes(true), false, 'superseded logout must not reopen Connection Problem');
    if (generic) {
      assert.deepEqual([counts.oldRead, counts.newRead, counts.refresh], [1, 1, 0]); assert.equal(settled.value, 7, 'generic other-action replacement replay remains the existing policy');
    } else {
      assert.equal(counts.oldLogout, initialEmpty ? 0 : 1); assert.equal(counts.emptyLogout, initialEmpty ? 1 : 0);
      assert.equal(counts.renewedLogout, ownRefusal ? 1 : 0, 'same-owner renewal still replays logout exactly once');
      assert.equal(counts.refresh, ownRefusal || hold?.startsWith('refresh') ? 1 : 0);
      if (!initialEmpty) assert.equal(settled.fulfilled, true, 'healthy or superseded best-effort logout settles without exposing a stale refusal');
    }
  } finally {
    clearTimeout(timer);
    if (!delivered) { if (hold === 'refresh-body' && !bodyController) release.resolve(json(renewed)); else deliver(); }
    if (pending) await pending;
    clearConnectionProblem(); globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
}

const options = { concurrency: false, timeout: 10000 };
test('healthy current logout clears its own tokens once', options, () => scenario({}));
test('own 401 renewal preserves logical ownership until logout completes', options, () => scenario({ ownRefusal: true }));
for (const answer of ['success', 'refusal', 'network']) test(`late logout ${answer} cannot clear or delete a newer public login`, options, () => scenario({ hold: 'logout', replace: true, answer }));
for (const hold of ['refresh', 'refresh-body']) test(`logout held ${hold} cannot replay under a newer public login`, options, () => scenario({ hold, replace: true }));
test('generic refused read still replays under the newer identity', options, () => scenario({ generic: true, replace: true }));
test('legacy unstamped token pair still supports owned renewal and logout', options, () => scenario({ legacy: true, ownRefusal: true }));
test('already empty logout does not renew or acquire credentials', options, () => scenario({ initialEmpty: true }));
for (const answer of ['success', 'refusal']) test(`empty-owner late ${answer} cannot clear or delete a new login`, options, () => scenario({ initialEmpty: true, hold: 'logout', replace: true, answer }));

test('new public login rejects when its owner cannot persist and leaves the existing session intact', options, async () => {
  const previousFetch = globalThis.fetch, previousWindow = globalThis.window;
  const storage = new Map(), win = new EventTarget(); let rejectOwnerWrite = false, requests = 0;
  Object.assign(win, { setTimeout, clearTimeout, localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem(key, value) { if (rejectOwnerWrite && key === 'carezaar.sessionOwner') throw new DOMException('Synthetic storage full', 'QuotaExceededError'); storage.set(key, String(value)); },
    removeItem: key => storage.delete(key),
  } });
  try {
    globalThis.window = win;
    globalThis.fetch = async (input, init = {}) => {
      const u = new URL(String(input)), headers = new Headers(init.headers), form = new URLSearchParams(init.body || '');
      assert.equal(u.href, 'https://new.carezaar.com/api/auth/login'); assert.equal(init.method, 'POST'); assert.equal(headers.has('authorization'), false);
      assert.equal(form.get('email'), 'synthetic@example.test'); assert.equal(form.get('password'), 'Synthetic7!'); assert.equal(form.get('version_app'), '1.0.0');
      assert.equal(++requests, 1, 'one exact synthetic public login, no real request'); return json(newer);
    };
    clearConnectionProblem(); tokenStore.save(old);
    const before = { pair: [...[tokenStore.accessToken, tokenStore.refreshToken]], owner: storage.get('carezaar.sessionOwner') };
    assert.ok(before.owner, 'baseline has a persisted logical owner'); rejectOwnerWrite = true;
    await assert.rejects(authService.login('synthetic@example.test', 'Synthetic7!'), 'login must fail before installing tokens under an old owner');
    assert.deepEqual([tokenStore.accessToken, tokenStore.refreshToken], before.pair, 'failed owner installation preserves the old credential pair');
    assert.equal(storage.get('carezaar.sessionOwner'), before.owner, 'failed owner installation preserves the old logical owner'); assert.equal(requests, 1);
  } finally {
    clearConnectionProblem(); globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
});
