import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import secureSession from '@fastify/secure-session';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Config } from './config.js';
import { SHARE_COOKIE, shareAllowsMedia } from './share.js';

const KEYLEN = 64;
const scryptAsync = (pw: string, salt: Buffer) =>
  new Promise<Buffer>((res, rej) => scrypt(pw, salt, KEYLEN, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${(await scryptAsync(pw, salt)).toString('hex')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, saltHex, hashHex] = stored.split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length !== KEYLEN) return false;
  return timingSafeEqual(await scryptAsync(pw, Buffer.from(saltHex, 'hex')), expected);
}

declare module '@fastify/secure-session' {
  interface SessionData { owner: true; driveState?: string } // driveState: OAuth state while connecting Google Drive
}

export function registerAuth(app: FastifyInstance, config: Config, pool: pg.Pool): void {
  app.register(secureSession, {
    cookieName: 'sid',
    key: createHash('sha256').update(config.sessionSecret).digest(), // 32 bytes
    cookie: { path: '/', httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 30 * 24 * 3600 },
  });
  app.register(rateLimit, { global: false });

  // Not encapsulated, so the guard covers all routes, and runs after secure-session's hook.
  const plugin = async (a: FastifyInstance) => {
    a.addHook('onRequest', async (req, reply) => {
      // Decide on the matched route pattern, never the raw URL (it may be percent-encoded).
      // Unmatched requests have no route and fall through to the bare 404 handler.
      const route = req.routeOptions.url;
      if (route === undefined || !route.startsWith('/api/')) return;
      const key = `${req.method} ${route}`;
      // Public: login, health, a share link's album, and the media check (it decides itself, below).
      if (key === 'POST /api/auth/login' || key === 'GET /api/health' || key === 'GET /api/share/:token' || key === 'GET /api/auth/check'
        || key === 'GET /api/share/:token/preview' || key === 'GET /api/share/:token/preview.jpg') return;
      if (!req.session.get('owner')) return reply.code(401).send({ error: 'unauthorized' });
    });

    // ponytail: counts all login attempts (not only failures), per IP; fine for a single owner.
    a.post<{ Body: { password?: string } }>(
      '/api/auth/login',
      { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
      async (req, reply) => {
        const pw = req.body?.password;
        if (typeof pw !== 'string' || !(await verifyPassword(pw, config.ownerPasswordHash))) {
          return reply.code(401).send({ error: 'invalid password' });
        }
        req.session.set('owner', true);
        return reply.code(204).send();
      },
    );
    a.post('/api/auth/logout', async (req, reply) => {
      req.session.delete();
      return reply.code(204).send();
    });
    // nginx auth_request for /media/*: the owner's session, or a share-link cookie for that media's album.
    a.get('/api/auth/check', async (req, reply) => {
      if (req.session.get('owner')) return reply.code(204).send();
      const ok = await shareAllowsMedia(pool, req.cookies[SHARE_COOKIE], req.headers['x-original-uri']);
      return reply.code(ok ? 204 : 401).send();
    });
  };
  (plugin as any)[Symbol.for('skip-override')] = true;
  app.register(plugin);
}
