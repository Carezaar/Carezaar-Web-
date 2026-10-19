/** SOURCE-ONLY proposal: actual synthetic UI SignIn currentUser callback ownership.
 * Uses fresh isolated contexts and synthetic fixtures only. Owns/closes its contexts;
 * the caller owns browser launch/close and evidence output. Only one intercepted synthetic login; no actual account/API forwarding.
 */
const tableNames = ['careconditions', 'caredays', 'carespecials', 'certifications', 'clienttypes', 'commutes', 'contents', 'countries', 'experiences', 'genders', 'issuetypes', 'languageskills', 'reasons', 'roles', 'shifts', 'subjects', 'worktypes'];
const extraNames = ['states', 'media', 'faqs', 'faq_categories'];
const cache = { tsCache: 10, tables: Object.fromEntries(tableNames.map(name => [name, [{ id: 1, code: 'synthetic', translations: [] }]])), extras: Object.fromEntries(extraNames.map(name => [name, [{ id: 1, slug: 'synthetic', translations: [] }]])), languages: [{ id: 1, code: 'en', name: 'English', is_default: true, is_rtl: false }] };
const old = { access_token: 'synthetic-old-access', refresh_token: 'synthetic-old-refresh' }, newer = { access_token: 'synthetic-new-access', refresh_token: 'synthetic-new-refresh' };
const currentUser = { id: 'synthetic-current-user', role: 'caregiver', email: 'synthetic@example.test', first_name: 'Synthetic', last_name: 'Current', photo: null, date_of_birth: null, gender_id: null };
const oldUser = { ...currentUser, id: 'synthetic-old-user', first_name: 'Synthetic', last_name: 'Old' };
const fixture = (result, status = 200, meta = null) => ({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ result, message: 'Synthetic response', errors: null, meta }) });

export async function runSignInInfoOwnership(browser, {
  origin = 'http://localhost:4419', api = 'https://new.carezaar.com',
  engine = 'caller-supplied', widths = [390, 1440], onUpdate = () => {}, onScreenshot,
} = {}) {
  const probe = origin + '/__qa_late_info_storage_probe__';
  const records = [], save = () => onUpdate(records);
    for (const width of widths) for (const transition of ['clear', 'replacement']) for (const outcome of [200, 503]) {
      let context, page, other, release, timer, expired = false;
      const r = { engine, version: browser.version(), headless: true, width, transition, outcome, scope: 'Actual synthetic SignIn UI login then pending currentUser callback and real cross-tab storage change; no real account/API forwarding', status: 'IN PROGRESS', checks: [], counts: { login: 0, refresh: 0, infoOld: 0, infoNew: 0, matchesOld: 0, matchesNew: 0, notificationCountOld: 0, notificationCountNew: 0 }, unexpectedMutations: 0, unexpectedRequests: 0, callbackErrors: 0, pageErrors: 0, realApiForwarded: 0, realStorageEvents: 0, contextClosed: false, browserClosed: false, screenshots: [] };
      records.push(r); save();
      const assert = (ok, code) => { if (!ok) { const e = new Error(code); e.qaCode = code; throw e; } };
      const add = (name, predicates) => { r.checks.push({ case: name, status: Object.values(predicates).every(Boolean) ? 'PASS' : 'FAIL', predicates }); save(); };
      const snap = () => page.evaluate(({ newer }) => ({ clear: localStorage.getItem('carezaar.accessToken') === null && localStorage.getItem('carezaar.refreshToken') === null, newer: localStorage.getItem('carezaar.accessToken') === newer.access_token && localStorage.getItem('carezaar.refreshToken') === newer.refresh_token }), { newer });
      try {
        context = await browser.newContext({ viewport: { width, height: 1000 }, storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: 'carezaar.baseData.v3', value: JSON.stringify(cache) }, { name: 'carezaar.languageCode', value: 'en' }, { name: 'carezaar.languageId', value: '1' }] }] } });
        let signalInfo;
        const infoStarted = new Promise(resolve => { signalInfo = resolve; });
        const held = new Promise(resolve => { release = resolve; });
        await context.route('**/*', async route => {
          try {
            const req = route.request(), u = new URL(req.url()), method = req.method(), bearer = req.headers().authorization;
            if (u.origin === origin && u.pathname === '/__qa_late_info_storage_probe__' && method === 'GET') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Owned synthetic storage probe</title>' });
            if (u.origin === origin && !u.pathname.startsWith('/api/') && ['GET', 'HEAD'].includes(method)) return route.continue();
            if (u.origin !== api) { r.unexpectedRequests++; save(); return route.abort('blockedbyclient'); }
            if (method === 'OPTIONS' && ['/api/auth/login', '/api/auth/info', '/api/base/info', '/api/caregivers/matches', '/api/users/notifications/count'].includes(u.pathname)) return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'authorization, accept, accept-language, content-type' } });
            if (method === 'POST' && u.pathname === '/api/auth/login' && !u.search && !bearer && r.counts.login === 0) {
              const form = new URLSearchParams(req.postData() || ''), allowed = ['email','password','version_app','os','version_os','browser','version_browser'];
              if (form.get('email') === 'synthetic@example.test' && form.get('password') === 'Synthetic7!' && form.get('version_app') === '1.0.0' && [...form.keys()].every(key => allowed.includes(key))) { r.counts.login++; save(); return route.fulfill(fixture(old)); }
            }
            if (!['GET', 'HEAD'].includes(method)) { r.unexpectedMutations++; save(); return route.abort('blockedbyclient'); }
            if (method !== 'GET') { r.unexpectedRequests++; save(); return route.abort('blockedbyclient'); }
            if (u.pathname === '/api/base/info' && u.searchParams.get('ts_cache') === '0' && [...u.searchParams.keys()].length === 1 && !bearer) return route.fulfill(fixture({ ts_cache: 10 }));
            if (u.pathname === '/api/auth/info' && !u.search) {
              if (bearer === 'Bearer ' + old.access_token && r.counts.infoOld === 0) { r.counts.infoOld++; save(); signalInfo(); await held; return route.fulfill(fixture(outcome === 200 ? oldUser : null, outcome)); }
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
        await page.goto(origin + '/sign-in', { waitUntil: 'domcontentloaded' });
        await page.locator('input[type=email]').waitFor({state:'visible',timeout:10000}); await page.locator('.busy-scrim').waitFor({state:'hidden',timeout:10000});
        await page.locator('input[type=email]').fill('synthetic@example.test'); await page.locator('input[type=password]').fill('Synthetic7!');
        await page.getByRole('button',{name:'Sign In',exact:true}).click();
        timer = setTimeout(() => { expired = true; release(); }, 15000);
        await Promise.race([infoStarted, new Promise((_, reject) => setTimeout(() => reject(new Error('Held info fixture prerequisite')), 5000))]);
        other = await context.newPage(); await other.goto(probe, { waitUntil: 'domcontentloaded' });
        await other.evaluate(({ transition, newer }) => { if (transition === 'clear') { localStorage.removeItem('carezaar.accessToken'); localStorage.removeItem('carezaar.refreshToken'); localStorage.removeItem('carezaar.sessionOwner'); } else { localStorage.setItem('carezaar.sessionOwner','synthetic-replacement-owner'); localStorage.setItem('carezaar.accessToken', newer.access_token); localStorage.setItem('carezaar.refreshToken', newer.refresh_token); } }, { transition, newer });
        await page.waitForFunction(() => window.__qaTrustedStorageEvents >= 1, null, { timeout: 5000 });
        if (transition === 'clear') await page.waitForFunction(() => !document.querySelector('.main-shell') && ['/intro','/sign-in'].includes(location.pathname),null,{timeout:5000});
        else {
          await page.locator('.main-shell').waitFor({ state: 'visible', timeout: 10000 });
          assert(r.counts.infoNew === 1, 'NEW_IDENTITY_INFO_PRERELEASE');
        }
        assert(!expired, 'HELD_FIXTURE_DEADLINE');
        const before = await snap();
        add('Real cross-tab transition occurs after one synthetic UI login and before pending currentUser completion', { trustedStorageEvent: await page.evaluate(() => window.__qaTrustedStorageEvents >= 1), pairExact: transition === 'clear' ? before.clear : before.newer, oneUILogin: r.counts.login === 1, oneOldInfo: r.counts.infoOld === 1, noRefresh: r.counts.refresh === 0, currentStateReady: transition === 'clear' ? ['/intro','/sign-in'].includes(new URL(page.url()).pathname) && await page.locator('.main-shell').count() === 0 : await page.locator('.main-shell').count() === 1 && r.counts.infoNew === 1 });
        const responseWait = page.waitForResponse(response => response.request().method() === 'GET' && response.url() === api + '/api/auth/info' && response.request().headers().authorization === 'Bearer ' + old.access_token, { timeout: 5000 }).then(response => response, () => null);
        release(); clearTimeout(timer); timer = null;
        const oldResponse = await responseWait;
        assert(oldResponse && oldResponse.status() === outcome && (await oldResponse.finished()) === null, 'PENDING_SIGNIN_INFO_RESPONSE_NOT_COMPLETED');
        // Observe subsequent normal React/network settlement, not a direct loader call.
        await page.waitForTimeout(750);
        const after = await snap();
        add('Late signIn currentUser completion preserves the current token pair', { pendingInfoCompleted: Boolean(oldResponse), pairPreserved: transition === 'clear' ? after.clear : after.newer, noRefresh: r.counts.refresh === 0, zeroUnexpected: r.unexpectedMutations === 0 && r.unexpectedRequests === 0 });
        if (transition === 'clear') {
          add('Cleared app remains signed out after pending SignIn callback', { publicRoute: ['/intro','/sign-in'].includes(new URL(page.url()).pathname), noAuthenticatedShell: await page.locator('.main-shell').count() === 0, noNewInfo: r.counts.infoNew === 0 });
        } else {
          await page.locator('.busy-scrim').waitFor({state:'hidden',timeout:5000});
          const profile = page.locator('a[href="/main/profile"]:visible'); assert(await profile.count()===1,'UNIQUE_PROFILE_LINK_AFTER_SETTLEMENT'); await profile.click();
          await page.locator('.profile-card h2').waitFor({state:'visible',timeout:5000});
          const headings = page.locator('.profile-card h2');
          add('Replacement identity remains in actual Profile after pending SignIn callback', { currentIdentityRendered: await headings.count() === 1 && (await headings.innerText()).trim() === 'Synthetic Current', noOldIdentity: await page.getByText('Synthetic Old', { exact: true }).count() === 0, currentInfoResolvedOnce: r.counts.infoNew === 1, newRoleListLoaded: r.counts.matchesNew >= 1 });
        }
        r.realStorageEvents = await page.evaluate(() => window.__qaTrustedStorageEvents);
        if (onScreenshot) r.screenshots.push(await onScreenshot(page, { engine, width, transition, outcome }));
        r.status = r.checks.every(row => row.status === 'PASS') && !r.pageErrors && !r.callbackErrors ? 'PASS' : 'FAIL'; save();
      } catch (error) { r.errorName = ['Error', 'TimeoutError', 'TypeError'].includes(error?.name) ? error.name : 'OtherError'; r.interruptionCode = /^[A-Z0-9_]+$/.test(error?.qaCode || '') ? error.qaCode : 'SANITIZED_HARNESS_INTERRUPTION'; save(); }
      finally { release?.(); if (timer) clearTimeout(timer); if (context) { try { await context.close(); r.contextClosed = true; } catch { r.cleanupInterrupted = true; } } if (r.unexpectedMutations || r.unexpectedRequests) r.status = 'FAIL'; else if (r.cleanupInterrupted || r.callbackErrors || r.pageErrors) r.status = 'IN PROGRESS'; save(); }
    }
  return records;
}
