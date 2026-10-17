import { expect, it } from 'vitest';
import { JOB_PROCESS_MEDIA, createQueue } from '../src/queue.js';

it('process-media jobs outlive long video encodes (no 15-min default expiry)', async () => {
  const boss = await createQueue(process.env.DATABASE_URL!);
  try {
    expect(await boss.getQueue(JOB_PROCESS_MEDIA)).toMatchObject({ retryLimit: 1, expireInSeconds: 4 * 3600 });
    await boss.purgeQueue(JOB_PROCESS_MEDIA);
    await boss.send(JOB_PROCESS_MEDIA, { mediaId: 'x', uploadPath: 'x' });
    const [job] = await boss.fetch(JOB_PROCESS_MEDIA);
    expect(Number(job.expireInSeconds)).toBe(4 * 3600);
    await boss.deleteJob(JOB_PROCESS_MEDIA, job.id);
  } finally {
    await boss.stop({ graceful: false });
  }
});
