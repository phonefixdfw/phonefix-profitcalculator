import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test, expect, type Page } from '@playwright/test';

async function waitForOfflineApp(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>((done) => navigator.serviceWorker.addEventListener('controllerchange', () => done(), { once: true }));
  });
}

test('has an installable manifest, correctly sized icons and a controlling service worker', async ({ page, context }) => {
  await page.goto('/');
  await waitForOfflineApp(page);
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({
    name: 'PhoneFix Profit Calculator', short_name: 'Profit Calc',
    start_url: '/', scope: '/', display: 'standalone',
    theme_color: '#00787d', background_color: '#fafbf7',
  });
  expect(manifest.icons.map((icon: { purpose: string }) => icon.purpose)).toContain('maskable');
  for (const icon of manifest.icons) {
    const dimensions = await page.evaluate((src: string) => new Promise<string>((done, reject) => {
      const image = new Image();
      image.onload = () => done(`${image.naturalWidth}x${image.naturalHeight}`);
      image.onerror = reject;
      image.src = src;
    }), icon.src);
    expect(dimensions).toBe(icon.sizes);
  }
  const session = await context.newCDPSession(page);
  await expect.poll(async () => (await session.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([]);
  await session.detach();
});

test('opens and calculates offline after the first visit, including settings and locally generated QR', async ({ page, context }) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url()); });
  await page.goto('/');
  await waitForOfflineApp(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Sales tax rate (%)').fill('10');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Know what you keep.' })).toBeVisible();
    await page.getByLabel('Repair price before tax').fill('91');
    await expect(page.locator('#tax-value')).toHaveText('$9.10');
    await expect(page.locator('#profit')).toHaveText('$67.11');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByLabel('Sales tax rate (%)')).toHaveValue('10.00');
    await page.getByRole('button', { name: 'Copy settings code', exact: true }).click();
    await expect(page.locator('#settings-qr svg')).toBeVisible();
    const code = await page.getByLabel('Settings code', { exact: true }).inputValue();
    await page.goto(`/?from=home#settings=${code}`);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm and save settings' }).click();
    expect(await page.evaluate(() => location.hash)).toBe('');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.setOffline(false); }
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('offers a waiting deploy on the next load and activates it only after reload confirmation', async ({ page }) => {
  // A private fixture origin changes only the deployed worker revision. Other
  // parallel tests continue to use the unmodified production preview.
  let updated = false;
  const types: Record<string, string> = { js: 'text/javascript', css: 'text/css', html: 'text/html', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml' };
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url!, 'http://localhost').pathname;
    try {
      let content = await readFile(resolve('dist', pathname === '/' ? 'index.html' : pathname.slice(1)));
      if (pathname === '/sw.js' && updated) content = Buffer.from(content.toString().replace(/phonefix-precache-([a-f0-9]+)/, 'phonefix-precache-$1-updated'));
      response.writeHead(200, { 'Content-Type': types[pathname.split('.').at(-1)!] ?? 'text/html', 'Cache-Control': 'no-store' });
      response.end(content);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address() as { port: number };
  try {
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await waitForOfflineApp(page);
    const before = await page.evaluate(() => caches.keys());
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Sales tax rate (%)').fill('10');
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    updated = true;
    await page.reload();
    await expect(page.getByRole('button', { name: 'Updated, reload' })).toBeVisible();
    await page.getByLabel('Repair price before tax').fill('91');
    await expect(page.locator('#tax-value')).toHaveText('$9.10');
    const waiting = await page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting));
    expect(waiting).toBe(true);
    await page.getByRole('button', { name: 'Updated, reload' }).click();
    await expect(page.getByRole('button', { name: 'Updated, reload' })).toBeHidden();
    await expect(page.getByLabel('Repair price before tax')).toBeEmpty();
    await expect.poll(() => page.evaluate(() => caches.keys())).toEqual(before.map((name) => name + '-updated'));
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByLabel('Sales tax rate (%)')).toHaveValue('10.00');
  } finally {
    await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
  }
});
