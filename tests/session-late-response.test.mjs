import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

// The real public client/service/store code, with no real network or browser state.
const repo = fileURLToPath(new URL('../', import.meta.url));
const built = buildSync({ stdin: { contents: 'export {api,retryRenewal,clearConnectionProblem} from "./src/api/client.ts";export {tokenStore} from "./src/api/session.ts";export {authService} from "./src/api/services.ts";', resolveDir: repo, sourcefile: 'late-session-test.ts', loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false, treeShaking: true });
const { api, retryRenewal, clearConnectionProblem, tokenStore, authService } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const old = { access_token: 'synthetic-old-access', refresh_token: 'synthetic-old-refresh' };
const late = { access_token: 'synthetic-late-access', refresh_token: 'synthetic-late-refresh' };
const newer = { access_token: 'synthetic-current-access', refresh_token: 'synthetic-current-refresh' };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const json = (result, status = 200) => new Response(JSON.stringify({ result, meta: null, message: 'Synthetic response', errors: null }), { status, headers: { 'Content-Type': 'application/json' } });

async function scenario({ transition, responseKind, holdBody = false, originalRead = false }) {
  const previousFetch = globalThis.fetch, previousWindow = globalThis.window;
  const storage = new Map(), problemEvents = [], refreshSeen = deferred(), bodySeen = deferred(), header = deferred();
  let streamController, pending, deadline, unknown = 0;
  const counts = { refresh: 0, login: 0, read: 0 };
  const win = new EventTarget();
  Object.assign(win, { setTimeout, clearTimeout, localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) } });
  win.addEventListener('carezaar:connection-problem', event => problemEvents.push(event.detail));
  let delivered = false;
  const deliver = () => {
    if (delivered) return;
    delivered = true;
    if (responseKind === 'network') { header.reject(new TypeError('Synthetic network failure')); return; }
    const payload = responseKind === 'malformed' ? '{' : JSON.stringify({ result: responseKind === 'missing-token' ? { access_token: late.access_token } : late, meta: null, errors: null });
    if (holdBody) {
      streamController.enqueue(new TextEncoder().encode(payload)); streamController.close();
    } else header.resolve(responseKind === 'refusal403' ? json(null, 403) : new Response(payload, { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };
  try {
    globalThis.window = win;
    globalThis.fetch = async (url, init = {}) => {
      const u = new URL(url), headers = new Headers(init.headers), form = new URLSearchParams(init.body || '');
      if (u.origin !== 'https://new.carezaar.com' || u.search !== '') { unknown++; throw new Error('Unexpected fixture route'); }
      if (u.pathname === '/api/auth/refresh' && init.method === 'PUT') {
        counts.refresh++;
        const keys = [...form.keys()];
        if (counts.refresh !== 1 || keys.length !== 1 || keys[0] !== 'version_app' || form.get('version_app') !== '1.0.0' || headers.get('authorization') !== 'Bearer ' + old.refresh_token) { unknown++; throw new Error('Unexpected synthetic refresh contract'); }
        refreshSeen.resolve();
        if (holdBody) {
          const response = new Response(new ReadableStream({ start(controller) { streamController = controller; } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          const realJSON = response.json.bind(response);
          response.json = () => { bodySeen.resolve(); return realJSON(); };
          return response;
        }
        return header.promise;
      }
      if (u.pathname === '/api/auth/login' && init.method === 'POST' && transition === 'login') {
        counts.login++;
        const allowed = ['email', 'password', 'version_app', 'os', 'version_os', 'browser', 'version_browser'];
        if (counts.login !== 1 || ![...form.keys()].every(k => allowed.includes(k)) || form.get('email') !== 'synthetic@example.test' || form.get('password') !== 'Synthetic7!' || headers.has('authorization')) { unknown++; throw new Error('Unexpected synthetic login contract'); }
        return json(newer);
      }
      if (originalRead && u.pathname === '/api/users/notifications/count' && init.method === 'GET') {
        counts.read++;
        if (counts.read !== 1 || headers.get('authorization') !== 'Bearer ' + old.access_token) { unknown++; throw new Error('Unexpected original read or replay'); }
        return json(null, 403);
      }
      unknown++; throw new Error('Unknown request cannot reach a network');
    };
    clearConnectionProblem(); tokenStore.clear(); tokenStore.save(old);
    pending = (originalRead ? api.send({ method: 'GET', path: 'users/notifications/count' }) : retryRenewal()).then(value => ({ fulfilled: true, value }), () => ({ fulfilled: false }));
    await Promise.race([holdBody ? bodySeen.promise : refreshSeen.promise, new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Synthetic fixture prerequisite timed out')), 3000); })]);
    clearTimeout(deadline);
    if (transition === 'clear') { tokenStore.clear(); clearConnectionProblem(); }
    if (transition === 'login') await authService.login('synthetic@example.test', 'Synthetic7!');
    const expected = transition === 'clear' ? null : transition === 'login' ? newer : late;
    if (transition === 'clear') assert.ok(tokenStore.accessToken === null && tokenStore.refreshToken === null, 'fixture cleared the session before the old settlement');
    if (transition === 'login') assert.ok(tokenStore.accessToken === newer.access_token && tokenStore.refreshToken === newer.refresh_token, 'public login installed its newer pair before the old settlement');
    deliver();
    const result = await pending;
    assert.ok(expected === null ? tokenStore.accessToken === null && tokenStore.refreshToken === null : tokenStore.accessToken === expected.access_token && tokenStore.refreshToken === expected.refresh_token, 'old renewal must not resurrect cleared credentials or overwrite/expire a newer login');
    assert.equal(counts.refresh, 1);
    assert.equal(counts.login, transition === 'login' ? 1 : 0);
    assert.equal(unknown, 0);
    if (originalRead) {
      assert.equal(result.fulfilled, false, 'cancelled session read must not succeed');
      assert.equal(counts.read, 1, 'no stale read replay after logout');
      assert.equal(problemEvents.includes(true), false, 'a stale network result must not reopen Connection Problem after logout');
    }
  } finally {
    // Settle the fixture before restoring globals, even when an assertion fails.
    if (deadline) clearTimeout(deadline);
    if (!delivered) {
      if (holdBody && !streamController) { header.resolve(json(late)); delivered = true; }
      else deliver();
    }
    if (pending) await pending;
    clearConnectionProblem();
    globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

for (const transition of ['clear', 'login']) {
  for (const responseKind of ['success200', 'refusal403', 'network']) {
    test(`pending refresh ${responseKind} cannot replace ${transition} transition`, { concurrency: false, timeout: 10000 }, () => scenario({ transition, responseKind }));
  }
  for (const responseKind of ['success200', 'malformed', 'missing-token']) {
    test(`refresh body ${responseKind} cannot replace ${transition} transition`, { concurrency: false, timeout: 10000 }, () => scenario({ transition, responseKind, holdBody: true }));
  }
}
test('an unchanged session still accepts its healthy renewal', { concurrency: false, timeout: 10000 }, () => scenario({ transition: 'none', responseKind: 'success200' }));
test('late refresh network failure does not reopen Connection Problem after clearing', { concurrency: false, timeout: 10000 }, () => scenario({ transition: 'clear', responseKind: 'network', originalRead: true }));
