import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('discourages crawling and indexing without advertising social previews', async ({ page, request }) => {
  const builtRobots = await readFile(new URL('../dist/robots.txt', import.meta.url), 'utf8');
  expect(builtRobots).toBe('User-agent: *\nDisallow: /\n');
  const builtHtml = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  expect(builtHtml).toContain('<meta name="robots" content="noindex, nofollow, noarchive, nosnippet"');
  expect(builtHtml).toContain('<meta name="googlebot" content="noindex, nofollow"');

  const robots = await request.get('/robots.txt');
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toBe('User-agent: *\nDisallow: /\n');

  await page.goto('/');
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow, noarchive, nosnippet');
  await expect(page.locator('head meta[name="googlebot"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.locator('head meta[property^="og:"], head meta[name^="twitter:"]')).toHaveCount(0);
});
