import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
const load = async (base?: string) => {
  if (base !== undefined) vi.stubEnv('VITE_MEDIA_BASE_URL', base);
  return (await import('../src/mediaUrl')).mediaUrl;
};

test('mediaUrl prefixes /media by default', async () => {
  expect((await load())('a/thumb.webp')).toBe('/media/a/thumb.webp');
});

test.each([
  ['', '/media/a/thumb.webp'],
  ['/media/', '/media/a/thumb.webp'],
  ['https://cdn.example/m/', 'https://cdn.example/m/a/thumb.webp'],
  ['https://cdn.example/m', 'https://cdn.example/m/a/thumb.webp'],
])('base %j → %s', async (base, want) => {
  expect((await load(base))('a/thumb.webp')).toBe(want);
});
