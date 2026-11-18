import { test, expect } from '@playwright/test';

test('expands the warranty reference without moving the calculator and tracks the current tier', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await page.getByLabel('Profit from a price').check();
  const reference = page.locator('#warranty-reference');
  const table = reference.getByRole('table', { name: 'Warranty tiers' });
  const rows = table.locator('tbody tr');
  const calculatorPosition = () => page.locator('.calculator').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { top: rect.top + window.scrollY, height: rect.height };
  });
  const beforeExpansion = await calculatorPosition();
  await expect(reference.locator('summary')).toBeVisible();
  await expect(table).toBeHidden();

  // Native details supports a single tap/click and keyboard activation.
  await reference.locator('summary').click();
  await expect(table).toBeVisible();
  expect(await calculatorPosition()).toEqual(beforeExpansion);
  await expect(rows).toHaveCount(12);
  await expect(rows.nth(0).getByRole('cell')).toHaveText(['$0.00 – $99.99', '$15.26', '$92.37']);
  await expect(rows.nth(1).getByRole('cell')).toHaveText(['$100.00 – $149.99', '$21.89', '$138.56']);
  await expect(rows.nth(2).getByRole('cell')).toHaveText(['$150.00 – $199.99', '$28.52', '$184.75']);
  await expect(rows.nth(11).getByRole('cell')).toHaveText(['$600.00 and up', '$88.18', '—']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const price = page.getByLabel('Repair price before tax');
  await price.fill('92.37');
  await expect(rows.nth(0)).toHaveAttribute('aria-current', 'true');
  await price.fill('92.38');
  await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(rows.nth(0)).not.toHaveAttribute('aria-current');
  await page.getByLabel('Screen repair').uncheck();
  await expect(reference.locator('tr[aria-current]')).toHaveCount(0);
  await expect(table).toBeVisible();
  await page.getByLabel('Screen repair').check();
  await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true');
  await price.fill('invalid');
  await expect(reference.locator('tr[aria-current]')).toHaveCount(0);
  await price.fill('600');
  await expect(rows.nth(11)).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByLabel('Profit from a price').check();
  await expect(reference.locator('tr[aria-current]')).toHaveCount(0);

  await reference.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(table).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(table).toBeVisible();
  expect(errors).toEqual([]);
});

test('updates the reference from saved tax and tier settings, reloads and resets', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Profit from a price').check();
  const reference = page.locator('#warranty-reference');
  const rows = reference.locator('tbody tr');
  await reference.locator('summary').click();
  await page.getByLabel('Repair price before tax').fill('91');
  await expect(rows.nth(0)).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Sales tax rate (%)').fill('10');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(rows.nth(0).getByRole('cell').last()).toHaveText('$90.90');
  await expect(rows.nth(1).getByRole('cell').last()).toHaveText('$136.35');
  await expect(rows.nth(2).getByRole('cell').last()).toHaveText('$181.81');
  await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(reference).toContainText('10% sales tax');

  await page.getByRole('group', { name: 'Tier 1', exact: true }).getByLabel('To ($)').fill('109.99');
  await page.getByRole('group', { name: 'Tier 1', exact: true }).getByLabel('Warranty cost ($)').fill('16');
  await page.getByRole('group', { name: 'Tier 2', exact: true }).getByLabel('From ($)').fill('110');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(rows.nth(0).getByRole('cell')).toHaveText(['$0.00 – $109.99', '$16.00', '$99.99']);
  await expect(rows.nth(1).getByRole('cell').first()).toHaveText('$110.00 – $149.99');
  await expect(rows.nth(0)).toHaveAttribute('aria-current', 'true');

  await page.reload();

  await page.getByLabel('Profit from a price').check();
  await reference.locator('summary').click();
  await expect(rows.nth(0).getByRole('cell')).toHaveText(['$0.00 – $109.99', '$16.00', '$99.99']);
  await expect(reference).toContainText('10% sales tax');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(rows.nth(0).getByRole('cell')).toHaveText(['$0.00 – $99.99', '$15.26', '$92.37']);
  await expect(reference).toContainText('8.25% sales tax');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
