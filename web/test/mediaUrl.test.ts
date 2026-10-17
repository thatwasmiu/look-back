import { expect, test } from 'vitest';
import { mediaUrl } from '../src/mediaUrl';

test('mediaUrl prefixes /media by default', () => {
  expect(mediaUrl('a/thumb.webp')).toBe('/media/a/thumb.webp');
});
