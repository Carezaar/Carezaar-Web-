async (page) => {
  // Support boundary harness: wait for the mounted composer action before the loading overlay.
  // Existing owned127.0.0.1 tabs are authenticated. Never clear tokens or change language.
  const api = 'https://new.carezaar.com', endpoint = '/api/users/issues';
  const began = Date.now(), deadline = began + 75000, results = [], requests = [];
  const callbackErrors = [], unexpectedMutations = [], restoration = [];
  const owned = {};
  let activeCase = null, releaseHeld = null, heldTimer = null;
  let checkpoint = 'ownership-preflight', diagnosticTarget = 'button.fab', currentWidth = null;
  const step = (name, target) => { checkpoint = name; if (target) diagnosticTarget = target; };
  const diagnose = async (p) => p.locator(diagnosticTarget).last().evaluate(el => {
    const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    const project = node => { const c = getComputedStyle(node), role = node.getAttribute('role');
      return {tag:node.tagName,classes:String(node.className).replace(/[^A-Za-z0-9_ -]/g,'').slice(0,160),
        role:role && /^[a-z-]{1,40}$/.test(role) ? role : null,
        css:{position:c.position,zIndex:c.zIndex,pointerEvents:c.pointerEvents,display:c.display,visibility:c.visibility,opacity:c.opacity}}; };
    return {documentVisible:!document.hidden,target:project(el),targetCenterInViewport:x>=0&&y>=0&&x<innerWidth&&y<innerHeight,
      targetSize:{width:Math.round(r.width*100)/100,height:Math.round(r.height*100)/100},
      topElements:document.elementsFromPoint(x,y).slice(0,6).map(project)};
  }).catch(() => ({targetUnavailable:true}));
  function assert(ok, code) { if (!ok) { const e = new Error(code); e.qaCode = code; throw e; } }
  function budget() { assert(Date.now() < deadline, 'HARNESS_TIME_BUDGET'); }
  function add(role, width, caseId, predicates) {
    results.push({ role, width, case: caseId, status: Object.values(predicates).every(Boolean) ? 'PASS' : 'FAIL', predicates });
  }
  function responseWait(p) {
    // Rejection handler is attached immediately. Never print a transport exception.
    return p.waitForResponse(r => {
      try { const u = new URL(r.url()); return u.origin === api && u.pathname === endpoint && r.request().method() === 'POST'; }
      catch { return false; }
    }, { timeout: 5000 }).then(() => true, () => false);
  }
  try {
    for (const p of page.context().pages()) {
      if (!/^http:\/\/127\.0\.0\.1:(4419|4422)\//.test(p.url())) continue;
      let metadata;
      try { metadata = await p.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('qa.final.extension') || 'null'); } catch { return null; } }); }
      catch { continue; }
      if (!metadata || !['client', 'caregiver'].includes(metadata.role) || typeof metadata.id !== 'string') continue;
      const expectedPort = metadata.role === 'client' ? '4419' : '4422';
      assert(new URL(p.url()).port === expectedPort, 'OWNED_ROLE_PORT_MISMATCH');
      assert(!owned[metadata.role], 'DUPLICATE_OWNED_ROLE_TAB');
      owned[metadata.role] = { p, metadata };
    }
    assert(owned.client && owned.caregiver, 'EXACT_OWNED_ROLE_TABS_REQUIRED');
    for (const role of ['client', 'caregiver']) {
      budget();
      const { p, metadata } = owned[role], originalURL = p.url(), originalViewport = p.viewportSize();
      const originalDefaultTimeout = 30000; // Playwright has no default-timeout getter; do not change it on a shared page.
      const origin = new URL(originalURL).origin;
      // Verify current live identity without returning profile/token data. No POST/refresh.
      const verified = await p.evaluate(async ({ api, id, role }) => {
        const token = localStorage.getItem('carezaar.accessToken');
        if (!token) return false;
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch(api + '/api/auth/info', { headers: { Authorization: 'Bearer ' + token }, signal: controller.signal });
          const body = await response.json(), user = body.result || body;
          return response.ok && user.id === id && user.role === role;
        } catch { return false; } finally { clearTimeout(timer); }
      }, { api, id: metadata.id, role });
      assert(verified, 'OWNED_LIVE_IDENTITY_NOT_VERIFIED');
      let installed = false;
      const guard = async (route) => {
        try {
          const req = route.request(), url = new URL(req.url()), method = req.method();
          if (['GET', 'HEAD', 'OPTIONS'].includes(method)) { await route.continue(); return; }
          if (url.origin !== api || url.pathname !== endpoint || method !== 'POST') {
            unexpectedMutations.push({ role, method, code: 'UNEXPECTED_MUTATION_ABORTED' });
            await route.abort('blockedbyclient'); return;
          }
          const form = new URLSearchParams(req.postData() || ''), expected = activeCase;
          const named = expected && expected.type !== 'other';
          const expectedKeys = named ? ['description', 'issuetype_id'] : ['description', 'title'];
          const keys = [...form.keys()].sort();
          requests.push({ role, case: expected ? expected.id : 'UNPLANNED',
            descriptionTrimmed: Boolean(expected) && form.get('description') === expected.deliveredDescription.trim(),
            correctOtherTitle: Boolean(expected) && (named ? !form.has('title') : form.get('title') === expected.deliveredSubject.trim()),
            correctIssueType: Boolean(expected) && (named ? form.get('issuetype_id') === expected.type : !form.has('issuetype_id')),
            exactKeys: keys.length === 2 && keys.every((key, i) => key === expectedKeys[i]),
            formEncodingCorrect: (req.headers()['content-type'] || '').toLowerCase().startsWith('application/x-www-form-urlencoded'),
            authenticated: Boolean(req.headers()['authorization']) });
          if (expected && expected.hold) await expected.hold;
          await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({
            result: null, message: 'Synthetic issue boundary rejection.', errors: { description: ['Synthetic issue boundary rejection.'] }
          }) });
        } catch {
          callbackErrors.push({ role, code: 'CONTROLLED_ISSUE_ROUTE_FAILED' });
          try { await route.abort('failed'); } catch { /* no transport logs */ }
        }
      };
      try {
        await p.route('**/api/**', guard); installed = true;
        await p.bringToFront();
        for (const width of [390, 1440]) {
          budget(); currentWidth = width; step('viewport', 'button.fab');
          await p.setViewportSize({ width, height: 1000 });
          step('navigate-report-issue', 'button.fab');
          await p.goto(origin + '/report-issue', { waitUntil: 'domcontentloaded', timeout: 12000 });
          step('wait-mounted-fab', 'button.fab');
          await p.locator('button.fab').waitFor({ state: 'visible', timeout: 10000 });
          step('wait-busy-hidden-after-fab', 'button.fab');
          await p.locator('.busy-scrim').waitFor({ state: 'hidden', timeout: 10000 });
          step('click-mounted-fab', 'button.fab');
          await p.locator('button.fab').click({ timeout: 2500 });
          step('wait-issue-dialog', '[role="dialog"] button.btn');
          const dialog = p.getByRole('dialog'); await dialog.waitFor({ timeout: 2500 });
          const type = dialog.locator('select'), subject = dialog.getByRole('textbox', { name: 'Subject', exact: true }), description = dialog.locator('textarea');
          const submit = dialog.locator('button.btn').last();
          step('select-other-type', '[role="dialog"] select');
          await type.selectOption('other', { timeout: 2500 });
          const cases = [
            { id: 'empty-subject-and-description', subject: '', description: '', send: false },
            { id: 'spaces-subject', subject: '   ', description: 'Synthetic description', send: false },
            { id: 'empty-description', subject: 'Synthetic subject', description: '', send: false },
            { id: 'spaces-description', subject: 'Synthetic subject', description: '   ', send: false },
            { id: 'trim-both-fields', subject: '  Synthetic subject  ', description: '  Synthetic description  ', send: true },
            { id: 'unicode-and-newlines', subject: 'Synthetic é مرحبا 🙂', description: 'Synthetic é مرحبا 🙂\nSecond line', send: true },
            { id: 'long-input-no-invented-max', subject: 'Synthetic ' + 'x'.repeat(512), description: 'Synthetic ' + 'x'.repeat(4096), send: true }
          ];
          for (const c of cases) {
            budget(); activeCase = { ...c, type: 'other', width }; step('fill-boundary-fields', '[role="dialog"] button.btn');
            await subject.fill(c.subject, { timeout: 2000 }); await description.fill(c.description, { timeout: 2000 });
            activeCase.deliveredSubject = await subject.inputValue(); activeCase.deliveredDescription = await description.inputValue();
            const before = requests.length;
            if (!c.send) {
              step('click-boundary-submit', '[role="dialog"] button.btn'); await submit.click({ timeout: 2000 });
              await p.locator('.toast').last().waitFor({ timeout: 2000 });
              await p.waitForTimeout(100);
              add(role, width, c.id, { noIssuePost: requests.length === before,
                subjectRetained: await subject.inputValue() === activeCase.deliveredSubject,
                descriptionRetained: await description.inputValue() === activeCase.deliveredDescription,
                composerStillOpen: await dialog.count() === 1 });
            } else {
              const response = responseWait(p); step('click-boundary-submit', '[role="dialog"] button.btn'); await submit.click({ timeout: 2000 });
              const observed = await response;
              await p.locator('.busy-scrim').waitFor({ state: 'hidden', timeout: 5000 });
              const sent = requests.slice(before);
              add(role, width, c.id, { controlledResponseObserved: observed, oneIssuePost: sent.length === 1,
                payloadPredicates: sent.length === 1 && Object.entries(sent[0]).filter(([k]) => !['role', 'case'].includes(k)).every(([,v]) => v === true),
                subjectRetained: await subject.inputValue() === activeCase.deliveredSubject,
                descriptionRetained: await description.inputValue() === activeCase.deliveredDescription,
                composerStillOpen: await dialog.count() === 1,
                noDocumentOverflow: await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) });
            }
          }
          budget();
          step('named-type-retention', '[role="dialog"] select');
          const namedValue = await type.locator('option').evaluateAll(options => options.map(o => o.value).find(v => v !== 'other') || null);
          if (namedValue === null) results.push({ role, width, case: 'Other-to-named-type-retains-local-draft', status: 'IN PROGRESS', code: 'NO_MANAGED_NAMED_TYPE_AVAILABLE' });
          else {
            await subject.fill('  Synthetic retained Other subject  ', { timeout: 2000 });
            await description.fill('  Synthetic named-type description é مرحبا 🙂  ', { timeout: 2000 });
            const savedSubject = await subject.inputValue(), savedDescription = await description.inputValue();
            await type.selectOption(namedValue, { timeout: 2000 });
            const subjectHidden = await subject.count() === 0;
            activeCase = { id: 'named-type-omits-title-and-retains-other-draft', type: namedValue,
              deliveredSubject: savedSubject, deliveredDescription: savedDescription };
            const before = requests.length, response = responseWait(p);
            step('click-boundary-submit', '[role="dialog"] button.btn'); await submit.click({ timeout: 2000 }); const observed = await response;
            await p.locator('.busy-scrim').waitFor({ state: 'hidden', timeout: 5000 });
            const sent = requests.slice(before);
            await type.selectOption('other', { timeout: 2000 });
            add(role, width, activeCase.id, { subjectHidden, controlledResponseObserved: observed, oneIssuePost: sent.length === 1,
              namedPayloadCorrect: sent.length === 1 && Object.entries(sent[0]).filter(([k]) => !['role', 'case'].includes(k)).every(([,v]) => v === true),
              OtherSubjectRestored: await subject.inputValue() === savedSubject, descriptionRetained: await description.inputValue() === savedDescription });
          }
          budget();
          step('held-response-setup', '[role="dialog"] button.btn');
          let release; const hold = new Promise(resolve => { release = resolve; });
          releaseHeld = release; heldTimer = setTimeout(release, 3000);
          await type.selectOption('other', { timeout: 2000 });
          await subject.fill('Synthetic held-response subject', { timeout: 2000 });
          await description.fill('Synthetic held-response description', { timeout: 2000 });
          activeCase = { id: 'held-response-focused-submit-Enter', type: 'other', hold,
            deliveredSubject: await subject.inputValue(), deliveredDescription: await description.inputValue() };
          const before = requests.length, response = responseWait(p);
          step('click-boundary-submit', '[role="dialog"] button.btn'); await submit.click({ timeout: 2000 });
          await p.locator('.busy-scrim').waitFor({ state: 'visible', timeout: 2000 });
          const focused = await submit.evaluate(el => document.activeElement === el);
          if (focused) for (let n = 0; n < 3; n += 1) await p.keyboard.press('Enter');
          const oneWhileHeld = requests.length - before === 1;
          release(); clearTimeout(heldTimer); heldTimer = null; releaseHeld = null;
          const observed = await response;
          await p.locator('.busy-scrim').waitFor({ state: 'hidden', timeout: 5000 });
          await p.waitForTimeout(100);
          if (!focused) results.push({ role, width, case: activeCase.id, status: 'IN PROGRESS', code: 'SUBMIT_LOST_FOCUS_NO_MEANINGFUL_REPEATED_ENTER_CLAIM' });
          else add(role, width, activeCase.id, { controlledResponseObserved: observed, oneWhileHeld,
            oneTotalIssuePost: requests.length - before === 1,
            subjectRetained: await subject.inputValue() === activeCase.deliveredSubject,
            descriptionRetained: await description.inputValue() === activeCase.deliveredDescription });
          await p.keyboard.press('Escape');
        }
      } catch (error) {
        results.push({ role, case: 'ROLE_HARNESS_INTERRUPTION', status: 'IN PROGRESS', code: error && error.qaCode || 'SANITIZED_UI_OR_TRANSPORT_INTERRUPTION', checkpoint, width: currentWidth, blockerDiagnostic: await diagnose(p), activeCase: activeCase?.id, errorType: error?.name, clickIntercepted: /intercepts pointer events/.test(error?.message || ''), selectorStrict: /strict mode violation/.test(error?.message || '') });
      } finally {
        if (releaseHeld) releaseHeld(); if (heldTimer) clearTimeout(heldTimer);
        releaseHeld = null; heldTimer = null;
        try {
          await p.keyboard.press('Escape');
          if (originalViewport) await p.setViewportSize(originalViewport);
          await p.goto(originalURL, { waitUntil: 'domcontentloaded', timeout: 5000 });
          restoration.push({ role, status: 'ORIGINAL_URL_AND_VIEWPORT_RESTORED' });
        } catch { restoration.push({ role, status: 'RESTORE_FAILED_OWNER_REVIEW_REQUIRED' }); }
        if (installed) { try { await p.unroute('**/api/**', guard); } catch { callbackErrors.push({ role, code: 'OWN_ROUTE_CLEANUP_FAILED' }); } }
      }
    }
  } catch (error) {
    results.push({ case: 'HARNESS_INTERRUPTION', status: 'IN PROGRESS', code: error && error.qaCode || 'SANITIZED_PREFLIGHT_INTERRUPTION' });
  }
  return { browser: 'actual engine metadata must be supplied by launcher', harness: 'support-boundaries-readiness-variant',
    scope: 'Both verified owned roles,390/1440 local support drafts;nonforwarding HTTP422 fixtures only', results,
    requestCount: requests.length, payloadPredicates: requests, forwardedIssueRequests: 0,
    unexpectedMutations, callbackErrors, restoration, elapsedMs: Date.now() - began,
    realClipboardPaste: 'NOT EXECUTED — fill is not clipboard paste',
    limitations: ['No actual issue creation or persistence claimed.', 'No password/token/raw error/profile/issue content returned.', 'No maximum length invented;512/4096 are bounded overflow probes.', 'Repeated Enter only claimed if real Submit retained keyboard focus.', 'Readiness adaptation waits for mounted visible FAB before busy-hidden and normal click; original assertions and75000ms budget unchanged; no interception cause assumed.'] };
}
