/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/media': {
        target: 'http://localhost:3000',
        // /dev/preview sample media: served from source by Vite, never reaches the API (dev server only).
        bypass: (req) => (req.url?.startsWith('/media/dev-samples/') ? req.url.replace('/media/dev-samples/', '/src/dev/samples/') : undefined),
      },
    },
  },
  test: { environment: 'jsdom' },
});
