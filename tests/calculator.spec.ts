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
