import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '../src/secrets.js';

describe('bucket secret encryption', () => {
  it('round trips', () => {
    expect(decryptSecret(encryptSecret('k3y', 's1'), 's1')).toBe('k3y');
  });

  it('differs each time', () => {
    expect(encryptSecret('same', 's1')).not.toBe(encryptSecret('same', 's1'));
  });

  it('wrong session secret or tampered blob throws', () => {
    const blob = encryptSecret('k3y', 's1');
    expect(() => decryptSecret(blob, 's2')).toThrow();
    const bytes = Buffer.from(blob, 'base64');
    bytes[bytes.length - 1] ^= 1;
    expect(() => decryptSecret(bytes.toString('base64'), 's1')).toThrow();
  });
});
