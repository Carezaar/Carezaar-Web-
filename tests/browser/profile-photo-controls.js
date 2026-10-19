/** Built-app photo selection/crop/preview boundaries. Synthetic images contain
 * only colored rectangles. No Save, real login, upload or API forwarding. */
import { Buffer } from 'node:buffer';
const tables = ['careconditions', 'caredays', 'carespecials', 'certifications', 'clienttypes', 'commutes', 'contents', 'countries', 'experiences', 'genders', 'issuetypes', 'languageskills', 'reasons', 'roles', 'shifts', 'subjects', 'worktypes'];
const cache = { tsCache: 10, tables: Object.fromEntries(tables.map(k => [k, [{ id: 1, code: 'synthetic', translations: [] }]])), extras: Object.fromEntries(['states', 'media', 'faqs', 'faq_categories'].map(k => [k, []])), languages: [{ id: 1, code: 'en', name: 'English', is_default: true, is_rtl: false }] };

export async function runProfilePhotoControls(browser, { engine, origin = 'http://localhost:4419', api = 'https://new.carezaar.com', roles = ['client', 'caregiver'], widths = [390, 768, 1440], onUpdate = () => {}, onScreenshot } = {}) {
  const records = [], save = () => onUpdate(records);
  for (const role of roles) for (const width of widths) {
    let context, page;
    const pair = { access: 'synthetic-photo-access', refresh: 'synthetic-photo-refresh' };
    const r = { engine, version: browser.version(), role, width, status: 'IN PROGRESS', checks: [], infoGET: 0, baseGET: 0, unknownRequests: 0, unexpectedMutations: 0, callbackErrors: 0, pageErrors: 0, consoleErrors: 0, realApiForwarded: 0, contextClosed: false, browserClosed: false, screenshots: [] };
    records.push(r); save();
    const require = (ok, code) => { if (!ok) { const e = Error(code); e.qaCode = code; throw e; } };
    const add = (name, predicates) => { r.checks.push({ case: name, status: Object.values(predicates).every(Boolean) ? 'PASS' : 'FAIL', predicates }); save(); };
    try {
      context = await browser.newContext({ viewport: { width, height: 1000 }, storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: 'carezaar.accessToken', value: pair.access }, { name: 'carezaar.refreshToken', value: pair.refresh }, { name: 'carezaar.baseData.v3', value: JSON.stringify(cache) }, { name: 'carezaar.languageCode', value: 'en' }, { name: 'carezaar.languageId', value: '1' }] }] } });
      const answer = (route, result) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ result, errors: null, message: 'Synthetic response' }) });
      await context.route('**/*', async route => {
        try {
          const req = route.request(), u = new URL(req.url()), method = req.method(), bearer = req.headers().authorization;
          if (u.origin === origin && !u.pathname.startsWith('/api/') && ['GET', 'HEAD'].includes(method)) return route.continue();
          if (u.origin !== api) { r.unknownRequests++; save(); return route.abort('blockedbyclient'); }
          if (method === 'OPTIONS' && ['/api/base/info', '/api/auth/info', '/api/users/notifications/count'].includes(u.pathname)) return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,OPTIONS', 'access-control-allow-headers': 'authorization,accept,accept-language,content-type' } });
          if (method !== 'GET') { r.unexpectedMutations++; save(); return route.abort('blockedbyclient'); }
          if (u.pathname === '/api/base/info' && !bearer && u.searchParams.get('ts_cache') === '0' && [...u.searchParams.keys()].length === 1 && ++r.baseGET <= 1) return answer(route, { ts_cache: 10 });
          if (bearer === 'Bearer ' + pair.access) {
            if (u.pathname === '/api/auth/info' && !u.search && ++r.infoGET <= 2) return answer(route, { id: 'synthetic-photo-owner', role, first_name: 'Synthetic', last_name: 'Photo', email: role + '@example.test', photo: null, date_of_birth: null, gender_id: null, bio: null });
            if (u.pathname === '/api/users/notifications/count' && u.searchParams.has('checked_at') && [...u.searchParams.keys()].length === 1) return answer(route, 0);
          }
          r.unknownRequests++; save(); return route.abort('blockedbyclient');
        } catch { r.callbackErrors++; save(); try { await route.abort('failed'); } catch { /* Counted only. */ } }
      });
      page = await context.newPage(); page.setDefaultTimeout(6000);
      page.on('pageerror', () => { r.pageErrors++; save(); });
      page.on('console', m => { if (m.type() === 'error') { r.consoleErrors++; save(); } });
      await page.goto(origin + '/profile/edit', { waitUntil: 'domcontentloaded' });
      await page.getByRole('textbox', { name: 'First name', exact: true }).waitFor();
      await page.locator('.busy-scrim').waitFor({ state: 'hidden' });
      require(await page.getByRole('textbox', { name: 'First name', exact: true }).inputValue() === 'Synthetic' && r.infoGET === 2, 'EXACT_EDIT_OWNER_READY');
      const png64 = await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 160; c.height = 80;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#006655'; ctx.fillRect(0, 0, 160, 80); ctx.fillStyle = '#eeddaa'; ctx.fillRect(40, 20, 80, 40);
        return c.toDataURL('image/png').split(',')[1];
      });
      const png = Buffer.from(png64, 'base64');
      const choose = async file => {
        await page.getByRole('button', { name: 'Upload Photo', exact: true }).click();
        const source = page.getByRole('dialog', { name: 'Upload Photo', exact: true }); await source.waitFor();
        const picked = page.waitForEvent('filechooser').catch(() => null); await source.getByRole('button', { name: 'Gallery', exact: true }).click();
        const chooser = await picked; require(chooser, 'ACTUAL_FILE_CHOOSER_REQUIRED'); await chooser.setFiles(file);
      };
      await choose({ name: 'synthetic-rectangles.png', mimeType: 'image/png', buffer: png });
      const crop = page.locator('.cropper[role=dialog]'); await crop.waitFor();
      await crop.getByRole('button', { name: 'Confirm', exact: true }).waitFor();
      await page.waitForFunction(() => !document.querySelector('.cropper-bar button:last-child')?.disabled);
      const box = await page.locator('.cropper-window').boundingBox();
      add('Gallery selection opens decoded square cropper', { cropVisible: await crop.isVisible(), decodedImage: await crop.locator('.cropper-stage img').evaluate(img => img.complete && img.naturalWidth === 160 && img.naturalHeight === 80), squareVisible: Boolean(box && Math.abs(box.width - box.height) < 1 && box.x >= 0 && box.x + box.width <= width), noPreviewBeforeConfirm: await page.locator('.photo-row .avatar img').count() === 0 });
      await crop.getByRole('button', { name: 'Cancel', exact: true }).click(); await crop.waitFor({ state: 'hidden' });
      add('Crop Cancel keeps original empty photo', { noPreview: await page.locator('.photo-row .avatar img').count() === 0, placeholder: await page.locator('.photo-placeholder').count() === 1 });
      await choose({ name: 'synthetic-rectangles.png', mimeType: 'image/png', buffer: png });
      await crop.waitFor(); await page.waitForFunction(() => !document.querySelector('.cropper-bar button:last-child')?.disabled);
      await crop.getByRole('button', { name: 'Confirm', exact: true }).click(); await crop.waitFor({ state: 'hidden' });
      const preview = page.locator('.photo-row .avatar img'); await preview.waitFor();
      await page.waitForFunction(() => { const img = document.querySelector('.photo-row .avatar img'); return img?.complete && img.naturalWidth === 800 && img.naturalHeight === 800; });
      add('Confirm creates complete square preview', { exact800Square: await preview.evaluate(img => img.naturalWidth === 800 && img.naturalHeight === 800), localBlobOnly: (await preview.getAttribute('src')).startsWith('blob:'), removeVisible: await page.getByRole('button', { name: 'Remove Photo', exact: true }).isVisible() });
      if (onScreenshot) r.screenshots.push(await onScreenshot(page, { engine, role, width, tag: 'square-preview' }));
      await page.getByRole('button', { name: 'Remove Photo', exact: true }).click();
      add('Remove clears preview', { previewAbsent: await preview.count() === 0, placeholderRestored: await page.locator('.photo-placeholder').count() === 1, uploadRestored: await page.getByRole('button', { name: 'Upload Photo', exact: true }).isVisible() });
      await choose({ name: 'synthetic-not-image.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic QA text file') });
      await page.locator('.toast[role=alert]').filter({ hasText: 'Choose a JPEG, PNG or WebP photo.' }).waitFor();
      add('Non-image rejected clearly', { friendlyFormatMessage: await page.getByText('Choose a JPEG, PNG or WebP photo.', { exact: true }).isVisible(), noCropOrPreview: await crop.count() === 0 && await preview.count() === 0 });
      await choose({ name: 'synthetic-large-rectangles.png', mimeType: 'image/png', buffer: Buffer.concat([png, Buffer.alloc(10 * 1024 * 1024 + 1)]) });
      await page.locator('.toast[role=alert]').filter({ hasText: 'Choose a photo smaller than 10 MB.' }).waitFor();
      add('Oversize image rejected before decode', { friendlySizeMessage: await page.getByText('Choose a photo smaller than 10 MB.', { exact: true }).isVisible(), noCropOrPreview: await crop.count() === 0 && await preview.count() === 0 });
      add('Synthetic read-only session and runtime guards', { noUnknown: r.unknownRequests === 0, noMutations: r.unexpectedMutations === 0, noCallbackPageConsoleError: r.callbackErrors === 0 && r.pageErrors === 0 && r.consoleErrors === 0, noForward: r.realApiForwarded === 0, exactOwnerPair: await page.evaluate(pair => localStorage.getItem('carezaar.accessToken') === pair.access && localStorage.getItem('carezaar.refreshToken') === pair.refresh, pair) });
      r.status = r.checks.every(c => c.status === 'PASS') ? 'PASS' : 'FAIL'; save();
    } catch (e) { r.errorName = ['Error', 'TimeoutError', 'TypeError'].includes(e?.name) ? e.name : 'OtherError'; r.interruptionCode = /^[A-Z0-9_]+$/.test(e?.qaCode || '') ? e.qaCode : 'SANITIZED_HARNESS_INTERRUPTION'; save(); }
    finally { if (context) { try { await context.close(); r.contextClosed = true; } catch { r.cleanupInterrupted = true; } } if (r.unknownRequests || r.unexpectedMutations) r.status = 'FAIL'; else if (r.callbackErrors || r.pageErrors || r.cleanupInterrupted) r.status = 'IN PROGRESS'; save(); }
  }
  return records;
}
