async (page) => {
  // Run with Playwright MCP browser_run_code_unsafe(filename=...).
  // Uses an isolated context and controlled signup responses; never registers a real account.
  const origin = new URL(page.url()).origin;
  let context;
  let ownsContext = true;
  try {
    context = await page.context().browser().newContext({ viewport: { width: 390, height: 1000 } });
  } catch (error) {
    // The approved Chrome extension forbids creating browser contexts. Use a
    // task-owned tab instead; all controlled responses remain page-scoped.
    if (!String(error).includes('Not allowed')) throw error;
    context = page.context();
    ownsContext = false;
  }
  const target = await context.newPage();
  const results = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  try {
    // Classic desktop scrollbars at this narrow window exposed a ResizeObserver
    // feedback loop: controls moved every frame and could not be clicked.
    await target.setViewportSize({ width: 390, height: 844 });
    await target.goto(origin + '/sign-up/client');
    const stableNext = target.getByRole('button', { name: 'Continue', exact: true }).first();
    await stableNext.waitFor({ timeout: 60000 });
    await stableNext.click({ timeout: 5000 });
    const samples = [];
    for (let i = 0; i < 8; i++) {
      samples.push(await stableNext.boundingBox());
      await target.waitForTimeout(50);
    }
    assert(samples.every(b => Math.abs(b.y - samples[0].y) < 1 && Math.abs(b.width - samples[0].width) < 1), 'Signup controls keep resizing');
    results.push({ id: 'WEB-regression-classic-scrollbar', width: 390, height: 844, status: 'PASS' });
    for (const width of [390, 1440]) {
      await target.setViewportSize({ width, height: 1000 });
      await target.goto(origin + '/sign-up/client');
      const next = target.getByRole('button', { name: 'Continue', exact: true }).first();
      await next.waitFor({ timeout: 60000 });
      await next.click();
      const errors = await target.locator('.field-message').allTextContents();
      assert(errors.length === 3 && !errors.some(t => t.includes('license')), 'Field errors must precede agreement');
      await target.locator('input[type=email]').fill('fixture@example.com');
      const password = target.locator('input[type=password]');
      await password.nth(0).fill('Abcdefg1!');
      await password.nth(1).fill('different');
      assert(!(await target.locator('.field-message').allTextContents()).some(t => t.includes('match')), 'Premature mismatch');
      await next.click();
      assert((await target.locator('.field-message').allTextContents()).some(t => t.includes('match')), 'Submitted mismatch absent');
      await password.nth(0).fill('Abcdefg2!');
      assert(!(await target.locator('.field-message').allTextContents()).some(t => t.includes('match')), 'Password editing must clear mismatch');
      await password.nth(1).fill('Abcdefg2!');
      await next.click();
      await target.locator('.toast').filter({ hasText: 'Please accept the license agreement to continue.' }).waitFor();
      if (width === 1440) {
        assert(await target.getByRole('img', { name: /^At least.*: met$/ }).count() === 5,
          'All five password status indicators need accessible names');
      }
      results.push({ id: 'WEB-V5-C2-C3', width, status: 'PASS' });
    }
    await target.route('**/api/auth/register', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { id: 'fixture-only' } }) }));
    await target.route('**/api/users/otp/send', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Controlled failure' }) }));
    await target.locator('label').filter({ has: target.getByRole('checkbox') }).click({ position: { x: 8, y: 8 } });
    await target.getByRole('button', { name: 'Continue', exact: true }).click();
    await target.getByRole('button', { name: 'Confirm', exact: true }).click();
    await target.waitForURL('**/otp');
    await target.getByText(/Wait for 0[12]:/).waitFor();
    assert(await target.getByRole('button', { name: 'Re-send', exact: true }).count() === 0, 'Failed initial OTP send bypassed wait');
    results.push({ id: 'WEB-V5-C4', status: 'PASS', transport: 'controlled initial send HTTP500' });
    return results;
  } finally {
    if (ownsContext) await context.close();
    else await target.close();
  }
}
