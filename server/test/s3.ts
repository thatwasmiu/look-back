import { AwsClient } from 'aws4fetch';
import { bucketClient, type BucketConfig } from '../src/objectStore.js';

// The dev compose file runs an S3-compatible server (versitygw); tests needing it skip without it.
export const s3Available = !!process.env.S3_TEST_ENDPOINT;

// A fresh, empty bucket on the test server (created on first use).
export async function testBucket(name: string): Promise<BucketConfig> {
  const b: BucketConfig = {
    endpoint: process.env.S3_TEST_ENDPOINT!, region: 'us-east-1', bucket: name,
    accessKeyId: process.env.S3_TEST_KEY!, secretAccessKey: process.env.S3_TEST_SECRET!,
  };
  const aws = new AwsClient({ accessKeyId: b.accessKeyId, secretAccessKey: b.secretAccessKey, service: 's3', region: b.region });
  const r = await aws.fetch(`${b.endpoint}/${name}`, { method: 'PUT' });
  if (!r.ok && r.status !== 409) throw new Error(`create bucket ${name}: ${r.status} ${await r.text()}`);
  const c = bucketClient(b);
  await c.del((await c.list('')).map((o) => o.key));
  return b;
}
