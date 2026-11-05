import { test, expect } from '@playwright/test';

test('calculates live, shows tier hints, and resets for the next ticket', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname !== '127.0.0.1') externalRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Know what you keep.' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Enter a repair price' })).toBeVisible();
  await page.getByLabel('Repair price before tax').fill('91');
  await expect(page.locator('#profit')).toHaveText('$73.77');
  await expect(page.locator('#cliff-hint')).toBeHidden();
  await expect(page.locator('#tier-limit')).toContainText('$92.37');

  await page.getByLabel('Repair price before tax').fill('93');
  await expect(page.locator('#profit')).toHaveText('$69.10');
  await expect(page.locator('#total-value')).toHaveText('$100.67');
  await expect(page.locator('#cliff-copy')).toHaveText("At $92.37, the warranty costs $15.26. You'd make $6.01 more than at $93.00.");
  await expect(page.locator('#cliff-hint')).toContainText('$6.01 more');
  await expect(page.locator('#tier-limit')).toContainText('$138.56');

  await page.getByLabel('Cash', { exact: true }).check();
  await expect(page.locator('#card-value')).toHaveText('$0.00');
  await expect(page.locator('#profit')).toHaveText('$71.11');
  await page.getByLabel('Screen repair').uncheck();
  await expect(page.locator('#warranty-value')).toHaveText('$0.00');
  await expect(page.locator('#profit')).toHaveText('$93.00');
  await expect(page.locator('#cliff-hint')).toBeHidden();
  await expect(page.locator('#tier-limit')).toBeHidden();
  await page.getByLabel('Card', { exact: true }).check();
  await expect(page.locator('#profit')).toHaveText('$90.99');

  await page.getByLabel('Part cost', { exact: true }).fill('100');
  await expect(page.locator('#profit')).toHaveText('-$9.01');
  await expect(page.locator('#profit-status')).toHaveText('Loss');
  await expect(page.locator('#margin')).toContainText('-9.7%');
  await expect(page.locator('.profit-card')).toHaveClass(/is-loss/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByLabel('Repair price before tax')).toBeEmpty();
  await expect(page.getByLabel('Repair price before tax')).toBeFocused();
  await expect(page.getByLabel('Part cost', { exact: true })).toHaveValue('0.00');
  await expect(page.getByLabel('Screen repair')).toBeChecked();
  await expect(page.getByLabel('Card', { exact: true })).toBeChecked();
  await expect(page.locator('#profit')).toHaveText('—');
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test('ties higher-tier warranty suggestions to the exact suggested price', async ({ page }) => {
  await page.goto('/');
  const price = page.getByLabel('Repair price before tax');

  await price.fill('139');
  await expect(page.locator('#warranty-value')).toHaveText('$28.52');
  await expect(page.locator('#cliff-hint')).toBeVisible();
  await expect(page.locator('#cliff-copy')).toHaveText("At $138.56, the warranty costs $21.89. You'd make $6.20 more than at $139.00.");
  await expect(page.locator('#cliff-profit')).toHaveText('Net profit at $138.56: $113.67');

  await price.fill('138.56');
  await expect(page.locator('#total-value')).toHaveText('$149.99');
  await expect(page.locator('#warranty-value')).toHaveText('$21.89');
  await expect(page.locator('#profit')).toHaveText('$113.67');
  await expect(page.locator('#cliff-hint')).toBeHidden();

  // Below tier 2's lower boundary, the warranty is cheaper than at the suggested price.
  await price.fill('90');
  await expect(page.locator('#total-value')).toHaveText('$97.43');
  await expect(page.locator('#warranty-value')).toHaveText('$15.26');
  await expect(page.locator('#warranty-detail')).toContainText('tier 1');
  await expect(page.locator('#cliff-hint')).toBeHidden();
});

test('handles invalid, empty, zero and huge amounts without stale results or overflow', async ({ page }) => {
  await page.goto('/');
  const price = page.getByLabel('Repair price before tax');
  await price.fill('93');
  await expect(page.locator('#profit')).toHaveText('$69.10');
  for (const value of ['', '0', '-5', 'hello', 'NaN', 'Infinity', '1e309', '9999999999999999999999', '12.345']) {
    await price.fill(value);
    await expect(page.locator('#profit')).toHaveText('—');
    await expect(page.locator('#input-status')).toBeVisible();
    await expect(page.locator('#cliff-hint')).toBeHidden();
    await expect(page.locator('.results-panel')).not.toContainText(/NaN|Infinity/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await price.fill('93');
  await page.getByLabel('Part cost', { exact: true }).fill('');
  await expect(page.locator('#part-error')).toHaveText('Enter an amount.');
  await expect(page.locator('#profit')).toHaveText('—');
  await page.getByLabel('Part cost', { exact: true }).fill('0');
  await expect(page.locator('#profit')).toHaveText('$69.10');
  await price.fill('999999.99');
  await expect(page.locator('#profit')).toHaveText('$978,261.81');
  await expect(page.locator('#tier-limit')).toContainText('highest warranty tier');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('saves settings, applies them immediately, and restores them after reload', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Repair price before tax').fill('91');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Sales tax rate (%)').fill('10');
  await page.getByLabel('Card fee (%)').fill('3');
  await page.getByLabel('Fixed card fee ($)').fill('0.50');
  await page.getByRole('group', { name: 'Tier 2' }).getByLabel('Warranty cost ($)').fill('25');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved and applied.')).toBeVisible();
  await expect(page.locator('#tax-value')).toHaveText('$9.10');
  await expect(page.locator('#card-value')).toHaveText('$3.50');
  await expect(page.locator('#warranty-value')).toHaveText('$25.00');
  await expect(page.locator('#warranty-detail')).toContainText('tier 2');
  await expect(page.locator('#profit')).toHaveText('$62.50');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.reload();
  await page.getByLabel('Repair price before tax').fill('91');
  await expect(page.locator('#profit')).toHaveText('$62.50');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Sales tax rate (%)')).toHaveValue('10.00');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(page.locator('#profit')).toHaveText('$73.77');
  await page.reload();
  await page.getByLabel('Repair price before tax').fill('91');
  await expect(page.locator('#profit')).toHaveText('$73.77');
});

test('rejects invalid tiers and falls back from corrupt stored settings', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('phonefix-settings', '{broken'));
  await page.reload();
  await page.getByLabel('Repair price before tax').fill('91');
  await expect(page.locator('#profit')).toHaveText('$73.77');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const tier = page.getByRole('group', { name: 'Tier 2' });
  await tier.getByLabel('From ($)').fill('101');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(tier.getByText(/There is a gap/)).toBeVisible();
  await tier.getByLabel('From ($)').fill('99.99');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(tier.getByText(/Tiers overlap/)).toBeVisible();
  await tier.getByLabel('From ($)').fill('100');
  await tier.getByLabel('Warranty cost ($)').fill('-1');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(tier.getByText(/\$0.00 or more/)).toBeVisible();
  await tier.getByLabel('Warranty cost ($)').fill('');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(tier.getByText('Enter an amount.')).toBeVisible();
  await expect(page.locator('#profit')).toHaveText('$73.77');
  expect(await page.evaluate(() => localStorage.getItem('phonefix-settings'))).toBe('{broken');
});

test('edits warranty rows and supports keyboard access', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Sales tax rate (%)')).toBeFocused();
  await page.getByRole('button', { name: 'Add tier' }).click();
  await expect(page.getByRole('group', { name: 'Tier 13' }).getByLabel('From ($)')).toBeFocused();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('group', { name: 'Tier 12' }).getByText(/Only the last tier/)).toBeVisible();
  await page.getByRole('button', { name: 'Remove tier 13' }).click();
  await expect(page.getByRole('button', { name: 'Add tier' })).toBeFocused();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved and applied.')).toBeVisible();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(page.getByText('Settings saved and applied.')).toBeVisible();
});
