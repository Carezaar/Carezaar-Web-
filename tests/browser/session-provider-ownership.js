/** Built-app regression for late healthy user responses after real cross-tab storage changes.
 * Uses fresh isolated contexts and synthetic fixtures only. Owns/closes its contexts;
 * the caller owns browser launch/close and evidence output. No actual account login/logout.
 */
const tableNames = ['careconditions', 'caredays', 'carespecials', 'certifications', 'clienttypes', 'commutes', 'contents', 'countries', 'experiences', 'genders', 'issuetypes', 'languageskills', 'reasons', 'roles', 'shifts', 'subjects', 'worktypes'];
const extraNames = ['states', 'media', 'faqs', 'faq_categories'];
const cache = { tsCache: 10, tables: Object.fromEntries(tableNames.map(name => [name, [{ id: 1, code: 'synthetic', translations: [] }]])), extras: Object.fromEntries(extraNames.map(name => [name, [{ id: 1, slug: 'synthetic', translations: [] }]])), languages: [{ id: 1, code: 'en', name: 'English', is_default: true, is_rtl: false }] };
const old = { access_token: 'synthetic-old-access', refresh_token: 'synthetic-old-refresh' }, newer = { access_token: 'synthetic-new-access', refresh_token: 'synthetic-new-refresh' };
const currentUser = { id: 'synthetic-current-user', role: 'caregiver', email: 'synthetic@example.test', first_name: 'Synthetic', last_name: 'Current', photo: null, date_of_birth: null, gender_id: null };
const oldUser = { ...currentUser, id: 'synthetic-old-user', first_name: 'Synthetic', last_name: 'Old' };
const fixture = (result, status = 200, meta = null) => ({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ result, message: 'Synthetic response', errors: null, meta }) });

export async function runSessionProviderOwnership(browser, {
  origin = 'http://localhost:4419', api = 'https://new.carezaar.com',
  engine = 'caller-supplied', widths = [390, 1440], onUpdate = () => {}, onScreenshot,
} = {}) {
  const probe = origin + '/__qa_late_info_storage_probe__';
  const records = [], save = () => onUpdate(records);
    for (const width of widths) for (const transition of ['clear', 'replacement']) {
      let context, page, other, release, timer, expired = false;
      const r = { engine, version: browser.version(), headless: true, width, transition, scope: 'Controlled pending healthy auth/info cross-tab fixture; not an actual login/logout or renewal', status: 'IN PROGRESS', checks: [], counts: { refresh: 0, infoOld: 0, infoNew: 0, matchesOld: 0, matchesNew: 0, notificationCountOld: 0, notificationCountNew: 0 }, unexpectedMutations: 0, unexpectedRequests: 0, callbackErrors: 0, pageErrors: 0, realApiForwarded: 0, realStorageEvents: 0, contextClosed: false, browserClosed: false, screenshots: [] };
      records.push(r); save();
      const assert = (ok, code) => { if (!ok) { const e = new Error(code); e.qaCode = code; throw e; } };
      const add = (name, predicates) => { r.checks.push({ case: name, status: Object.values(predicates).every(Boolean) ? 'PASS' : 'FAIL', predicates }); save(); };
      const snap = () => page.evaluate(({ newer }) => ({ clear: localStorage.getItem('carezaar.accessToken') === null && localStorage.getItem('carezaar.refreshToken') === null, newer: localStorage.getItem('carezaar.accessToken') === newer.access_token && localStorage.getItem('carezaar.refreshToken') === newer.refresh_token }), { newer });
      try {
        context = await browser.newContext({ viewport: { width, height: 1000 }, storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: 'carezaar.accessToken', value: old.access_token }, { name: 'carezaar.refreshToken', value: old.refresh_token }, { name: 'carezaar.baseData.v3', value: JSON.stringify(cache) }, { name: 'carezaar.languageCode', value: 'en' }, { name: 'carezaar.languageId', value: '1' }] }] } });
        let signalInfo;
        const infoStarted = new Promise(resolve => { signalInfo = resolve; });
        const held = new Promise(resolve => { release = resolve; });
        await context.route('**/*', async route => {
          try {
            const req = route.request(), u = new URL(req.url()), method = req.method(), bearer = req.headers().authorization;
            if (u.origin === origin && u.pathname === '/__qa_late_info_storage_probe__' && method === 'GET') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Owned synthetic storage probe</title>' });
            if (u.origin === origin && !u.pathname.startsWith('/api/') && ['GET', 'HEAD'].includes(method)) return route.continue();
            if (u.origin !== api) { r.unexpectedRequests++; save(); return route.abort('blockedbyclient'); }
            if (method === 'OPTIONS' && ['/api/auth/info', '/api/base/info', '/api/caregivers/matches', '/api/users/notifications/count'].includes(u.pathname)) return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'authorization, accept, accept-language, content-type' } });
            if (!['GET', 'HEAD'].includes(method)) { r.unexpectedMutations++; save(); return route.abort('blockedbyclient'); }
            if (method !== 'GET') { r.unexpectedRequests++; save(); return route.abort('blockedbyclient'); }
            if (u.pathname === '/api/base/info' && u.searchParams.get('ts_cache') === '0' && [...u.searchParams.keys()].length === 1 && !bearer) return route.fulfill(fixture({ ts_cache: 10 }));
            if (u.pathname === '/api/auth/info' && !u.search) {
              if (bearer === 'Bearer ' + old.access_token && r.counts.infoOld === 0) { r.counts.infoOld++; save(); signalInfo(); await held; return route.fulfill(fixture(oldUser)); }
              if (transition === 'replacement' && bearer === 'Bearer ' + newer.access_token && r.counts.infoNew === 0) { r.counts.infoNew++; return route.fulfill(fixture(currentUser)); }
            }
            // Serve only known synthetic reads even if stale state is painted: observe product-state predicates, not an artificial guard failure.
            if (bearer === 'Bearer ' + old.access_token || (transition === 'clear' && !bearer) || (transition === 'replacement' && bearer === 'Bearer ' + newer.access_token)) {
              const owner = bearer === 'Bearer ' + newer.access_token ? 'New' : 'Old';
              if (u.pathname === '/api/caregivers/matches' && u.searchParams.get('sort') === 'distance' && u.searchParams.get('page') === '1' && u.searchParams.get('perPage') === '10' && [...u.searchParams.keys()].length === 3) { r.counts['matches' + owner]++; return route.fulfill(fixture([], 200, { current_page: 1, last_page: 1, per_page: 10, total: 0 })); }
              if (u.pathname === '/api/users/notifications/count' && u.searchParams.has('checked_at') && [...u.searchParams.keys()].length === 1) { r.counts['notificationCount' + owner]++; return route.fulfill(fixture(0)); }
            }
            r.unexpectedRequests++; save(); return route.abort('blockedbyclient');
          } catch { r.callbackErrors++; save(); try { await route.abort('failed'); } catch { /* Status only. */ } }
        });
        page = await context.newPage(); page.on('pageerror', () => { r.pageErrors++; save(); });
        await page.addInitScript(() => { window.__qaTrustedStorageEvents = 0; window.addEventListener('storage', event => { if (event.isTrusted && event.key === 'carezaar.accessToken') window.__qaTrustedStorageEvents++; }); });
        await page.goto(origin + '/main/matches', { waitUntil: 'domcontentloaded' });
        timer = setTimeout(() => { expired = true; release(); }, 15000);
        await Promise.race([infoStarted, new Promise((_, reject) => setTimeout(() => reject(new Error('Held info fixture prerequisite')), 5000))]);
        other = await context.newPage(); await other.goto(probe, { waitUntil: 'domcontentloaded' });
        await other.evaluate(({ transition, newer }) => { if (transition === 'clear') { localStorage.removeItem('carezaar.accessToken'); localStorage.removeItem('carezaar.refreshToken'); } else { localStorage.setItem('carezaar.accessToken', newer.access_token); localStorage.setItem('carezaar.refreshToken', newer.refresh_token); } }, { transition, newer });
        await page.waitForFunction(() => window.__qaTrustedStorageEvents >= 1, null, { timeout: 5000 });
        if (transition === 'clear') await page.waitForURL('**/intro', { timeout: 10000 });
        else {
          await page.locator('.main-shell').waitFor({ state: 'visible', timeout: 10000 });
          const profile = page.locator('a[href="/main/profile"]:visible'); assert(await profile.count() === 1, 'UNIQUE_PROFILE_LINK'); await profile.click();
          await page.locator('.profile-card h2').waitFor({ state: 'visible', timeout: 5000 });
          assert((await page.locator('.profile-card h2').innerText()).trim() === 'Synthetic Current', 'NEW_IDENTITY_PRERELEASE');
        }
        assert(!expired, 'HELD_FIXTURE_DEADLINE');
        const before = await snap();
        add('Real cross-tab storage transition occurs before old200 release', { trustedStorageEvent: await page.evaluate(() => window.__qaTrustedStorageEvents >= 1), pairExact: transition === 'clear' ? before.clear : before.newer, oneOldInfo: r.counts.infoOld === 1, noRefresh: r.counts.refresh === 0, currentStateReady: transition === 'clear' ? new URL(page.url()).pathname === '/intro' : (await page.locator('.profile-card h2').innerText()).trim() === 'Synthetic Current' });
        const responseWait = page.waitForResponse(response => response.request().method() === 'GET' && response.url() === api + '/api/auth/info' && response.request().headers().authorization === 'Bearer ' + old.access_token, { timeout: 5000 }).then(response => response, () => null);
        release(); clearTimeout(timer); timer = null;
        const oldResponse = await responseWait;
        assert(oldResponse && oldResponse.status() === 200 && (await oldResponse.finished()) === null, 'OLD_INFO_RESPONSE_NOT_COMPLETED');
        // Observe subsequent normal React/network settlement, not a direct loader call.
        await page.waitForTimeout(750);
        const after = await snap();
        add('Healthy old info completion preserves the current token pair', { old200Completed: Boolean(oldResponse), pairPreserved: transition === 'clear' ? after.clear : after.newer, noRefresh: r.counts.refresh === 0, zeroUnexpected: r.unexpectedMutations === 0 && r.unexpectedRequests === 0 });
        if (transition === 'clear') {
          add('Cleared app remains Intro', { intro: new URL(page.url()).pathname === '/intro', noAuthenticatedShell: await page.locator('.main-shell').count() === 0, noNewInfo: r.counts.infoNew === 0 });
        } else {
          const headings = page.locator('.profile-card h2');
          add('Replacement identity remains in actual Profile after old healthy response', { currentIdentityRendered: await headings.count() === 1 && (await headings.innerText()).trim() === 'Synthetic Current', noOldIdentity: await page.getByText('Synthetic Old', { exact: true }).count() === 0, currentInfoResolvedOnce: r.counts.infoNew === 1, newRoleListLoaded: r.counts.matchesNew >= 1 });
        }
        r.realStorageEvents = await page.evaluate(() => window.__qaTrustedStorageEvents);
        if (onScreenshot) r.screenshots.push(await onScreenshot(page, { engine, width, transition }));
        r.status = r.checks.every(row => row.status === 'PASS') && !r.pageErrors && !r.callbackErrors ? 'PASS' : 'FAIL'; save();
      } catch (error) { r.errorName = ['Error', 'TimeoutError', 'TypeError'].includes(error?.name) ? error.name : 'OtherError'; r.interruptionCode = /^[A-Z0-9_]+$/.test(error?.qaCode || '') ? error.qaCode : 'SANITIZED_HARNESS_INTERRUPTION'; save(); }
      finally { release?.(); if (timer) clearTimeout(timer); if (context) { try { await context.close(); r.contextClosed = true; } catch { r.cleanupInterrupted = true; } } if (r.unexpectedMutations || r.unexpectedRequests) r.status = 'FAIL'; else if (r.cleanupInterrupted || r.callbackErrors || r.pageErrors) r.status = 'IN PROGRESS'; save(); }
    }
  return records;
}
