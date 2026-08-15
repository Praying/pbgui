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
    // test globs resolve against root (src/pages), not the config dir —
    // anchor them to the config dir so src/shared/* tests are discovered
    include: [fileURLToPath(new URL('./src/**/*.test.ts', import.meta.url))],
  },
});
