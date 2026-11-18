import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The injected result box must be one classic, self-contained script.
// Built after the popup/background build, into the same dist-extension/.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve('dist-extension'),
    emptyOutDir: false,
    target: 'chrome120',
    lib: { entry: resolve('src/extension-suggest-box.ts'), formats: ['iife'], name: 'PhoneFixSuggestBox', fileName: () => 'suggest-box.js' },
  },
});
