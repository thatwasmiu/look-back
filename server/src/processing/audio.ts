import { mkdir } from 'node:fs/promises';
import { absPath, keyFor } from '../storage';
import type { ProcessResult } from './image';
import { run } from './video';

/** Background music: re-encoded to AAC so every browser plays it; tags and cover art are dropped. */
export async function processAudio(srcPath: string, mediaId: string, mediaDir: string): Promise<ProcessResult> {
  const json = JSON.parse((await run('ffprobe', ['-v', 'error', '-of', 'json', '-show_format', '-show_streams', srcPath])).toString());
  if (!(json.streams ?? []).some((s: { codec_type: string }) => s.codec_type === 'audio')) throw new Error('no audio stream');
  await mkdir(absPath(mediaDir, mediaId), { recursive: true });
  const key = keyFor(mediaId, 'audio.m4a');
  await run('nice', ['-n', '10', 'ffmpeg', '-hide_banner', '-nostats', '-v', 'error', '-i', srcPath,
    '-vn', '-map_metadata', '-1', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', absPath(mediaDir, key)]);
  return { width: null, height: null, durationSec: Number(json.format?.duration) || null, blurDataUrl: null, variants: { audio: key, original: key } };
}
