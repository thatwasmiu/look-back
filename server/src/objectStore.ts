import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { AwsClient } from 'aws4fetch';

// Minimal S3 client for storage locations (Cloudflare R2, Backblaze B2, any S3-compatible bucket): path-style URLs,
// SigV4 via aws4fetch. Uploads stream with UNSIGNED-PAYLOAD, so big videos never sit in memory.
export type BucketConfig = { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string };
export type ObjectInfo = { key: string; size: number };

const encKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');
const unXml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1];

// Carries the bucket's HTTP status, so callers can tell a missing object (404) from a broken bucket.
export class BucketError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function fail(what: string, res: Response): Promise<never> {
  const body = await res.text().catch(() => '');
  const detail = [tag(body, 'Code'), tag(body, 'Message')].filter(Boolean).join(': ');
  throw new BucketError(`${what}: ${res.status}${detail ? ` ${unXml(detail)}` : ''}`, res.status);
}

export function bucketClient(b: BucketConfig) {
  const aws = new AwsClient({ accessKeyId: b.accessKeyId, secretAccessKey: b.secretAccessKey, service: 's3', region: b.region });
  const base = `${b.endpoint.replace(/\/+$/, '')}/${b.bucket}`;
  const url = (key: string) => `${base}/${encKey(key)}`;

  return {
    async put(key: string, body: Readable | Buffer, size: number, contentType = 'application/octet-stream'): Promise<void> {
      // Signed without the body (UNSIGNED-PAYLOAD), then sent with Node's fetch so a stream can be the body.
      const signed = await aws.sign(url(key), {
        method: 'PUT',
        headers: { 'content-type': contentType, 'content-length': String(size), 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' },
      });
      const res = await fetch(signed.url, {
        method: 'PUT', headers: signed.headers,
        body: Buffer.isBuffer(body) ? body : (Readable.toWeb(body) as ReadableStream),
        duplex: 'half',
      } as RequestInit);
      if (!res.ok) await fail(`put ${key}`, res);
    },

    async get(key: string): Promise<Response> {
      const res = await aws.fetch(url(key));
      if (!res.ok) await fail(`get ${key}`, res);
      return res;
    },

    async list(prefix: string): Promise<ObjectInfo[]> {
      const out: ObjectInfo[] = [];
      let token: string | undefined;
      do {
        const q = new URLSearchParams({ 'list-type': '2', prefix, ...(token ? { 'continuation-token': token } : {}) });
        const res = await aws.fetch(`${base}?${q}`);
        if (!res.ok) await fail('list', res);
        const xml = await res.text();
        for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          out.push({ key: unXml(tag(m[1], 'Key') ?? ''), size: Number(tag(m[1], 'Size') ?? 0) });
        }
        token = tag(xml, 'IsTruncated') === 'true' ? unXml(tag(xml, 'NextContinuationToken') ?? '') || undefined : undefined;
      } while (token);
      return out;
    },

    // ponytail: one DELETE per object; DeleteObjects (batch) needs a Content-MD5 body, add it if deletes get slow.
    async del(keys: string[]): Promise<void> {
      for (const key of keys) {
        const res = await aws.fetch(url(key), { method: 'DELETE' });
        if (!res.ok && res.status !== 404) await fail(`delete ${key}`, res);
      }
    },

    async presign(key: string, seconds: number): Promise<string> {
      const signed = await aws.sign(`${url(key)}?X-Amz-Expires=${seconds}`, { method: 'GET', aws: { signQuery: true } });
      return signed.url;
    },
  };
}

// Write → read back → delete a tiny object. null when the bucket works, else what went wrong.
export async function checkBucket(b: BucketConfig): Promise<string | null> {
  const c = bucketClient(b);
  const key = `lookback-check/${randomUUID()}.txt`;
  try {
    await c.put(key, Buffer.from('ok'), 2, 'text/plain');
    const body = await (await c.get(key)).text();
    await c.del([key]);
    return body === 'ok' ? null : 'đọc lại file thử không khớp';
  } catch (e) {
    return (e instanceof Error ? e.message : String(e)).slice(0, 300) || 'lỗi không rõ';
  }
}
