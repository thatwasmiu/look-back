import { spawn } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { absPath, keyFor } from '../storage';
import { makeBlur, writeWebp, type ProcessResult } from './image';

/** width/height are the stored (pre-rotation) size; use upright() for display size. */
export type ProbeInfo = { width: number; height: number; rotation: number; durationSec: number; hasAudio: boolean };

/** Run a command (no shell). Resolves stdout; rejects with the last ~20 stderr lines on non-zero exit. */
function run(cmd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    let err = '';
    p.stdout.on('data', (d: Buffer) => out.push(d));
    p.stderr.on('data', (d: Buffer) => { err = (err + d).slice(-8000); });
    p.on('error', reject);
    p.on('close', (code) => code === 0
      ? resolve(Buffer.concat(out))
      : reject(new Error(`${cmd} exited ${code}: ${err.trim().split('\n').slice(-20).join('\n')}`)));
  });
}

/** Throws if there is no video stream (upload filetype is client-supplied). */
export async function probe(path: string): Promise<ProbeInfo> {
  const json = JSON.parse((await run('ffprobe', ['-v', 'error', '-of', 'json', '-show_format', '-show_streams', path])).toString());
  const streams: any[] = json.streams ?? [];
  const v = streams.find((s) => s.codec_type === 'video');
  if (!v || !v.width || !v.height) throw new Error('no video stream');
  const raw = v.side_data_list?.find((d: any) => d.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0;
  const dur = Number(json.format?.duration ?? v.duration);
  return {
    width: v.width, height: v.height, rotation: Number(raw) || 0,
    durationSec: Number.isFinite(dur) ? dur : 0,
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
  };
}

/** Display size after rotation (ffmpeg autorotate applies before filters). */
export function upright(info: ProbeInfo) {
  const swap = Math.abs(info.rotation) % 180 === 90;
  return { width: swap ? info.height : info.width, height: swap ? info.width : info.height };
}

export function hlsArgs(input: string, outDir: string, info: ProbeInfo, renditions: number[], preset: string): string[] {
  const { width, height } = upright(info);
  const short = Math.min(width, height);
  const portrait = height > width;
  let rs = [...new Set(renditions)].filter((r) => r <= short).sort((a, b) => a - b);
  if (!rs.length) rs = [short - (short % 2)]; // never upscale: one rendition at source size
  const n = rs.length;

  const filter = `[0:v]split=${n}${rs.map((_, i) => `[s${i}]`).join('')};`
    + rs.map((r, i) => `[s${i}]scale=${portrait ? `${r}:-2` : `-2:${r}`}[v${i}]`).join(';');

  const args = ['-y', '-i', input, '-filter_complex', filter];
  rs.forEach((r, i) => {
    args.push('-map', `[v${i}]`);
    if (info.hasAudio) args.push('-map', '0:a:0');
    const cap = r === 1080 ? 6000 : Math.round(3000 * r / 720); // 720 -> 3000k; others scale linearly from 720
    args.push(`-maxrate:v:${i}`, `${cap}k`, `-bufsize:v:${i}`, `${cap * 2}k`);
  });
  args.push('-c:v', 'libx264', '-preset', preset, '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-crf', '23',
    '-g', '96', '-keyint_min', '96', '-sc_threshold', '0');
  if (info.hasAudio) args.push('-c:a', 'aac', '-b:a', '128k');
  args.push('-f', 'hls', '-hls_time', '4', '-hls_playlist_type', 'vod',
    '-hls_segment_filename', join(outDir, '%v_%04d.ts'),
    '-master_pl_name', 'master.m3u8',
    '-var_stream_map', rs.map((r, i) => `v:${i}${info.hasAudio ? `,a:${i}` : ''},name:${r}p`).join(' '),
    join(outDir, '%v.m3u8'));
  return args;
}

export async function processVideo(
  srcPath: string, mediaId: string, mediaDir: string, ext: string, renditions: number[], preset: string,
): Promise<ProcessResult> {
  const info = await probe(srcPath);
  const hlsDir = absPath(mediaDir, keyFor(mediaId, 'hls'));
  await mkdir(hlsDir, { recursive: true });

  await run('nice', ['-n', '10', 'ffmpeg', ...hlsArgs(srcPath, hlsDir, info, renditions, preset)]);

  const t = Math.min(1, info.durationSec / 2);
  const frame = await run('nice', ['-n', '10', 'ffmpeg', '-v', 'error', '-ss', String(t), '-i', srcPath,
    '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1']);
  await writeWebp(frame, absPath(mediaDir, keyFor(mediaId, 'poster.webp')), 2048, 80);
  await copyFile(srcPath, absPath(mediaDir, keyFor(mediaId, `original.${ext}`)));

  return {
    ...upright(info), durationSec: info.durationSec,
    blurDataUrl: await makeBlur(frame),
    variants: {
      poster: keyFor(mediaId, 'poster.webp'),
      hls: keyFor(mediaId, 'hls/master.m3u8'),
      original: keyFor(mediaId, `original.${ext}`),
    },
  };
}
