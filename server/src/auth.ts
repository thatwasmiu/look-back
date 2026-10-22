import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import secureSession from '@fastify/secure-session';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Config } from './config.js';
import { guestAlbum, guestAllowsMedia } from './editLinks.js';
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
  // driveState: OAuth state while connecting Google Drive. guest: an album's edit link opened in this browser.
  // seen: day number of the owner's last request, to keep an active login alive (see the guard).
  interface SessionData { owner: true; seen?: number; driveState?: string; guest?: { albumId: string; token: string } }
}

const SESSION_DAYS = 30;

export function registerAuth(app: FastifyInstance, config: Config, pool: pg.Pool): void {
  app.register(secureSession, {
    cookieName: 'sid',
    key: createHash('sha256').update(config.sessionSecret).digest(), // 32 bytes
    // 30 days (the plugin's default is 1 day: the owner had to log in again every day), renewed by use below.
    expiry: SESSION_DAYS * 24 * 3600,
    cookie: { path: '/', httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: SESSION_DAYS * 24 * 3600 },
  });
  app.register(rateLimit, { global: false });

  // Edit-link guests reach only these, and each handler keeps them to their own album.
  const GUEST_ROUTES = new Set(['PUT /api/pages/:id', 'GET /api/media/:id']);
  const guestRoute = (method: string, route: string) =>
    GUEST_ROUTES.has(`${method} ${route}`) || ((route === '/api/uploads' || route === '/api/uploads/*') && method !== 'DELETE');
  app.decorateRequest('guestAlbumId', null);

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
        || key === 'GET /api/share/:token/preview' || key === 'GET /api/share/:token/preview.jpg' || key === 'GET /api/edit/:token' || key === 'GET /api/manifest/:kind/:token') return;
      if (req.session.get('owner')) {
        // Rolling login: once a day, re-issue the cookie, so it only runs out after 30 days without opening the app.
        const day = Math.floor(Date.now() / 864e5);
        if (req.session.get('seen') !== day) req.session.set('seen', day);
        return;
      }
      if (guestRoute(req.method, route)) {
        req.guestAlbumId = await guestAlbum(pool, req);
        if (req.guestAlbumId) return;
      }
      return reply.code(401).send({ error: 'unauthorized' });
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
      const uri = req.headers['x-original-uri'];
      const ok = await shareAllowsMedia(pool, req.cookies[SHARE_COOKIE], uri) || await guestAllowsMedia(pool, req, uri);
      return reply.code(ok ? 204 : 401).send();
    });
  };
  (plugin as any)[Symbol.for('skip-override')] = true;
  app.register(plugin);
}
