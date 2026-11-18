import { test, expect, type Page } from '@playwright/test';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') messages.push(message.text()); });
  await page.goto('/');
  await page.getByLabel('Profit from a price').check();
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

async function addRepair(page: Page) {
  await page.getByRole('tab', { name: 'Saved repairs' }).click();
  await page.getByRole('button', { name: 'Add repair', exact: true }).click();
  const form = page.getByRole('form', { name: 'Add repair' });
  await form.getByLabel('Repair name').fill('iPhone 13 screen');
  await form.getByLabel('Part cost ($)').fill('45.29');
  await form.getByLabel('Usual price ($), before tax').fill('129.99');
  await form.getByLabel('Labor minutes (optional)').fill('45.25');
  await form.getByRole('button', { name: 'Save repair' }).click();
}

test('tabs work by mouse and keyboard, wrap, and preserve calculator input', async ({ page }) => {
  const calculator = page.getByRole('tab', { name: 'Calculator', exact: true });
  const saved = page.getByRole('tab', { name: 'Saved repairs', exact: true });
  await expect(page.getByRole('tablist', { name: 'Repair tools' })).toBeVisible();
  await expect(calculator).toHaveAttribute('aria-selected', 'true');
  await expect(saved).toHaveAttribute('tabindex', '-1');
  await page.getByLabel('Repair price before tax').fill('129.99');
  await saved.click();
  await expect(page.getByRole('tabpanel', { name: 'Saved repairs' })).toBeVisible();
  await expect(page.locator('#calculator-panel')).toBeHidden();
  await expect(saved).toBeFocused();
  await saved.press('ArrowRight');
  await expect(calculator).toBeFocused();
  await expect(page.getByLabel('Repair price before tax')).toHaveValue('129.99');
  await calculator.press('ArrowLeft');
  await expect(saved).toBeFocused();
  await expect(saved).toHaveAttribute('aria-selected', 'true');
  await saved.press('Home');
  await expect(calculator).toBeFocused();
  await calculator.press('End');
  await expect(saved).toBeFocused();
  await saved.press('ArrowLeft');
  await expect(calculator).toBeFocused();
  await calculator.press('ArrowRight');
  await saved.press('Tab');
  await expect(page.getByRole('button', { name: 'Add repair', exact: true })).toBeFocused();
  await calculator.click();
  await expect(page.locator('#total-value')).toHaveText('$140.71');
});

test('creates, reloads, loads, edits and confirms deletion of a saved repair', async ({ page }) => {
  await addRepair(page);
  await expect(page.getByRole('status').filter({ hasText: 'Repair saved.' })).toBeVisible();
  await page.reload();
  await page.getByLabel('Profit from a price').check();
  await page.getByLabel('Discount optional, before tax').fill('5');
  await page.getByLabel('What should I charge?').check();
  await page.getByLabel('Cash', { exact: true }).check();
  await page.getByRole('tab', { name: 'Saved repairs' }).click();
  await page.getByRole('button', { name: /^iPhone 13 screen \$/ }).click();
  await expect(page.getByRole('tab', { name: 'Calculator' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Profit from a price')).toBeChecked();
  await expect(page.getByLabel('Repair price before tax')).toHaveValue('129.99');
  await expect(page.getByLabel('Part cost', { exact: true })).toHaveValue('45.29');
  await expect(page.getByLabel('Screen repair')).toBeChecked();
  await expect(page.getByLabel('Labor minutes optional')).toHaveValue('45.25');
  await expect(page.getByLabel('Cash', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Discount optional, before tax')).toBeEmpty();
  await expect(page.locator('#loaded-repair')).toHaveText('iPhone 13 screen');
  await expect(page.locator('#total-value')).toHaveText('$140.71');

  await page.getByRole('tab', { name: 'Saved repairs' }).click();
  await page.getByRole('button', { name: 'Edit iPhone 13 screen', exact: true }).click();
  const form = page.getByRole('form', { name: 'Edit repair' });
  await expect(form.getByLabel('Repair name')).toBeFocused();
  await expect(form.getByLabel('Usual price ($), before tax')).toHaveValue('129.99');
  await form.getByLabel('Repair name').fill('iPhone 13 battery');
  await form.getByLabel('Part cost ($)').fill('31.49');
  await form.getByLabel('Usual price ($), before tax').fill('89.99');
  await form.getByLabel('Include screen warranty').uncheck();
  await form.getByLabel('Labor minutes (optional)').fill('');
  await form.getByRole('button', { name: 'Save repair' }).click();
  await expect(page.locator('.repair-title')).toHaveText('iPhone 13 battery');
  await page.reload();
  await page.getByLabel('Profit from a price').check();
  await page.getByRole('tab', { name: 'Saved repairs' }).click();
  await page.getByRole('button', { name: /^iPhone 13 battery \$/ }).click();
  await expect(page.getByLabel('Repair price before tax')).toHaveValue('89.99');
  await expect(page.getByLabel('Part cost', { exact: true })).toHaveValue('31.49');
  await expect(page.getByLabel('Screen repair')).not.toBeChecked();
  await expect(page.getByLabel('Labor minutes optional')).toBeEmpty();
  await page.getByRole('tab', { name: 'Saved repairs' }).click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Delete iPhone 13 battery', exact: true }).click();
  await expect(page.locator('.repair-title')).toHaveText('iPhone 13 battery');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete iPhone 13 battery', exact: true }).click();
  await expect(page.getByText('No saved repairs yet.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add repair', exact: true })).toBeFocused();
  await page.reload();
  await page.getByLabel('Profit from a price').check();
  await page.getByRole('tab', { name: 'Saved repairs' }).click();
  await expect(page.locator('.repair-title')).toHaveCount(0);
});

test('save current prefills the usual price, repair type and labor, including target mode', async ({ page }) => {
  await page.getByLabel('Repair price before tax').fill('150');
  await page.getByLabel('Part cost', { exact: true }).fill('50');
  await page.getByLabel('Screen repair').uncheck();
  await page.getByLabel('Labor minutes optional').fill('30.5');
  await page.getByLabel('Discount optional, before tax').fill('10');
  await page.getByRole('button', { name: 'Save current as repair' }).click();
  const form = page.getByRole('form', { name: 'Add repair' });
  await expect(form.getByLabel('Repair name')).toBeFocused();
  await expect(form.getByLabel('Usual price ($), before tax')).toHaveValue('150');
  await expect(form.getByLabel('Part cost ($)')).toHaveValue('50');
  await expect(form.getByLabel('Include screen warranty')).not.toBeChecked();
  await expect(form.getByLabel('Labor minutes (optional)')).toHaveValue('30.5');
  await form.getByLabel('Repair name').fill('Battery');
  await form.getByRole('button', { name: 'Save repair' }).click();
  await page.getByRole('button', { name: /^Battery \$/ }).click();
  await expect(page.getByLabel('Discount optional, before tax')).toBeEmpty();
  await page.getByRole('button', { name: 'Save current as repair' }).click();
  await expect(form.getByLabel('Repair name')).toHaveValue('Battery');
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.getByRole('tab', { name: 'Calculator' }).click();
  await page.getByLabel('Screen repair').check();
  await page.getByLabel('What should I charge?').check();
  await expect(page.locator('#suggested-price')).toHaveText('$162.03');
  await page.getByRole('button', { name: 'Save current as repair' }).click();
  await expect(form.getByLabel('Usual price ($), before tax')).toHaveValue('162.03');
});

test('sorts A-Z, searches lists over ten repairs, and treats names as plain text', async ({ page }) => {
  const names = ['Zulu', 'Battery', '<img src=x onerror=alert(1)>', ...Array.from({ length: 8 }, (_, i) => `iPhone ${i + 1}`)];
  await page.evaluate((names) => localStorage.setItem('phonefix-saved-repairs', JSON.stringify({ version: 1,
    repairs: names.map((name, index) => ({ id: String(index), name, price: 10000, partCost: 2000, screenRepair: false })) })), names);
  await page.reload();
  await page.getByLabel('Profit from a price').check();
  await page.getByRole('tab', { name: 'Saved repairs' }).click();
  await expect(page.locator('.repair-title')).toHaveText(['<img src=x onerror=alert(1)>', 'Battery', ...names.slice(3), 'Zulu']);
  const search = page.getByLabel('Search saved repairs');
  await expect(search).toBeVisible();
  await search.fill(' BATTERY ');
  await expect(page.locator('.repair-title')).toHaveText('Battery');
  await search.fill('missing');
  await expect(page.getByText('No repairs match your search.')).toBeVisible();
  await search.fill('Zulu');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete Zulu', exact: true }).click();
  await expect(search).toBeHidden();
  await expect(page.locator('.repair-title')).toHaveCount(10);
  await expect(page.locator('#repair-list img')).toHaveCount(0);
});

test('validates the form and keeps unsaved input when storage fails', async ({ page }) => {
  await page.getByRole('tab', { name: 'Saved repairs' }).click();
  await page.getByRole('button', { name: 'Add repair', exact: true }).click();
  const form = page.getByRole('form', { name: 'Add repair' });
  await form.getByRole('button', { name: 'Save repair' }).click();
  await expect(form.getByLabel('Repair name')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByLabel('Repair name')).toBeFocused();
  await form.getByLabel('Repair name').fill('Battery');
  await form.getByLabel('Usual price ($), before tax').fill('89.99');
  await form.getByLabel('Labor minutes (optional)').fill('-1');
  await form.getByRole('button', { name: 'Save repair' }).click();
  await expect(form.getByLabel('Labor minutes (optional)')).toHaveAttribute('aria-invalid', 'true');
  await form.getByLabel('Labor minutes (optional)').fill('');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Storage full'); }; });
  await form.getByRole('button', { name: 'Save repair' }).click();
  await expect(page.getByText('Could not save repairs in this browser.', { exact: false })).toBeVisible();
  await expect(form.getByLabel('Repair name')).toHaveValue('Battery');
  await expect(page.locator('.repair-title')).toHaveCount(0);
});

test('starts empty after corrupt storage without changing shop settings', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('phonefix-saved-repairs', '{broken'));
  await page.reload();
  await page.getByLabel('Profit from a price').check();
  await page.getByRole('tab', { name: 'Saved repairs' }).click();
  await expect(page.getByText('No saved repairs yet.', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Calculator' }).click();
  await page.getByLabel('Repair price before tax').fill('129.99');
  await expect(page.locator('#total-value')).toHaveText('$140.71');
});

test('copies named customer quotes with dollar and percent discounts, and resets the name on Clear', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByLabel('Profit from a price').check();
  await expect(page.getByRole('button', { name: 'Copy quote', exact: true })).toBeDisabled();
  await addRepair(page);
  await page.getByRole('button', { name: /^iPhone 13 screen \$/ }).click();
  async function copy(expected: string) {
    await page.getByRole('button', { name: 'Copy quote', exact: true }).click();
    await expect(page.locator('#quote-status')).toHaveText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
  }
  await copy('iPhone 13 screen: $129.99 + tax = $140.71');
  await expect(page.locator('#quote-status')).toHaveText('', { timeout: 4000 });
  await page.getByLabel('Discount optional, before tax').fill('10');
  await copy('iPhone 13 screen: $119.99 + tax = $129.89');
  await page.getByLabel('Discount type').selectOption('percent');
  await copy('iPhone 13 screen: $116.99 + tax = $126.64');
  await page.getByLabel('Discount optional, before tax').fill('100');
  await copy('iPhone 13 screen: $0.00 + tax = $0.00');
  await page.getByLabel('Discount optional, before tax').fill('101');
  await expect(page.getByRole('button', { name: 'Copy quote', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.locator('#loaded-repair')).toBeHidden();
  await expect(page.getByLabel('What should I charge?')).toBeChecked();
  await page.getByLabel('Profit from a price').check();
  await page.getByLabel('Repair price before tax').fill('129.99');
  await copy('Repair: $129.99 + tax = $140.71');
  await page.getByLabel('What should I charge?').check();
  await page.getByLabel('Part cost', { exact: true }).fill('50');
  await copy('Repair: $162.03 + tax = $175.40');
});

for (const unavailable of [true, false]) {
  test(`selects a customer quote for manual copying when the Clipboard API is ${unavailable ? 'missing' : 'denied'}`, async ({ page }) => {
    await page.evaluate((missing) => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: missing ? undefined
        : { writeText: () => Promise.reject(new Error('Permission denied')) } });
    }, unavailable);
    await page.getByLabel('Repair price before tax').fill('129.99');
    await page.getByRole('button', { name: 'Copy quote', exact: true }).click();
    const quote = page.getByLabel('Quote to copy');
    await expect(quote).toBeVisible();
    await expect(quote).toBeFocused();
    await expect(quote).toHaveValue('Repair: $129.99 + tax = $140.71');
    expect(await quote.evaluate((node: HTMLTextAreaElement) => node.value.slice(node.selectionStart, node.selectionEnd))).toBe('Repair: $129.99 + tax = $140.71');
    await expect(page.locator('#quote-status')).toContainText('Copy the selected quote');
    await page.getByLabel('Repair price before tax').fill('100');
    await expect(quote).toBeHidden();
  });
}
