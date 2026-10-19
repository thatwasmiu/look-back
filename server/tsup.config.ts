import { cpSync } from 'node:fs';
import { defineConfig } from 'tsup';

// Bundles our code + @scrapbook/shared (TS source); all other deps stay external (native sharp/sodium-native etc.).
export default defineConfig({
  entry: ['src/index.ts', 'src/worker.ts', 'src/restore.ts'],
  format: 'esm',
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  noExternal: ['@scrapbook/shared'],
  // migrate.ts resolves ./migrations relative to its own module; bundled code lives in dist/.
  onSuccess: async () => cpSync('src/migrations', 'dist/migrations', { recursive: true }),
});
