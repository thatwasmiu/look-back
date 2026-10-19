import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

// Just enough of Google OAuth + Drive v3 for the Drive backup tests (one server plays all three base URLs).
type FakeFile = { name: string; parents: string[]; data: Buffer; trashed: boolean; mimeType: string };

export async function startFakeGoogle() {
  const files = new Map<string, FakeFile>();
  const sessions = new Map<string, { name: string; parents: string[]; chunks: Buffer[] }>();
  const revoked = new Set<string>();
  let failNext: string | null = null;
  let puts = 0;

  const body = (req: IncomingMessage) => new Promise<Buffer>((ok) => {
    const parts: Buffer[] = [];
    req.on('data', (c) => parts.push(c)).on('end', () => ok(Buffer.concat(parts)));
  });
  const json = (res: ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(data));
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, base);
    const p = url.pathname;
    const raw = await body(req);
    if (p === '/token') {
      const f = new URLSearchParams(raw.toString());
      if (f.get('grant_type') === 'authorization_code') return json(res, 200, { access_token: 'at', refresh_token: `rt-${f.get('code')}`, expires_in: 3600 });
      const rt = f.get('refresh_token')!;
      if (revoked.has(rt)) return json(res, 400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
      return json(res, 200, { access_token: `at-${rt}`, expires_in: 3600 });
    }
    if (p === '/revoke') { revoked.add(url.searchParams.get('token') ?? ''); return json(res, 200, {}); }
    if (p === '/oauth2/v3/userinfo') return json(res, 200, { email: 'owner@example.com' });
    if (p === '/upload/drive/v3/files' && req.method === 'POST') {
      const meta = JSON.parse(raw.toString() || '{}');
      const sid = randomUUID();
      sessions.set(sid, { name: meta.name, parents: meta.parents ?? [], chunks: [] });
      res.writeHead(200, { location: `${base}/upload/session/${sid}` }).end();
      return;
    }
    if (p.startsWith('/upload/session/') && req.method === 'PUT') {
      puts++;
      const s = sessions.get(p.split('/').pop()!)!;
      if (failNext) {
        const reason = failNext;
        failNext = null;
        return json(res, 403, { error: { code: 403, message: `fake ${reason}`, errors: [{ reason }] } });
      }
      const m = /bytes (?:(\d+)-(\d+)|\*)\/(\d+|\*)/.exec(String(req.headers['content-range']))!;
      s.chunks.push(raw);
      if (m[3] === '*') { res.writeHead(308, { range: `bytes=0-${m[2]}` }).end(); return; }
      const id = randomUUID();
      files.set(id, { name: s.name, parents: s.parents, data: Buffer.concat(s.chunks), trashed: false, mimeType: 'application/x-tar' });
      return json(res, 200, { id, name: s.name });
    }
    if (p === '/drive/v3/files' && req.method === 'POST') {
      const meta = JSON.parse(raw.toString());
      const id = randomUUID();
      files.set(id, { name: meta.name, parents: meta.parents ?? [], data: Buffer.alloc(0), trashed: false, mimeType: meta.mimeType ?? '' });
      return json(res, 200, { id });
    }
    if (p === '/drive/v3/files' && req.method === 'GET') {
      const q = url.searchParams.get('q') ?? '';
      const parent = /'([^']+)' in parents/.exec(q)?.[1];
      const name = /name = '([^']+)'/.exec(q)?.[1];
      const folder = q.includes("mimeType = 'application/vnd.google-apps.folder'");
      const list = [...files].filter(([, f]) => !f.trashed && (!parent || f.parents.includes(parent)) && (!name || f.name === name)
        && (!folder || f.mimeType === 'application/vnd.google-apps.folder'));
      return json(res, 200, { files: list.map(([id, f]) => ({ id, name: f.name })) });
    }
    const fm = /^\/drive\/v3\/files\/([^/]+)$/.exec(p);
    if (fm) {
      const f = files.get(fm[1]);
      if (!f) return json(res, 404, { error: { code: 404, message: 'File not found', errors: [{ reason: 'notFound' }] } });
      if (req.method === 'DELETE') { files.delete(fm[1]); res.writeHead(204).end(); return; }
      return json(res, 200, { id: fm[1], name: f.name, size: String(f.data.length), trashed: f.trashed });
    }
    json(res, 404, { error: { message: `fake: no route ${req.method} ${p}` } });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base, files,
    revokeToken: (t: string) => { revoked.add(t); },
    failNextChunkWith: (reason: string) => { failNext = reason; },
    puts: () => puts,
    close: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}
