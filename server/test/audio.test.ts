import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { processAudio } from '../src/processing/audio';
import { absPath } from '../src/storage';

const ff = (...a: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
let dir: string;
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'aud-')); });

describe('processAudio', () => {
  it('re-encodes music to AAC (m4a) and reports its length', async () => {
    const src = join(dir, 'in.mp3');
    ff('-f', 'lavfi', '-i', 'sine=d=2', '-c:a', 'libmp3lame', src);
    const r = await processAudio(src, 'a1', dir);
    expect(r.variants).toEqual({ audio: 'a1/audio.m4a', original: 'a1/audio.m4a' });
    expect(existsSync(absPath(dir, 'a1/audio.m4a'))).toBe(true);
    expect(r.durationSec).toBeGreaterThan(1.5);
    expect(r.width).toBeNull();
  });

  it('rejects a file without an audio stream', async () => {
    const src = join(dir, 'silent.mp4');
    ff('-f', 'lavfi', '-i', 'testsrc2=s=64x64:d=1:r=5', src);
    await expect(processAudio(src, 'a2', dir)).rejects.toThrow('no audio stream');
  });
});
