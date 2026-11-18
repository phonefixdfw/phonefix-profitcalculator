import { test, expect, type Page } from '@playwright/test';
import { DEFAULT_CONFIG } from '../src/config';
import { encodeSettingsCode } from '../src/settings-code';

function monitor(page: Page): { errors: string[]; external: string[] } {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => { if (new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url()); });
  return { errors, external };
}

test('copies saved settings, renders a local QR and imports into a fresh browser after confirmation', async ({ page, browser, baseURL }) => {
  const observed = monitor(page);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByLabel('Profit from a price').check();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Sales tax rate (%)').fill('10');
  await page.getByLabel('Card fee (%)').fill('3');
  await page.getByLabel('Fixed card fee ($)').fill('0.50');
  await page.getByLabel('Default target profit ($)').fill('91.23');
  await page.getByRole('group', { name: 'Tier 1', exact: true }).getByLabel('Warranty cost ($)').fill('20');
  await page.getByRole('group', { name: 'Tier 2', exact: true }).getByLabel('Warranty cost ($)').fill('25');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  const saved = await page.evaluate(() => localStorage.getItem('phonefix-settings'));
  await page.getByRole('button', { name: 'Copy settings code', exact: true }).click();
  await expect(page.getByText('Settings code copied.', { exact: true })).toBeVisible();
  const code = await page.getByLabel('Settings code', { exact: true }).inputValue();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  await expect(page.getByRole('img', { name: 'QR code to load these shop settings' }).locator('svg')).toBeVisible();
  const link = await page.getByRole('link', { name: 'Open settings link' }).getAttribute('href');
  expect(link).toBe(`https://calc.phone-fix.com/#settings=${code}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const fresh = await browser.newContext({ viewport: page.viewportSize()! });
  try {
    const other = await fresh.newPage();
    const otherObserved = monitor(other);
    await other.goto(`${baseURL}/${new URL(link!).hash}`);
    const dialog = other.getByRole('dialog', { name: 'Review settings changes' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Review settings changes' })).toBeInViewport();
    await expect(dialog).toContainText('8.25% → 10.00%');
    await expect(dialog).toContainText('2.00% → 3.00%');
    await expect(dialog).toContainText('$0.00 → $0.50');
    await expect(dialog).toContainText('$15.26 → $0.00–$99.99: $20.00');
    await expect(dialog).toContainText('Target profit');
    await expect(dialog).toContainText('$80.00 → $91.23');
    expect(await other.evaluate(() => localStorage.getItem('phonefix-settings'))).toBeNull();
    expect(await other.evaluate(() => location.hash)).toBe('');
    expect(await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await dialog.getByRole('button', { name: 'Confirm and save settings' }).click();
    await expect(dialog).toBeHidden();
    await expect(other.getByText('Settings loaded and applied.', { exact: true })).toBeVisible();
    expect(await other.evaluate(() => localStorage.getItem('phonefix-settings'))).toBe(saved);
    await other.getByLabel('Profit from a price').check();
    await other.getByLabel('Repair price before tax').fill('91');
    await expect(other.locator('#profit')).toHaveText('$62.50');
    await other.reload();
    await other.getByLabel('Profit from a price').check();
    await other.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(other.getByLabel('Sales tax rate (%)')).toHaveValue('10.00');
    await expect(other.getByLabel('Card fee (%)')).toHaveValue('3.00');
    await expect(other.getByLabel('Fixed card fee ($)')).toHaveValue('0.50');
    await expect(other.getByLabel('Default target profit ($)')).toHaveValue('91.23');
    await other.getByRole('button', { name: 'Settings', exact: true }).click();
    await other.getByLabel('What should I charge?').check();
    await expect(other.getByLabel('Target profit', { exact: true })).toHaveValue('91.23');
    expect(otherObserved).toEqual({ errors: [], external: [] });
  } finally { await fresh.close(); }
  expect(observed).toEqual({ errors: [], external: [] });
});

test('pasted codes require confirmation; cancel, invalid links and damaged codes preserve stored settings', async ({ page }) => {
  const observed = monitor(page);
  const code = await encodeSettingsCode({ ...DEFAULT_CONFIG, salesTaxBps: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Load settings code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Review settings code' }).click();
  await expect(page.getByRole('dialog')).toContainText('8.25% → 10.00%');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('phonefix-settings'))).toBeNull();
  await page.getByRole('button', { name: 'Review settings code' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('phonefix-settings'))).toBeNull();
  await page.getByRole('button', { name: 'Review settings code' }).click();
  await page.getByRole('button', { name: 'Confirm and save settings' }).click();
  const saved = await page.evaluate(() => localStorage.getItem('phonefix-settings'));
  await page.getByLabel('Load settings code', { exact: true }).fill(code.slice(0, -1));
  await page.getByRole('button', { name: 'Review settings code' }).click();
  await expect(page.getByText(/Invalid or damaged settings code/)).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('phonefix-settings'))).toBe(saved);
  await page.goto('/#settings=broken');
  await expect(page.getByText(/Invalid or damaged settings code/)).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe('');
  expect(await page.evaluate(() => localStorage.getItem('phonefix-settings'))).toBe(saved);
  await page.evaluate((validCode) => { location.hash = `settings=${validCode}`; }, code);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(() => location.hash)).toBe('');
  expect(await page.evaluate(() => localStorage.getItem('phonefix-settings'))).toBe(saved);
  expect(observed).toEqual({ errors: [], external: [] });
});

test('offers manual copying if clipboard access fails and preserves settings if storage fails', async ({ page }) => {
  const observed = monitor(page);
  const code = await encodeSettingsCode({ ...DEFAULT_CONFIG, salesTaxBps: 1000 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } } });
    Storage.prototype.setItem = () => { throw new Error('denied'); };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Copy settings code', exact: true }).click();
  await expect(page.getByText(/Clipboard access is unavailable/)).toBeVisible();
  await expect(page.getByLabel('Settings code', { exact: true })).toBeFocused();
  await page.getByLabel('Load settings code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Review settings code' }).click();
  await page.getByRole('button', { name: 'Confirm and save settings' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Could not save settings');
  expect(await page.evaluate(() => localStorage.getItem('phonefix-settings'))).toBeNull();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByLabel('Sales tax rate (%)')).toHaveValue('8.25');
  expect(observed).toEqual({ errors: [], external: [] });
});
