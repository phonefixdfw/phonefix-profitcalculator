// Regenerate the original app artwork using the project's Playwright Chromium.
import { mkdir, readFile, copyFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const root = new URL('../public/', import.meta.url);
await mkdir(new URL('icons/', root), { recursive: true });
const svg = await readFile(new URL('app-icon.svg', root), 'utf8');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const size of [192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
    await page.screenshot({ path: new URL(`icons/app-${size}.png`, root).pathname });
  }
  // The artwork fits inside the central 80% safe circle for maskable icons.
  await copyFile(new URL('icons/app-512.png', root), new URL('icons/app-maskable-512.png', root));
} finally { await browser.close(); }
