import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

// Bucket secret keys at rest: AES-256-GCM with a key derived from SESSION_SECRET. Changing SESSION_SECRET means
// re-entering every bucket's keys on /manage. Stored as base64(iv ‖ tag ‖ ciphertext).
const keyFrom = (sessionSecret: string) =>
  Buffer.from(hkdfSync('sha256', sessionSecret, '', 'lookback-storage-secret', 32));

export function encryptSecret(plain: string, sessionSecret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyFrom(sessionSecret), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64');
}

// Throws on a wrong SESSION_SECRET or a tampered value (GCM auth check).
export function decryptSecret(blob: string, sessionSecret: string): string {
  const b = Buffer.from(blob, 'base64');
  const d = createDecipheriv('aes-256-gcm', keyFrom(sessionSecret), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}
