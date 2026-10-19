import { Readable } from 'node:stream';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { Config } from '../src/config.js';
import { accessToken, authUrl, deleteFile, DriveError, ensureFolder, exchangeCode, listFolder, uploadFile } from '../src/drive.js';
import { startFakeGoogle } from './fakeGoogle.js';

const g = await startFakeGoogle();
afterAll(() => g.close());
const config = {
  googleClientId: 'cid', googleClientSecret: 'csecret',
  googleOauthBase: g.base, googleAuthBase: g.base, googleApiBase: g.base,
} as Config;

describe('Google Drive client', () => {
  it('authUrl has drive.file scope, offline access, consent prompt and the state', () => {
    const u = new URL(authUrl(config, 'https://app.test/api/manage/drive/callback', 'st4te'));
    expect(u.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file openid email');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('prompt')).toBe('consent');
    expect(u.searchParams.get('state')).toBe('st4te');
    expect(u.searchParams.get('redirect_uri')).toBe('https://app.test/api/manage/drive/callback');
  });

  it('exchanges a code for a refresh token and the account email', async () => {
    expect(await exchangeCode(config, 'abc', 'https://app.test/cb')).toEqual({ refreshToken: 'rt-abc', email: 'owner@example.com' });
  });

  it('upload in chunks round-trips the bytes', async () => {
    const token = await accessToken(config, 'rt-1');
    const folder = await ensureFolder(config, token, null);
    const data = Buffer.alloc(70 * 1024 * 1024);
    for (let i = 0; i < data.length; i += 4096) data[i] = i % 251;
    const before = g.puts();
    const seen: number[] = [];
    const r = await uploadFile(config, token, folder, 'lookback-backup-2026-10-19.tar',
      Readable.from([data.subarray(0, 10_000_000), data.subarray(10_000_000)]), (b) => seen.push(b));
    expect(r.size).toBe(data.length);
    expect(g.files.get(r.id)!.data.equals(data)).toBe(true);
    expect(g.puts() - before).toBeGreaterThanOrEqual(3);
    expect(seen.at(-1)).toBe(data.length);
    expect((await listFolder(config, token, folder)).map((f) => f.name)).toEqual(['lookback-backup-2026-10-19.tar']);
    await deleteFile(config, token, r.id);
    await deleteFile(config, token, r.id); // already gone: still fine
    expect(await listFolder(config, token, folder)).toEqual([]);
  });

  it('ensureFolder reuses or recreates', async () => {
    const token = await accessToken(config, 'rt-2');
    const a = await ensureFolder(config, token, null);
    expect(await ensureFolder(config, token, a)).toBe(a);
    g.files.get(a)!.trashed = true;
    const b = await ensureFolder(config, token, a);
    expect(b).not.toBe(a);
    expect(g.files.get(b)!.name).toBe('Look Back backup');
  });

  it('revoked refresh token → DriveError reason invalid_grant', async () => {
    g.revokeToken('rt-dead');
    const e = await accessToken(config, 'rt-dead').catch((x) => x);
    expect(e).toBeInstanceOf(DriveError);
    expect(e.reason).toBe('invalid_grant');
  });

  it('chunks are assembled without re-copying the whole buffer for every small piece', async () => {
    const token = await accessToken(config, 'rt-3');
    const folder = await ensureFolder(config, token, null);
    const pieces = Array.from({ length: 40 * 1024 }, () => Buffer.alloc(1024, 7)); // 40 MiB in 1 KiB pieces
    const concat = vi.spyOn(Buffer, 'concat');
    try {
      const r = await uploadFile(config, token, folder, 'x.tar', Readable.from(pieces));
      expect(r.size).toBe(40 * 1024 * 1024);
      expect(concat.mock.calls.length).toBeLessThan(20);
    } finally {
      concat.mockRestore();
    }
  });
});
