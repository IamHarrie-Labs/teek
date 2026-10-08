import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({ build: { rollupOptions: { input: {
  home: resolve(__dirname, 'index.html'), launch: resolve(__dirname, 'launch.html'), market: resolve(__dirname, 'market.html'), evidence: resolve(__dirname, 'evidence.html'), submission: resolve(__dirname, 'submission/submission.html'),
} } } });
