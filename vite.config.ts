import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const port = process.env.PORT === undefined ? undefined : Number(process.env.PORT);

export default defineConfig({
  server: {
    port: port ?? 5173,
  },
  preview: { port: port ?? 4173 },
  plugins: [{
    name: 'phonefix-offline-build',
    apply: 'build',
    closeBundle() {
      const outDir = resolve('dist');
      const files = readdirSync(outDir, { recursive: true }).map(String)
        .filter((file) => file !== 'sw.js' && statSync(resolve(outDir, file)).isFile()).sort();
      const hash = createHash('sha256');
      for (const file of files) hash.update(file).update(readFileSync(resolve(outDir, file)));
      const version = hash.digest('hex').slice(0, 16);
      const urls = files.map((file) => `/${file}`);
      const source = readFileSync(resolve('src/service-worker.js'), 'utf8');
      writeFileSync(resolve(outDir, 'sw.js'), `const CACHE_NAME = 'phonefix-precache-${version}';\nconst PRECACHE_URLS = ${JSON.stringify(urls)};\n${source}`);
    },
  }],
});
