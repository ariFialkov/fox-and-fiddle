import { defineConfig } from 'vite';
import reskinFiles from './scripts/reskin-files.js';

export default defineConfig({
  plugins: [reskinFiles()],
  // relative paths, so the build works from any folder on any host (or opened inside an iframe)
  base: process.env.BASE_PATH || './',
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 100000000,   // inline small assets referenced from code or CSS
    modulePreload: false,
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});
