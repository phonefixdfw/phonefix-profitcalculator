import { test, expect, chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const fixture = readFileSync(resolve('tests/fixtures/vendor-price.html'));

test('right-click "Suggest repair price" shows the target-profit box on a vendor-like page', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One run is enough.');
  test.setTimeout(120_000);
  execFileSync('npm', ['run', 'build:extension'], { stdio: 'pipe' });

  const shipped = JSON.parse(readFileSync('dist-extension/manifest.json', 'utf8'));
  expect(shipped.host_permissions).toBeUndefined();
  expect(shipped.permissions).toEqual(['storage', 'contextMenus', 'activeTab', 'scripting']);

  // Chrome's native context menu cannot be clicked from Playwright, and activeTab is only granted by a real
  // user gesture. The test copy therefore adds a host permission for the local fixture server only; the
  // shipped manifest (asserted above) has none.
  const work = mkdtempSync(join(tmpdir(), 'phonefix-ctx-'));
  const extensionDir = join(work, 'ext');
  cpSync('dist-extension', extensionDir, { recursive: true });
  const testManifest = { ...shipped, host_permissions: ['http://127.0.0.1/*'] };
  writeFileSync(join(extensionDir, 'manifest.json'), JSON.stringify(testManifest));

  const server = createServer((_req, res) => { res.setHeader('content-type', 'text/html'); res.end(fixture); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as { port: number }).port;

  const context = await chromium.launchPersistentContext(join(work, 'profile'), {
    channel: 'chromium',
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
    viewport: { width: 900, height: 520 },
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const page = await context.newPage();
    const external: string[] = [];
    page.on('request', (request) => { if (!request.url().startsWith(`http://127.0.0.1:${port}/`)) external.push(request.url()); });
    await page.goto(`http://127.0.0.1:${port}/`);
    const before = await page.evaluate(() => document.documentElement.outerHTML.length);

    // Seed saved settings the way the popup does (tax 10%, card 3%, target $50).
    await worker.evaluate(async () => {
      const settings = { salesTaxBps: 1000, cardFeeBps: 300, cardFixedFee: 0, defaultTargetProfit: 5000,
        warrantyTiers: [{ min: 0, max: 9999, cost: 1500 }, { min: 10000, max: 19999, cost: 2500 }, { min: 20000, max: null, cost: 3500 }] };
      await (globalThis as any).chrome.storage.local.set({ 'phonefix-extension-data': { 'phonefix-settings': JSON.stringify(settings) } });
    });

    async function rightClick(selector: string) {
      await page.evaluate((sel) => {
        const range = document.createRange();
        range.selectNodeContents(document.querySelector(sel)!);
        const selection = getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
      }, selector);
      const text = await page.evaluate(() => String(getSelection()));
      const tabId = await worker.evaluate(async (url) => (await (globalThis as any).chrome.tabs.query({ url })).at(0).id, `http://127.0.0.1:${port}/*`);
      // Same event Chrome fires when the menu item is chosen.
      await worker.evaluate(({ text, tabId }) => {
        (globalThis as any).chrome.contextMenus.onClicked.dispatch({ menuItemId: 'phonefix-suggest-price', selectionText: text }, { id: tabId });
      }, { text, tabId });
    }

    const menus = await worker.evaluate(() => (globalThis as any).chrome.runtime.getManifest().permissions);
    expect(menus).toContain('contextMenus');

    await rightClick('#price');
    const box = page.locator('#phonefix-suggest-box-host');
    await expect(box).toBeAttached();
    const ui = page.locator('#phonefix-suggest-box-host .box');
    await expect(ui).toContainText('Part cost');
    await expect(ui).toContainText('$19.40');
    await expect(ui.locator('#target')).toHaveValue('50.00');
    // $19.40 + $50 target + 3% card fee + tier-1 warranty $15.00 => lowest price (hand-checked below).
    const charge = await ui.locator('.row', { hasText: 'Charge' }).locator('span').nth(1).innerText();
    expect(charge).toMatch(/^\$\d+\.\d\d$/);
    // price = P; total = P + tax(10%); fee = 3% of total; profit = P - 19.40 - fee - 15.00 >= 50.
    const cents = Math.round(parseFloat(charge.slice(1)) * 100);
    const profit = (p: number) => { const total = p + Math.round(p * 0.1); return p - 1940 - Math.round(total * 0.03) - 1500; };
    expect(profit(cents)).toBeGreaterThanOrEqual(5000);
    expect(profit(cents - 1)).toBeLessThan(5000);
    await expect(ui).toContainText('Recommended: top of tier');
    await expect(ui).toContainText('still tier 1, same warranty');

    // Toggles and editable target.
    await ui.getByLabel('Screen repair').uncheck();
    await expect(ui).not.toContainText('Recommended: top of tier');
    await ui.getByLabel('Cash').check();
    await ui.locator('#target').fill('30');
    await expect(ui.locator('.row', { hasText: 'Charge' })).toContainText('$49.40');
    await ui.locator('#target').fill('abc');
    await expect(ui).toContainText('Enter dollars and cents');
    await ui.locator('#target').fill('50');
    await ui.getByLabel('Screen repair').check();
    await ui.getByLabel('Cash').uncheck();

    // The page is untouched apart from the one host element, and styles are isolated.
    expect(await page.evaluate(() => document.querySelector('#price')!.outerHTML)).toBe('<span class="price" id="price">$19.40</span>');
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('Georgia');

    mkdirSync('docs/issue-24', { recursive: true });
    await page.screenshot({ path: 'docs/issue-24/result-box.png' });
    expect(before).toBeGreaterThan(0);

    // Escape dismisses.
    await page.keyboard.press('Escape');
    await expect(box).toHaveCount(0);

    // Click outside dismisses.
    await rightClick('#price');
    await expect(box).toBeAttached();
    await page.mouse.click(20, 500);
    await expect(box).toHaveCount(0);

    // Range: a clear message, no guess.
    await rightClick('#range');
    await expect(ui).toContainText("Couldn't read a price");
    await expect(ui).not.toContainText('Charge');
    await page.keyboard.press('Escape');
    await expect(box).toHaveCount(0);
    expect(external).toEqual([]);
  } finally {
    await context.close();
    server.close();
    rmSync(work, { recursive: true, force: true });
  }
});
