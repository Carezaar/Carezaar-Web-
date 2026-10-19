/** SOURCE-ONLY proposal: actual synthetic UI login response token-save ownership.
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

export async function runPendingLoginOwnership(browser, {
  origin = 'http://localhost:4419', api = 'https://new.carezaar.com',
  engine = 'caller-supplied', widths = [390, 1440], onUpdate = () => {}, onScreenshot,
} = {}) {
  const probe = origin + '/__qa_late_info_storage_probe__';
  const records = [], save = () => onUpdate(records);
    for (const width of widths) for (const transition of ['healthy', 'replacement']) {
      let context, page, other, release, timer, expired = false;
      const r = { engine, version: browser.version(), headless: true, width, transition, scope: 'Actual synthetic SignIn UI pending login response with healthy/newsession boundary; no real account/API forwarding', status: 'IN PROGRESS', checks: [], counts: { login: 0, refresh: 0, infoOld: 0, infoNew: 0, matchesOld: 0, matchesNew: 0, notificationCountOld: 0, notificationCountNew: 0 }, unexpectedMutations: 0, unexpectedRequests: 0, callbackErrors: 0, pageErrors: 0, realApiForwarded: 0, realStorageEvents: 0, contextClosed: false, browserClosed: false, screenshots: [] };
      records.push(r); save();
      const assert = (ok, code) => { if (!ok) { const e = new Error(code); e.qaCode = code; throw e; } };
      const add = (name, predicates) => { r.checks.push({ case: name, status: Object.values(predicates).every(Boolean) ? 'PASS' : 'FAIL', predicates }); save(); };
      const snap = () => page.evaluate(({ newer, old }) => ({ oldPair: localStorage.getItem('carezaar.accessToken')===old.access_token && localStorage.getItem('carezaar.refreshToken')===old.refresh_token, hasOwner: Boolean(localStorage.getItem('carezaar.sessionOwner')), replacementOwner: localStorage.getItem('carezaar.sessionOwner')==='synthetic-replacement-owner', clear: localStorage.getItem('carezaar.accessToken') === null && localStorage.getItem('carezaar.refreshToken') === null, newer: localStorage.getItem('carezaar.accessToken') === newer.access_token && localStorage.getItem('carezaar.refreshToken') === newer.refresh_token }), { newer, old });
      try {
        context = await browser.newContext({ viewport: { width, height: 1000 }, storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: 'carezaar.baseData.v3', value: JSON.stringify(cache) }, { name: 'carezaar.languageCode', value: 'en' }, { name: 'carezaar.languageId', value: '1' }] }] } });
        let signalLogin;
        const loginStarted = new Promise(resolve => { signalLogin = resolve; });
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
              if (form.get('email') === 'synthetic@example.test' && form.get('password') === 'Synthetic7!' && form.get('version_app') === '1.0.0' && [...form.keys()].every(key => allowed.includes(key))) { r.counts.login++; save(); signalLogin(); await held; return route.fulfill(fixture(old)); }
            }
            if (!['GET', 'HEAD'].includes(method)) { r.unexpectedMutations++; save(); return route.abort('blockedbyclient'); }
            if (method !== 'GET') { r.unexpectedRequests++; save(); return route.abort('blockedbyclient'); }
            if (u.pathname === '/api/base/info' && u.searchParams.get('ts_cache') === '0' && [...u.searchParams.keys()].length === 1 && !bearer) return route.fulfill(fixture({ ts_cache: 10 }));
            if (u.pathname === '/api/auth/info' && !u.search) {
              if (bearer === 'Bearer ' + old.access_token && r.counts.infoOld === 0) { r.counts.infoOld++; save(); return route.fulfill(fixture(oldUser)); }
              if (transition === 'replacement' && bearer === 'Bearer ' + newer.access_token && r.counts.infoNew === 0) { r.counts.infoNew++; return route.fulfill(fixture(currentUser)); }
            }
            // Serve only known synthetic reads even if stale state is painted: observe product-state predicates, not an artificial guard failure.
            if (bearer === 'Bearer ' + old.access_token || !bearer || (transition === 'replacement' && bearer === 'Bearer ' + newer.access_token)) {
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
        await Promise.race([loginStarted, new Promise((_, reject) => setTimeout(() => reject(new Error('Held info fixture prerequisite')), 5000))]);
        if(transition==='replacement') {
          other=await context.newPage();await other.goto(probe,{waitUntil:'domcontentloaded'});
          await other.evaluate(({newer})=>{localStorage.setItem('carezaar.sessionOwner','synthetic-replacement-owner');localStorage.setItem('carezaar.accessToken',newer.access_token);localStorage.setItem('carezaar.refreshToken',newer.refresh_token);},{newer});
          await page.waitForFunction(()=>window.__qaTrustedStorageEvents>=1,null,{timeout:5000});
          await page.locator('.main-shell').waitFor({state:'visible',timeout:10000});
          assert(r.counts.infoNew===1,'NEW_IDENTITY_BEFORE_LOGIN_RELEASE');
        }
        const before=await snap();assert(!expired,'HELD_LOGIN_DEADLINE');
        add('Synthetic login is still pending at the current ownership boundary',{onePendingLogin:r.counts.login===1,noOldUserInfo:r.counts.infoOld===0,storageBoundary:transition==='replacement'?await page.evaluate(()=>window.__qaTrustedStorageEvents>=1):await page.evaluate(()=>window.__qaTrustedStorageEvents===0),pairBoundary:transition==='replacement'?before.newer&&before.replacementOwner:before.clear});
        const loginResponse=page.waitForResponse(res=>res.request().method()==='POST'&&res.url()===api+'/api/auth/login',{timeout:5000}).catch(()=>null);
        release();clearTimeout(timer);timer=null;const response=await loginResponse;assert(response&&response.status()===200&&await response.finished()===null,'HELD_LOGIN_RESPONSE_NOT_COMPLETED');
        await page.locator('.busy-scrim').waitFor({state:'hidden',timeout:5000});await page.waitForTimeout(750);
        const after=await snap();add('Late login response respects the current session boundary',{completed200:true,pairPreserved:transition==='replacement'?after.newer:after.oldPair,ownerPreserved:transition==='replacement'?after.replacementOwner:after.hasOwner,oneLogin:r.counts.login===1,noRefresh:r.counts.refresh===0});
        const profile=page.locator('a[href="/main/profile"]:visible');assert(await profile.count()===1,'UNIQUE_CURRENT_PROFILE_ACTION');await profile.click();await page.locator('.profile-card h2').waitFor({state:'visible',timeout:5000});
        const expected=transition==='replacement'?'Synthetic Current':'Synthetic Old';add('Actual current Profile remains correct after login response settlement',{exactCurrentIdentity:(await page.locator('.profile-card h2').innerText()).trim()===expected,zeroUnknown:r.unexpectedRequests===0&&r.unexpectedMutations===0,zeroRuntimeErrors:r.pageErrors===0&&r.callbackErrors===0,noApiForward:r.realApiForwarded===0});
        r.realStorageEvents = await page.evaluate(() => window.__qaTrustedStorageEvents);
        if (onScreenshot) r.screenshots.push(await onScreenshot(page, { engine, width, transition }));
        r.status = r.checks.every(row => row.status === 'PASS') && !r.pageErrors && !r.callbackErrors ? 'PASS' : 'FAIL'; save();
      } catch (error) { r.errorName = ['Error', 'TimeoutError', 'TypeError'].includes(error?.name) ? error.name : 'OtherError'; r.interruptionCode = /^[A-Z0-9_]+$/.test(error?.qaCode || '') ? error.qaCode : 'SANITIZED_HARNESS_INTERRUPTION'; save(); }
      finally { release?.(); if (timer) clearTimeout(timer); if (context) { try { await context.close(); r.contextClosed = true; } catch { r.cleanupInterrupted = true; } } if (r.unexpectedMutations || r.unexpectedRequests) r.status = 'FAIL'; else if (r.cleanupInterrupted || r.callbackErrors || r.pageErrors) r.status = 'IN PROGRESS'; save(); }
    }
  return records;
}
