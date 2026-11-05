import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hostname } from 'node:os';

const port = process.env.PORT === undefined ? undefined : Number(process.env.PORT);
const allowedHosts = ['taint', hostname()];

export default defineConfig({
  server: {
    port: port ?? 5173,
    allowedHosts,
  },
  preview: { port: port ?? 4173, allowedHosts },
  plugins: [{
    name: 'phonefix-dev-worker-cleanup',
    apply: 'serve',
    configureServer(server) {
      // A cached production page can hide the dev bundle. Replace its worker
      // at the registered URL so recovery also works for those existing tabs.
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== '/sw.js') return next();
        response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
        response.end(readFileSync(resolve('src/dev-service-worker.js'), 'utf8'));
      });
    },
  }, {
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
