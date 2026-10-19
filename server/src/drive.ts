import type { Readable } from 'node:stream';
import type { Config } from './config.js';

// Minimal Google OAuth + Drive v3 client for the automatic backup (plain fetch, no SDK). Scope drive.file: the app
// only sees files it created itself.
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file openid email';
export const FOLDER_NAME = 'Look Back backup';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const CHUNK = 32 * 1024 * 1024; // resumable upload chunk: a multiple of 256 KiB

export class DriveError extends Error {
  constructor(message: string, readonly status: number, readonly reason?: string) { super(message); }
}

async function check(res: Response, what: string): Promise<Response> {
  if (res.ok || res.status === 308) return res;
  const body = await res.json().catch(() => null) as { error?: string | { message?: string; errors?: { reason?: string }[] }; error_description?: string } | null;
  const err = body?.error;
  const reason = typeof err === 'string' ? err : err?.errors?.[0]?.reason;
  const message = (typeof err === 'string' ? body?.error_description ?? err : err?.message) ?? res.statusText;
  throw new DriveError(`${what}: ${message}`, res.status, reason);
}

export function authUrl(config: Config, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: config.googleClientId, redirect_uri: redirectUri, response_type: 'code',
    scope: DRIVE_SCOPE, access_type: 'offline', prompt: 'consent', state,
  });
  return `${config.googleAuthBase}/o/oauth2/v2/auth?${q}`;
}

const token = (config: Config, form: Record<string, string>) => fetch(`${config.googleOauthBase}/token`, {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: config.googleClientId, client_secret: config.googleClientSecret, ...form }),
});

export async function exchangeCode(config: Config, code: string, redirectUri: string): Promise<{ refreshToken: string; email: string }> {
  const t = await (await check(await token(config, { grant_type: 'authorization_code', code, redirect_uri: redirectUri }), 'đăng nhập Google')).json() as { access_token: string; refresh_token?: string };
  if (!t.refresh_token) throw new DriveError('Google không trả về refresh token — hãy kết nối lại.', 400);
  const me = await (await check(await fetch(`${config.googleApiBase}/oauth2/v3/userinfo`, { headers: { authorization: `Bearer ${t.access_token}` } }), 'userinfo')).json() as { email?: string };
  return { refreshToken: t.refresh_token, email: me.email ?? '' };
}

export async function accessToken(config: Config, refreshToken: string): Promise<string> {
  const t = await (await check(await token(config, { grant_type: 'refresh_token', refresh_token: refreshToken }), 'token')).json() as { access_token: string };
  return t.access_token;
}

const api = (config: Config, tok: string, path: string, init: RequestInit = {}) =>
  fetch(`${config.googleApiBase}/drive/v3/${path}`, { ...init, headers: { authorization: `Bearer ${tok}`, ...init.headers } });

// The backup folder: the remembered one if it still exists (not trashed), else one named FOLDER_NAME, else a new one.
export async function ensureFolder(config: Config, tok: string, folderId: string | null): Promise<string> {
  if (folderId) {
    const r = await api(config, tok, `files/${folderId}?fields=id,trashed`);
    if (r.ok && !((await r.json()) as { trashed?: boolean }).trashed) return folderId;
  }
  const q = `name = '${FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const found = await (await check(await api(config, tok, `files?q=${encodeURIComponent(q)}&fields=files(id,name)`), 'tìm thư mục')).json() as { files: { id: string }[] };
  if (found.files[0]) return found.files[0].id;
  const made = await (await check(await api(config, tok, 'files', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
  }), 'tạo thư mục')).json() as { id: string };
  return made.id;
}

export async function listFolder(config: Config, tok: string, folderId: string): Promise<{ id: string; name: string }[]> {
  const q = `'${folderId}' in parents and trashed = false`;
  const r = await (await check(await api(config, tok, `files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=100`), 'liệt kê backup')).json() as { files: { id: string; name: string }[] };
  return r.files;
}

// Resumable upload of a stream of unknown length: 32 MiB chunks with "bytes a-b/*", the last one with the total.
export async function uploadFile(config: Config, tok: string, folderId: string, name: string, body: Readable,
  onProgress?: (bytes: number) => void): Promise<{ id: string; size: number }> {
  const start = await check(await fetch(`${config.googleApiBase}/upload/drive/v3/files?uploadType=resumable`, {
    method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ name, parents: [folderId] }),
  }), 'bắt đầu tải lên');
  const session = start.headers.get('location');
  if (!session) throw new DriveError('Drive không trả về địa chỉ tải lên', 500);
  let sent = 0;
  const put = async (chunk: Buffer, total: number | null) => {
    const range = chunk.length ? `bytes ${sent}-${sent + chunk.length - 1}/${total ?? '*'}` : `bytes */${total}`;
    const res = await check(await fetch(session, { method: 'PUT', headers: { 'content-range': range }, body: new Uint8Array(chunk), redirect: 'manual' }), 'tải lên');
    sent += chunk.length;
    onProgress?.(sent);
    return res;
  };
  let buf = Buffer.alloc(0);
  for await (const c of body) {
    buf = Buffer.concat([buf, c as Buffer]);
    while (buf.length > CHUNK) { // strictly more: the final chunk always carries the total
      await put(buf.subarray(0, CHUNK), null);
      buf = buf.subarray(CHUNK);
    }
  }
  const last = await put(buf, sent + buf.length);
  const { id } = await last.json() as { id: string };
  const meta = await (await check(await api(config, tok, `files/${id}?fields=size`), 'kiểm tra file')).json() as { size?: string };
  return { id, size: Number(meta.size ?? 0) };
}

export async function deleteFile(config: Config, tok: string, id: string): Promise<void> {
  const r = await api(config, tok, `files/${id}`, { method: 'DELETE' });
  if (r.status !== 404) await check(r, 'xoá file');
}

export async function revoke(config: Config, refreshToken: string): Promise<void> {
  await fetch(`${config.googleOauthBase}/revoke?token=${encodeURIComponent(refreshToken)}`, { method: 'POST' });
}
