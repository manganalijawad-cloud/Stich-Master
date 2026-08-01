import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

export default defineConfig(() => {
  return {
    root: __dirname,
    base: './',
    envDir: repoRoot,
    plugins: [react(), tailwindcss()],
    envPrefix: ['VITE_'],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      // Allow cloud-agent / tunnel preview hosts (trycloudflare, localhost, etc.)
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      outDir: path.resolve(repoRoot, 'dist'),
      emptyOutDir: true,
    },
  };
});
