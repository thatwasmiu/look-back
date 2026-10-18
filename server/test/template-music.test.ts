import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { testApp } from './helpers.js';

// A synthetic tone stands in for a template's track.
const dir = mkdtempSync(join(tmpdir(), 'tmusic-'));
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=d=1', '-c:a', 'libmp3lame', join(dir, 'squids.mp3')]);
const t = await testApp({ templateMusicDir: dir });
afterAll(async () => { await t.app.close(); await t.pool.end(); });
const create = async (music?: string) => t.app.inject({
  method: 'POST', url: '/api/albums', headers: { cookie: await t.login() },
  payload: { title: 'T', design: { backgroundColor: 'ocean', backgroundEffect: 'bubbles', music, pages: [{ background: 'paper-cream', elements: [] }] } },
});

describe('template music', () => {
  it('a template with a track on this server starts with it as the album music (a copy goes to the worker)', async () => {
    const a = (await create('squids')).json();
    expect(a.musicMediaId).toBeTruthy();
    const m = await t.pool.query('select kind, status, mime from media where id = $1', [a.musicMediaId]);
    expect(m.rows[0]).toEqual({ kind: 'audio', status: 'processing', mime: 'audio/mpeg' });
    expect(existsSync(join(t.config.uploadDir, a.musicMediaId))).toBe(true);
    expect(existsSync(join(dir, 'squids.mp3'))).toBe(true); // the template file itself is never moved
  });

  it('no file for that name → the album is created without music', async () => {
    const res = await create('nope');
    expect(res.statusCode).toBe(201);
    expect(res.json().musicMediaId).toBeNull();
  });
});
