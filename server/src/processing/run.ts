import { rm } from 'node:fs/promises';
import type pg from 'pg';
import type { Config } from '../config.js';
import type { ProcessMediaJob } from '../queue.js';
import { absPath } from '../storage.js';
import { processAudio } from './audio.js';
import { processImage } from './image.js';
import { processVideo } from './video.js';

// ext comes from the allow-listed mime, never the client filename.
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg',
};

export async function runProcessMedia(job: ProcessMediaJob, pool: pg.Pool, config: Config): Promise<void> {
  const { mediaId, uploadPath } = job;
  const mediaPath = absPath(config.mediaDir, mediaId);
  try {
    const { rows } = await pool.query('select kind, mime, status from media where id=$1', [mediaId]);
    if (!rows[0] || rows[0].status !== 'processing') return; // deleted, or already finished by an earlier attempt
    const { kind, mime } = rows[0];
    try {
      const ext = EXT[mime];
      if (!ext) throw new Error('unsupported type');
      const r = kind === 'video' ? await processVideo(uploadPath, mediaId, config.mediaDir, ext, config.videoRenditions, config.ffmpegPreset)
        : kind === 'audio' ? await processAudio(uploadPath, mediaId, config.mediaDir)
        : await processImage(uploadPath, mediaId, config.mediaDir, ext);
      const u = await pool.query(
        `update media set status='ready', width=$2, height=$3, duration_sec=$4, blur_data_url=$5, variants=$6, error=null where id=$1 and status='processing'`,
        [mediaId, r.width, r.height, r.durationSec, r.blurDataUrl, JSON.stringify(r.variants)]);
      if (u.rowCount === 0) await rm(mediaPath, { recursive: true, force: true }); // deleted while processing
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500) || 'processing failed';
      const f = await pool.query(`update media set status='failed', error=$2 where id=$1 and status='processing'`, [mediaId, msg]);
      // rm only if we still own the row, or it was deleted meanwhile (never when another attempt finished it)
      if (f.rowCount || !(await pool.query('select 1 from media where id=$1', [mediaId])).rowCount) {
        await rm(mediaPath, { recursive: true, force: true });
      }
    }
  } finally {
    await rm(uploadPath, { force: true });
    await rm(uploadPath + '.json', { force: true });
  }
}
