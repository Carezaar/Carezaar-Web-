/** Moving between tabs must not poll users/notifications/count again (Android polls once
 *  at start and every 30 s). Before the fix every route change restarted the poll: one
 *  extra request per navigation and a reset timer. Built app, synthetic session and API
 *  responses; nothing reaches the real API and nothing is written. */
const names = ['careconditions', 'caredays', 'carespecials', 'certifications', 'clienttypes', 'commutes', 'contents', 'countries', 'experiences', 'genders', 'issuetypes', 'languageskills', 'reasons', 'roles', 'shifts', 'subjects', 'worktypes'];
const cache = { tsCache: 10, tables: Object.fromEntries(names.map((n) => [n, [{ id: 1, code: 'synthetic', translations: [] }]])), extras: Object.fromEntries(['states', 'media', 'faqs', 'faq_categories'].map((n) => [n, []])), languages: [{ id: 1, code: 'en', name: 'English', is_default: true, is_rtl: false }] };

export async function runNotificationPollNavigation(browser, { origin = 'http://localhost:4422', api = 'https://new.carezaar.com', width = 390 } = {}) {
  const r = { engine: browser.browserType().name(), width, polls: 0, navigations: 0, unknown: [], pageErrors: 0, status: 'IN PROGRESS' };
  const context = await browser.newContext({ viewport: { width, height: 900 }, storageState: { cookies: [], origins: [{ origin, localStorage: [
    { name: 'carezaar.accessToken', value: 'synthetic-nav-access' }, { name: 'carezaar.refreshToken', value: 'synthetic-nav-refresh' },
    { name: 'carezaar.sessionOwner', value: 'synthetic-nav-owner' }, { name: 'carezaar.baseData.v3', value: JSON.stringify(cache) },
    { name: 'carezaar.languageId', value: '1' }, { name: 'carezaar.languageCode', value: 'en' },
  ] }] } });
  try {
    const ok = (route, result, meta = null) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ result, message: 'Synthetic response', errors: null, meta }) });
    const empty = { current_page: 1, last_page: 1, per_page: 10, total: 0 };
    await context.route('**/*', async (route) => {
      const q = route.request(), u = new URL(q.url());
      if (u.origin === origin) return route.continue();
      if (u.origin !== api) return route.abort('blockedbyclient');
      if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,OPTIONS', 'access-control-allow-headers': 'authorization,accept,accept-language,content-type' } });
      if (q.method() !== 'GET') { r.unknown.push(`${q.method()} ${u.pathname}`); return route.abort('blockedbyclient'); }
      if (u.pathname === '/api/base/info') return ok(route, { ts_cache: 10 });
      if (u.pathname === '/api/auth/info') return ok(route, { id: 'synthetic-nav', role: 'client', first_name: 'Synthetic', last_name: 'Navigation', email: 'nav@example.test', photo: null, date_of_birth: null });
      if (u.pathname === '/api/users/notifications/count') { r.polls++; return ok(route, 0); }
      if (/^\/api\/(clients|caregivers)\/(matches|chats|bookmarks)/.test(u.pathname) || u.pathname === '/api/users/chats') return ok(route, [], empty);
      if (u.pathname.startsWith('/api/clients/') || u.pathname.startsWith('/api/users/')) return ok(route, [], empty);
      r.unknown.push(`GET ${u.pathname}`); return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    page.on('pageerror', () => r.pageErrors++);
    await page.goto(origin + '/main/matches', { waitUntil: 'domcontentloaded' });
    await page.locator('.main-shell').waitFor({ timeout: 15000 });
    for (let i = 0; i < 100 && r.polls === 0; i++) await page.waitForTimeout(50);
    r.pollsAtStart = r.polls;
    for (const path of ['/main/messages', '/main/profile', '/main/matches', '/main/messages', '/main/profile']) {
      await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, path);
      await page.waitForTimeout(700); r.navigations++;
    }
    r.pollsAfterNavigation = r.polls;
    r.status = r.pollsAtStart === 1 && r.pollsAfterNavigation === 1 && r.navigations === 5 && r.pageErrors === 0 ? 'PASS' : 'FAIL';
  } catch (e) {
    r.error = String(e?.message ?? e).slice(0, 200);
  } finally {
    await context.close();
  }
  return r;
}
