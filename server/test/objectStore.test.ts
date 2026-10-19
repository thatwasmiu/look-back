import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { bucketClient, checkBucket } from '../src/objectStore.js';
import { s3Available, testBucket } from './s3.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!s3Available)('S3 client', () => {
  it('put, list, get, delete round trip', async () => {
    const c = bucketClient(await testBucket('store-a'));
    const small = Buffer.alloc(1000, 7);
    const big = Buffer.alloc(5 * 1024 * 1024, 3);
    await c.put('a/x.bin', small, small.length);
    await c.put('a/y/z.bin', Readable.from([big.subarray(0, 1024 * 1024), big.subarray(1024 * 1024)]), big.length);
    expect((await c.list('a/')).sort((p, q) => p.key.localeCompare(q.key)))
      .toEqual([{ key: 'a/x.bin', size: 1000 }, { key: 'a/y/z.bin', size: big.length }]);
    expect(Buffer.from(await (await c.get('a/x.bin')).arrayBuffer()).equals(small)).toBe(true);
    await c.del(['a/x.bin', 'a/y/z.bin']);
    expect(await c.list('a/')).toEqual([]);
  });

  it('presigned URL works without credentials and expires', async () => {
    const c = bucketClient(await testBucket('store-b'));
    await c.put('a/x.bin', Buffer.from('hello'), 5);
    const ok = await fetch(await c.presign('a/x.bin', 600));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('hello');
    const short = await c.presign('a/x.bin', 1);
    await sleep(2100);
    expect((await fetch(short)).status).toBe(403);
  });

  it('checkBucket: null when fine, a message for a wrong secret or a missing bucket, nothing left behind', async () => {
    const b = await testBucket('store-c');
    expect(await checkBucket(b)).toBeNull();
    expect(await bucketClient(b).list('lookback-check/')).toEqual([]);
    expect(await checkBucket({ ...b, secretAccessKey: 'wrong' })).toMatch(/\S/);
    expect(await checkBucket({ ...b, bucket: 'no-such-bucket-here' })).toMatch(/\S/);
  });
});
