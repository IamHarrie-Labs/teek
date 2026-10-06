import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({ build: { rollupOptions: { input: {
  launch: resolve(__dirname, 'index.html'), market: resolve(__dirname, 'market.html'),
} } } });
