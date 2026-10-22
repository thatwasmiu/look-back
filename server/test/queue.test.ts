import { expect, it } from 'vitest';
import { JOB_PROCESS_MEDIA, createQueue, processPriority } from '../src/queue.js';

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

it('a photo queued after a video is processed first', async () => {
  const boss = await createQueue(process.env.DATABASE_URL!);
  try {
    await boss.purgeQueue(JOB_PROCESS_MEDIA);
    await boss.send(JOB_PROCESS_MEDIA, { mediaId: 'video', uploadPath: 'v' }, { priority: processPriority('video/mp4') });
    await boss.send(JOB_PROCESS_MEDIA, { mediaId: 'photo', uploadPath: 'p' }, { priority: processPriority('image/jpeg') });
    const [first] = await boss.fetch<{ mediaId: string }>(JOB_PROCESS_MEDIA);
    expect(first.data.mediaId).toBe('photo');
    await boss.purgeQueue(JOB_PROCESS_MEDIA);
  } finally {
    await boss.stop({ graceful: false });
  }
});
