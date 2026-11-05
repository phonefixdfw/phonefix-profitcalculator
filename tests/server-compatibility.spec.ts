import type { AddressInfo } from 'node:net';
import { hostname, networkInterfaces } from 'node:os';
import { createServer, preview } from 'vite';
import { test, expect } from '@playwright/test';

test('a cached production visit recovers into development on the same origin', async ({ page, context }) => {
  // Isolated real Vite servers leave the shared production e2e server intact.
  const errors: string[] = [];
  context.on('weberror', (error) => errors.push(error.error().message));
  const previousNodeEnv = process.env.NODE_ENV;
  const production = await preview({ preview: { port: 0, host: '0.0.0.0', strictPort: true } });
  const port = (production.httpServer.address() as AddressInfo).port;
  let productionClosed = false;
  let development: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    await page.goto(`http://127.0.0.1:${port}/?from=preview`);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Sales tax rate (%)').fill('10');
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    const savedSettings = await page.evaluate(() => ({ ...localStorage }));
    await page.evaluate(async () => {
      await caches.open('unrelated-cache');
      await caches.open('phonefix-precache-obsolete');
    });
    const secondTab = await context.newPage();
    await secondTab.goto(`http://127.0.0.1:${port}/?from=second-tab`);
    await expect.poll(() => secondTab.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await production.close();
    productionClosed = true;
    // preview() sets NODE_ENV in this process; a real dev CLI starts fresh.
    process.env.NODE_ENV = 'development';
    development = await createServer({ server: { port, host: '0.0.0.0', strictPort: true } });
    await development.listen();
    const loadedDevScripts: string[] = [];
    page.on('response', (response) => {
      if (response.ok() && response.request().resourceType() === 'script') loadedDevScripts.push(new URL(response.url()).pathname);
    });
    // The first navigation still comes from the old cache. Its production code
    // checks /sw.js, which must recover without running any new dev code first.
    const cachedNavigation = await page.reload({ waitUntil: 'commit' });
    expect(cachedNavigation?.fromServiceWorker()).toBe(true);
    await expect.poll(() => loadedDevScripts).toEqual(expect.arrayContaining(['/@vite/client', '/src/main.ts']));
    for (const tab of [page, secondTab]) {
      await expect(tab.locator('script[src="/@vite/client"]')).toBeAttached();
      await expect(tab.locator('script[src="/src/main.ts"]')).toBeAttached();
      await expect(tab.getByRole('heading', { name: 'Know what you keep.' })).toBeVisible();
      expect(await tab.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
    }
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
    expect(await page.evaluate(() => caches.keys())).toEqual(['unrelated-cache']);
    expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(savedSettings);
    await page.reload();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByLabel('Sales tax rate (%)')).toHaveValue('10.00');
    expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
    expect(new URL(page.url()).search).toBe('?from=preview');
    expect(new URL(secondTab.url()).search).toBe('?from=second-tab');
    expect(errors).toEqual([]);
  } finally {
    await development?.close();
    if (!productionClosed) await production.close();
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('dev and preview accept the shop LAN hostname and IP addresses', async ({ request }) => {
  const lanAddress = Object.values(networkInterfaces()).flat().find((address) => address?.family === 'IPv4' && !address.internal)?.address ?? '127.0.0.1';
  const production = await preview({ preview: { port: 0, host: '0.0.0.0', strictPort: true } });
  const development = await createServer({ server: { port: 0, host: '0.0.0.0', strictPort: true } });
  try {
    await development.listen();
    for (const server of [production.httpServer, development.httpServer!]) {
      const port = (server.address() as AddressInfo).port;
      for (const host of new Set(['taint', hostname()])) {
        const response = await request.get(`http://127.0.0.1:${port}/`, { headers: { Host: `${host}:${port}` } });
        expect(response.status()).toBe(200);
        expect(await response.text()).toContain('PhoneFix');
      }
      const response = await request.get(`http://${lanAddress}:${port}/`);
      expect(response.status()).toBe(200);
      expect(await response.text()).toContain('PhoneFix');
      const untrusted = await request.get(`http://127.0.0.1:${port}/`, { headers: { Host: 'untrusted.example' } });
      expect(untrusted.status()).toBe(403);
    }
  } finally {
    await development.close();
    await production.close();
  }
});
