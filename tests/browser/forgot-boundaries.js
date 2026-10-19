async (page) => {
  // PRIVATE, PREPARED ONLY. Run through the approved extension after foreground release.
  // Saved owned authenticated tabs use127.0.0.1:4419/4422;public test tabs use localhost:4419.
  // Never infer sign-out from that history:the non-null token-key probe must still pass.
  // Stop rather than clear an existing session on this origin. No backend request is forwarded.
  const origin = 'http://localhost:4419';
  const apiOrigin = 'https://new.carezaar.com';
  const targetPath = '/api/users/otp/send';
  const routePath = '/forgot-password';
  const p = await page.context().newPage();
  const results = [], requests = [], callbackErrors = [], unexpectedMutations = [];
  const began = Date.now(), deadline = began + 65000;
  const fixtureMessage = 'Synthetic boundary rejection.';
  let snapshot = null, stateChanged = false, activeCase = null, releaseHeld = null, heldTimer = null;
  let restoration = 'NOT_NEEDED', pageErrors = 0;
  const bootstrap = origin + '/__qa_boundary_storage_probe__';
  p.setDefaultTimeout(1800);
  p.on('pageerror', () => { pageErrors += 1; });
  function assert(ok, code) { if (!ok) { const e = new Error(code); e.qaCode = code; throw e; } }
  function remaining() { assert(Date.now() < deadline, 'HARNESS_TIME_BUDGET'); }
  function add(caseId, width, predicates) {
    results.push({ case: caseId, width, status: Object.values(predicates).every(Boolean) ? 'PASS' : 'FAIL', predicates });
  }
  function isTarget(response) {
    try { const u = new URL(response.url()); return u.origin === apiOrigin && u.pathname === targetPath && response.request().method() === 'POST'; }
    catch { return false; }
  }
  function safeResponseWait() {
    // Attach rejection handling immediately, before any click/press.
    return p.waitForResponse(isTarget, { timeout: 5000 }).then(() => true, () => false);
  }
  async function waitIdle() { await p.locator('.busy-scrim').waitFor({ state: 'hidden', timeout: 5000 }); }
  async function emptyObservation() {
    await p.waitForTimeout(120);
    return requests.length;
  }
  try {
    await p.route(bootstrap, async (route) => {
      try { await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Private boundary storage probe</title>' }); }
      catch { callbackErrors.push('STORAGE_PROBE_RESPONSE_FAILED'); }
    });
    // This guard affects this newly created page only, never the shared context/browser.
    // Public GETs continue; every mutation is either the exact controlled endpoint or aborted.
    await p.route('**/api/**', async (route) => {
      try {
        const req = route.request(), u = new URL(req.url()), method = req.method();
        if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') { await route.continue(); return; }
        if (u.origin !== apiOrigin || u.pathname !== targetPath || method !== 'POST') {
          unexpectedMutations.push({ method, path: u.pathname });
          await route.abort('blockedbyclient'); return;
        }
        const data = new URLSearchParams(req.postData() || '');
        // Raw synthetic payload stays in memory; output contains predicates/counts only.
        const record = { case: activeCase ? activeCase.id : 'UNPLANNED',
          emailMatchesDeliveredTrimmed: Boolean(activeCase) && typeof activeCase.deliveredEmail === 'string' && data.get('email') === activeCase.deliveredEmail.trim(),
          emailMatchesTypedIntentTrimmed: Boolean(activeCase) && data.get('email') === activeCase.email.trim(),
          emailInputSanitizedTypedIntent: Boolean(activeCase) && activeCase.deliveredEmail !== activeCase.email,
          formEncodingCorrect: (req.headers()['content-type'] || '').toLowerCase().startsWith('application/x-www-form-urlencoded'),
          languageIsEnglish: req.headers()['accept-language'] === 'en',
          onlyEmailPayload: [...data.keys()].length === 1 && data.has('email'),
          hadAuthorization: Boolean(req.headers()['authorization']) };
        requests.push(record);
        if (activeCase && activeCase.hold) await activeCase.hold;
        await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({
          result: null, message: fixtureMessage, errors: { email: [fixtureMessage] }
        }) });
      } catch {
        callbackErrors.push('CONTROLLED_ROUTE_FAILED');
        try { await route.abort('failed'); } catch { /* never expose route error/header call logs */ }
      }
    });
    await p.bringToFront();
    await p.goto(bootstrap, { waitUntil: 'domcontentloaded', timeout: 8000 });
    const probe = await p.evaluate(() => ({ hasSession: localStorage.getItem('carezaar.accessToken') !== null || localStorage.getItem('carezaar.refreshToken') !== null,
      entries: ['carezaar.languageCode', 'carezaar.languageId'].map(k => [k, localStorage.getItem(k)]) }));
    snapshot = probe.entries; // in-memory only; never returned or logged
    assert(!probe.hasSession, 'PREEXISTING_LOOPBACK_SESSION_LEAVE_UNTOUCHED');
    await p.evaluate(() => { localStorage.setItem('carezaar.languageCode', 'en'); localStorage.setItem('carezaar.languageId', '1'); });
    stateChanged = true;
    for (const width of [390, 1440]) {
      remaining();
      await p.setViewportSize({ width, height: 1000 });
      await p.goto(origin + routePath, { waitUntil: 'domcontentloaded', timeout: 12000 });
      const email = p.locator('input[type=email]');
      const reset = p.getByRole('button', { name: 'Reset Password', exact: true });
      await email.waitFor({ timeout: 10000 });
      const cases = [
        { id: 'empty-email', email: '', valid: false },
        { id: 'spaces-email', email: '   ', valid: false },
        { id: 'malformed-missing-at', email: 'not-an-email', valid: false },
        { id: 'malformed-internal-space', email: 'bad address@example.test', valid: false },
        { id: 'unicode-without-email-structure', email: 'مرحباé🙂', valid: false },
        { id: 'trim-email', email: '   boundary@example.test   ', valid: true },
        // validateEmail is deliberately permissive; do not impose ASCII-only policy.
        { id: 'unicode-structured-email', email: 'éمرحبا@example.test', valid: true },
        { id: 'long-structured-email', email: 'x'.repeat(320) + '@example.test', valid: true }
      ];
      for (const c of cases) {
        remaining(); activeCase = c;
        await email.fill(c.email); const delivered = await email.inputValue(), before = requests.length;
        activeCase.deliveredEmail = delivered;
        if (!c.valid) {
          const disabled = await reset.isDisabled();
          await email.press('Enter');
          const after = await emptyObservation();
          add(c.id, width, { disabled, noDialog: await p.getByRole('dialog').count() === 0, noOTPSend: after === before });
        } else {
          await reset.click();
          let dialog = p.getByRole('dialog'); await dialog.waitFor();
          await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
          const editPreserved = await email.inputValue() === delivered && requests.length === before;
          await reset.click(); dialog = p.getByRole('dialog'); await dialog.waitFor();
          const response = safeResponseWait();
          await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
          const observed = await response; await waitIdle();
          const sent = requests.slice(before);
          add(c.id, width, { editPreserved, responseObserved: observed, oneControlledOTPSend: sent.length === 1,
            emailTrimmed: sent.length === 1 && sent[0].emailMatchesDeliveredTrimmed,
            onlyEmailPayload: sent.length === 1 && sent[0].onlyEmailPayload,
            noAuthorization: sent.every(x => !x.hadAuthorization),
            correctFormAndLanguage: sent.every(x => x.formEncodingCorrect && x.languageIsEnglish),
            emailRetainedAfterFailure: await email.inputValue() === delivered,
            failureStaysOnForm: new URL(p.url()).pathname === routePath,
            noDocumentOverflow: await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1) });
        }
      }
      remaining();
      let release; const held = new Promise(resolve => { release = resolve; });
      releaseHeld = release; heldTimer = setTimeout(release, 2500);
      activeCase = { id: 'delayed-confirm-repeated-enter', email: '  boundary@example.test  ', hold: held };
      await email.fill(activeCase.email); activeCase.deliveredEmail = await email.inputValue(); await reset.click();
      const dialog = p.getByRole('dialog'); await dialog.waitFor();
      const before = requests.length, response = safeResponseWait();
      await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
      await p.locator('.busy-scrim').waitFor({ state: 'visible' });
      const requestsBeforeKeys = requests.length;
      for (let n = 0; n < 5; n += 1) await p.keyboard.press('Enter');
      const oneWhilePending = requests.length - before === 1 && requestsBeforeKeys - before === 1;
      release(); clearTimeout(heldTimer); heldTimer = null; releaseHeld = null;
      const observed = await response; await waitIdle(); await p.waitForTimeout(120);
      add('delayed-confirm-repeated-enter', width, { responseObserved: observed, oneWhilePending,
        oneTotalRequest: requests.length - before === 1,
        noRecoveryNavigation: new URL(p.url()).pathname === routePath });
    }

  } catch (error) {
    // Never return Error.message/stack: browser transport errors may contain headers.
    results.push({ case: 'HARNESS_INTERRUPTION', status: 'IN PROGRESS', code: error && error.qaCode || 'SANITIZED_UI_OR_TRANSPORT_INTERRUPTION' });
  } finally {
    if (releaseHeld) releaseHeld();
    if (heldTimer) clearTimeout(heldTimer);
    if (snapshot && stateChanged) {
      try {
        await p.goto(bootstrap, { waitUntil: 'domcontentloaded', timeout: 3000 });
        const restored = await p.evaluate((saved) => {
          if (localStorage.getItem('carezaar.accessToken') !== null || localStorage.getItem('carezaar.refreshToken') !== null) return false;
          // Only the two keys explicitly changed by this harness. Never clear tokens/cache.
          for (const [key, value] of saved) {
            if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
          }
          return true;
        }, snapshot);
        restoration = restored ? 'RESTORED_ONLY_CHANGED_LANGUAGE_KEYS_CACHE_RETAINED' : 'SKIPPED_CONCURRENT_AUTH_LEAVE_UNTOUCHED';
      } catch { restoration = 'FAILED_REQUIRES_OWNER_REVIEW'; }
    }
    try { await p.close({ runBeforeUnload: false }); } catch { restoration += '_PAGE_CLOSE_FAILED'; }
  }
  return { browser: 'approved Chrome Default extension required', harness: 'forgot-boundaries', execution: 'RETURNED_ACTUAL_PARTIAL_RESULTS_ONLY',
    scope: '390/1440 ForgotPassword empty/space/format/trim/Unicode/long/Edit retention and held-response repeated Enter; controlled OTP failure only', results, requestCount: requests.length, requestPredicates: requests,
    unexpectedMutations, callbackErrors, pageErrors, restoration, elapsedMs: Date.now() - began,
    forwardedRequests: 0, realClipboardPaste: 'NOT EXECUTED — fill is not clipboard paste',
    limitations: ['Controlled nonforwarding HTTP422 only; no live authentication/recovery success.', 'Email inputValue may sanitize typed ASCIIspace before React state;payload uses delivered input.trim(),typed-intent equality is separate and not app-trim proof.', 'No passwords, token values or raw request/error output returned.', 'No claim for physical network, all locales, or whole Phase6.'] };
}
