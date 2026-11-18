import { test, expect } from '@playwright/test';

const errors = new WeakMap<object, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') messages.push(message.text()); });
  await page.goto('/');
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('suggests the exact target price and .99 alternative with a full breakdown', async ({ page }) => {
  await page.getByLabel('What should I charge?').check();
  await expect(page.getByLabel('Target profit', { exact: true })).toHaveValue('80.00');
  await page.getByLabel('Part cost', { exact: true }).fill('50');
  await expect(page.locator('#suggested-price')).toHaveText('$162.03');
  await expect(page.locator('#price-value')).toHaveText('$162.03');
  await expect(page.locator('#total-value')).toHaveText('$175.40');
  await expect(page.locator('#tax-value')).toHaveText('$13.37');
  await expect(page.locator('#card-value')).toHaveText('$3.51');
  await expect(page.locator('#warranty-value')).toHaveText('$28.52');
  await expect(page.locator('#warranty-detail')).toContainText('tier 3');
  await expect(page.locator('#profit')).toHaveText('$80.00');
  await expect(page.locator('#nice-price')).toHaveText('Nice price: $162.99 before tax · profit $80.94');
  await page.getByLabel('Labor minutes optional').fill('45');
  await expect(page.locator('#hourly-value')).toHaveText('$106.67/hr');
  await page.getByLabel('Cash', { exact: true }).check();
  await expect(page.locator('#suggested-price')).toHaveText('$158.52');
  await page.getByLabel('Screen repair').uncheck();
  await expect(page.locator('#suggested-price')).toHaveText('$130.00');
  await expect(page.locator('#warranty-value')).toHaveText('$0.00');

  await page.getByLabel('Card', { exact: true }).check();
  await page.getByLabel('Screen repair').check();
  await page.getByLabel('Part cost', { exact: true }).fill('0');
  await page.getByLabel('Target profit', { exact: true }).fill('75.11');
  await expect(page.locator('#suggested-price')).toHaveText('$92.37');
  await expect(page.locator('#nice-price')).toContainText('profit $69.09 · below target');

  await page.getByLabel('Target profit', { exact: true }).fill('0');
  await page.getByLabel('Screen repair').uncheck();
  await expect(page.locator('#suggested-price')).toHaveText('$0.00');
  await expect(page.locator('#profit')).toHaveText('$0.00');
});

for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`shows lowest and top-of-tier prices on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await page.getByLabel('What should I charge?').check();
    await page.getByLabel('Part cost', { exact: true }).fill('50');
    await expect(page.getByRole('heading', { name: /Lowest price that hits target/ })).toBeVisible();
    await expect(page.locator('#suggested-price')).toHaveText('$162.03');
    await expect(page.getByRole('heading', { name: /Recommended: top of tier/ })).toBeVisible();
    await expect(page.locator('#top-of-tier-price')).toHaveText('$184.75');
    await expect(page.locator('#top-of-tier-note')).toContainText('warranty cost unchanged at $28.52. Adds $22.23 profit ($102.23 total)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByLabel('Target profit', { exact: true }).fill('500');
    await expect(page.locator('#top-of-tier-price')).toHaveText('None');
    await expect(page.locator('#top-of-tier-note')).toContainText('open-ended top tier');

    await page.getByLabel('Screen repair').uncheck();
    await expect(page.locator('#top-of-tier')).toBeHidden();
  });
}

test('persists and resets the default target, and explains a nearby warranty boundary', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const defaultTarget = page.getByLabel('Default target profit ($)');
  await defaultTarget.fill('-1');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(defaultTarget).toHaveAttribute('aria-invalid', 'true');
  await defaultTarget.fill('80.38');
  await page.getByRole('group', { name: 'Tier 2', exact: true }).getByLabel('Warranty cost ($)').fill('10');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('What should I charge?').check();
  await expect(page.getByLabel('Target profit', { exact: true })).toHaveValue('80.38');
  await expect(page.locator('#suggested-price')).toHaveText('$92.38');
  await expect(page.locator('#target-boundary')).toContainText('suggested price is $0.01 above that boundary');
  await page.reload();
  await page.getByLabel('What should I charge?').check();
  await expect(page.getByLabel('Target profit', { exact: true })).toHaveValue('80.38');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(page.getByLabel('Target profit', { exact: true })).toHaveValue('80.00');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByLabel('Profit from a price')).toBeChecked();
  await expect(page.locator('#target-result')).toBeHidden();
});

test('recalculates discounted tickets and hourly profit, including a full-discount loss', async ({ page }) => {
  await page.getByLabel('Repair price before tax').fill('93');
  await page.getByLabel('Part cost', { exact: true }).fill('20');
  await page.getByLabel('Discount optional, before tax').fill('0.63');
  await expect(page.locator('#price-value')).toHaveText('$92.37');
  await expect(page.locator('#total-value')).toHaveText('$99.99');
  await expect(page.locator('#tax-value')).toHaveText('$7.62');
  await expect(page.locator('#card-value')).toHaveText('$2.00');
  await expect(page.locator('#warranty-value')).toHaveText('$15.26');
  await expect(page.locator('#profit')).toHaveText('$55.11');
  await expect(page.locator('#discount-comparison')).toContainText('Profit without discount: $49.10. With discount: $55.11. Discount increases profit by $6.01');
  await expect(page.locator('#discount-tier')).toContainText('tier 2 → tier 1, saving $6.63');
  await page.getByLabel('Labor minutes optional').fill('45');
  await expect(page.locator('#hourly-value')).toHaveText('$73.48/hr');

  await page.getByLabel('Repair price before tax').fill('100');
  await page.getByLabel('Part cost', { exact: true }).fill('0');
  await page.getByLabel('Discount type').selectOption('percent');
  await page.getByLabel('Discount optional, before tax').fill('10');
  await expect(page.locator('#profit')).toHaveText('$72.79');
  await expect(page.locator('#discount-comparison')).toContainText('Discount costs you $3.15');
  await page.getByLabel('Discount optional, before tax').fill('100');
  await page.getByLabel('Part cost', { exact: true }).fill('20');
  await expect(page.locator('#profit')).toHaveText('-$35.26');
  await expect(page.locator('#profit-status')).toHaveText('Loss');
  await expect(page.locator('#hourly-value')).toHaveText('-$47.01/hr');
  await expect(page.locator('#margin')).not.toContainText('NaN');
  await page.getByLabel('Labor minutes optional').fill('0');
  await expect(page.locator('#hourly-value')).toHaveText('—');
  await page.getByLabel('Labor minutes optional').fill('');
  await expect(page.locator('#hourly-value')).toHaveText('—');
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByLabel('Discount optional, before tax')).toBeEmpty();
  await expect(page.getByLabel('Labor minutes optional')).toBeEmpty();
  await expect(page.getByLabel('Discount type')).toHaveValue('amount');
  await expect(page.locator('#discount-comparison')).toBeHidden();
});

test('rejects invalid and huge inputs without NaN, Infinity or stale suggestions', async ({ page }) => {
  const discount = page.getByLabel('Discount optional, before tax');
  await page.getByLabel('Repair price before tax').fill('100');
  for (const value of ['-1', '100.01', '1e309', 'NaN', 'Infinity', '99999999999999999999999999999999', '1.001']) {
    await discount.fill(value);
    await expect(page.locator('#discount-error')).toBeVisible();
    await expect(page.locator('#profit')).toHaveText('—');
  }
  await page.getByLabel('Discount type').selectOption('percent');
  await discount.fill('100.01');
  await expect(page.locator('#discount-error')).toHaveText('Discount cannot exceed 100%.');
  await discount.fill('');
  await expect(page.locator('#profit')).toHaveText('$75.94');
  for (const value of ['-1', 'NaN', 'Infinity', '1000000', '1e309']) {
    await page.getByLabel('Labor minutes optional').fill(value);
    await expect(page.locator('#labor-error')).toBeVisible();
    await expect(page.locator('#hourly-value')).toHaveText('—');
    await expect(page.locator('#profit')).toHaveText('$75.94');
  }
  await page.getByLabel('Labor minutes optional').fill('0.01');
  await expect(page.locator('#hourly-value')).toHaveText('$455,640.00/hr');
  await page.getByLabel('Labor minutes optional').fill('999999.99');
  await expect(page.locator('#hourly-value')).toHaveText('$0.00/hr');
  await page.getByLabel('What should I charge?').check();
  const target = page.getByLabel('Target profit', { exact: true });
  for (const value of ['', '-1', '1e309', 'Infinity', '1000000']) {
    await target.fill(value);
    await expect(page.locator('#target-error')).toBeVisible();
    await expect(page.locator('#target-result')).toBeHidden();
    await expect(page.locator('#profit')).toHaveText('—');
  }
  await target.fill('999999.99');
  await page.getByLabel('Part cost', { exact: true }).fill('999999.99');
  await expect(page.locator('#input-status')).toContainText('cannot be reached');
  await expect(page.locator('#target-result')).toBeHidden();
  await expect(page.locator('.results-panel')).not.toContainText(/NaN|Infinity/);
});
