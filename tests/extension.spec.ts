import { test, expect, chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DEFAULT_CONFIG } from '../src/config';
import { encodeSettingsCode } from '../src/settings-code';

const extensionDir = resolve('dist-extension');


test('built extension popup calculates, imports a settings code on the options page and keeps it in chrome.storage.local', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One run is enough; the popup has its own size.');
  test.setTimeout(120_000);
  execFileSync('npm', ['run', 'build:extension'], { stdio: 'pipe' });

  const manifest = JSON.parse(readFileSync(join(extensionDir, 'manifest.json'), 'utf8'));
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.permissions).toEqual(['storage', 'contextMenus', 'activeTab', 'scripting']);
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.options_ui).toEqual({ page: 'options.html', open_in_tab: true });

  const profile = mkdtempSync(join(tmpdir(), 'phonefix-ext-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
    viewport: { width: 380, height: 600 },
  });
  try {
    let [worker] = context.serviceWorkers();
    const id = worker ? new URL(worker.url()).host : await (async () => {
      // No background worker in this extension: find the id from the extensions page.
      const page = await context.newPage();
      await page.goto('chrome://extensions');
      const found = await page.evaluate(async () => {
        const items = await (globalThis as any).chrome.developerPrivate.getExtensionsInfo();
        return items.find((item: { name: string }) => item.name === 'PhoneFix Profit Calculator')?.id as string;
      });
      await page.close();
      return found;
    })();
    expect(id).toBeTruthy();

    const open = async (view: 'popup' | 'options') => {
      const page = await context.newPage();
      const errors: string[] = [];
      const external: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('request', (request) => { if (!request.url().startsWith(`chrome-extension://${id}/`)) external.push(request.url()); });
      await page.goto(`chrome-extension://${id}/${view}.html`);
      return { page, errors, external };
    };

    const first = await open('popup');
    await expect(first.page.getByRole('heading', { name: 'Repair ticket' })).toBeVisible();
    // The popup has no intro block or Settings button; settings live on the options page.
    await expect(first.page.getByRole('heading', { name: 'Know what you keep.' })).toBeHidden();
    await expect(first.page.getByRole('button', { name: 'Settings', exact: true })).toBeHidden();
    await expect(first.page.getByLabel('What should I charge?')).toBeChecked();
    // Screenshot before any ticket is entered so no warranty costs end up in a committed file.
    mkdirSync('docs/issue-23', { recursive: true });
    await first.page.screenshot({ path: 'docs/issue-23/popup.png' });
    await first.page.getByLabel('Profit from a price').check();
    await first.page.getByLabel('Repair price before tax').fill('91');
    await expect(first.page.locator('#profit')).toHaveText('$73.77');
    expect(await first.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await first.page.getByRole('button', { name: /^Clear/ }).click();
    await expect(first.page.getByLabel('What should I charge?')).toBeChecked();
    expect(first.errors).toEqual([]);
    expect(first.external).toEqual([]);
    await first.page.close();

    // Bring settings over once on the options page with the existing settings code.
    const code = await encodeSettingsCode({ ...DEFAULT_CONFIG, salesTaxBps: 1000, cardFeeBps: 300 });
    const options = await open('options');
    await expect(options.page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await expect(options.page.getByRole('heading', { name: 'Repair ticket' })).toBeHidden();
    await options.page.getByLabel('Load settings code').fill(code);
    await options.page.getByRole('button', { name: 'Review settings code' }).click();
    await options.page.getByRole('button', { name: 'Confirm and save settings' }).click();
    await expect(options.page.getByText('Settings loaded and applied.', { exact: true })).toBeVisible();
    await options.page.waitForTimeout(200);
    expect(options.errors).toEqual([]);
    expect(options.external).toEqual([]);
    await options.page.close();

    // A fresh popup reads the settings back from chrome.storage.local.
    const second = await open('popup');
    await second.page.getByLabel('Profit from a price').check();
    await expect(second.page.locator('#rates-note')).toContainText('10% sales tax');
    const stored = await second.page.evaluate(async () => {
      const data = await (globalThis as any).chrome.storage.local.get('phonefix-extension-data');
      return JSON.parse(data['phonefix-extension-data']['phonefix-settings']).salesTaxBps;
    });
    expect(stored).toBe(1000);
    expect(second.errors).toEqual([]);
    expect(second.external).toEqual([]);
  } finally {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
});
