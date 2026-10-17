import { describe, expect, it } from 'vitest';
import { absPath, keyFor } from '../src/storage.js';

describe('storage', () => {
  it('keyFor', () => expect(keyFor('id', 'thumb.webp')).toBe('id/thumb.webp'));
  it('absPath rejects traversal', () => expect(() => absPath('/m', '../etc/passwd')).toThrow());
  it('absPath joins', () => expect(absPath('/m', 'a/b.webp')).toBe('/m/a/b.webp'));
});
