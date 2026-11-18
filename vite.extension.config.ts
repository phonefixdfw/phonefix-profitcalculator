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
    rollupOptions: {
      input: { popup: resolve('extension/popup.html'), options: resolve('extension/options.html'), background: resolve('src/extension-background.ts') },
      // The service worker must keep a fixed name for the manifest.
      output: { entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js') },
    },
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
