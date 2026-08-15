/// <reference types="vitest" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { readdirSync, statSync } from 'node:fs';

// MPA: every src/pages/<page>/index.html becomes an entry; output dist/<page>/index.html
const pageEntries = Object.fromEntries(
  readdirSync('src/pages')
    .filter((name) => {
      const pageDir = `src/pages/${name}`;
      return (
        statSync(pageDir).isDirectory() &&
        statSync(`${pageDir}/index.html`, { throwIfNoEntry: false })?.isFile() === true
      );
    })
    .map((name) => [name, fileURLToPath(new URL(`src/pages/${name}/index.html`, import.meta.url))]),
);

export default defineConfig({
  // root at the pages dir so dist/<page>/index.html mirrors the serving layout
  root: 'src/pages',
  // FastAPI mounts `frontend/` at /app (PBApiServer.py) and serves the built
  // pages from frontend/dist, so asset URLs must be /app/dist/... — the default
  // absolute /assets/... would 404 at the page's own route.
  base: '/app/dist/',
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: { input: pageEntries },
  },
  server: {
    port: 5173,
    proxy: {
      // local FastAPI dev: point at your running PBApiServer
      '/api': 'http://127.0.0.1:8000',
      '/app': 'http://127.0.0.1:8000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // globs resolve against root (src/pages), where tinyglobby's absolute
    // include pattern skips files inside that directory itself — anchor the
    // scan to src/ so both src/shared/* and src/pages/* tests are discovered
    dir: fileURLToPath(new URL('./src', import.meta.url)),
    include: [fileURLToPath(new URL('./src/**/*.test.ts', import.meta.url))],
    // CLI filters (`npm test -- <filter>`) match by substring against test
    // paths relative to `dir` above. Verified filter forms (vitest 3.2.7,
    // pinned in package.json):
    //   npm test -- root_login            page name
    //   npm test -- pages/root_login      dir-relative path
    //   npm test -- shared/utils          shared module
    // Avoid repo-root prefixes (frontend/src/...) — they match nothing.
    // If vitest is upgraded, re-verify one filter before mass-migrating pages.
  },
});
