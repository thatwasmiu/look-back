/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Container query units (cqw/cqh) need iOS 16+; older iPhones and in-app browsers on them drop every rule using
// them. Compile `Ncqh` to `calc(N * var(--cqh))`: modern browsers get --cqh = 1cqh (styles.css), older ones a px value
// per container from src/cqPolyfill.ts.
const cqVars = {
  postcssPlugin: 'cq-vars',
  Declaration(decl: { prop: string; value: string }) {
    if (decl.prop.startsWith('--') || !/\dcq[wh]\b/.test(decl.value)) return;
    decl.value = decl.value.replace(/(-?\d*\.?\d+)cq([wh])\b/g, 'calc($1 * var(--cq$2))');
  },
};

export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [cqVars] } },
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
