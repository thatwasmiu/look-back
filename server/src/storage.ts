import { resolve, sep } from 'node:path';

export const keyFor = (mediaId: string, variant: string) => `${mediaId}/${variant}`;

export function absPath(mediaDir: string, key: string): string {
  const root = resolve(mediaDir);
  const p = resolve(root, key);
  if (!p.startsWith(root + sep)) throw new Error('path escapes mediaDir');
  return p;
}
