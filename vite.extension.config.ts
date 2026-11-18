import { defineConfig } from 'vite';
import { cpSync } from 'node:fs';
import { resolve } from 'node:path';

// Separate build for the private Chrome extension popup. Output goes to
// dist-extension/ and never touches dist/ or the PWA service worker.
export default defineConfig({
  root: resolve('extension'),
  base: './',
  publicDir: false,
  build: {
    outDir: resolve('dist-extension'),
    emptyOutDir: true,
    target: 'chrome120',
    modulePreload: false,
    rollupOptions: { input: [resolve('extension/popup.html'), resolve('extension/options.html')] },
  },
  plugins: [{
    name: 'phonefix-extension-assets',
    apply: 'build',
    closeBundle() {
      const out = resolve('dist-extension');
      cpSync(resolve('extension/manifest.json'), resolve(out, 'manifest.json'));
      cpSync(resolve('public/icons'), resolve(out, 'icons'), { recursive: true });
    },
  }],
});
