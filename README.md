# Scrapbook album

Private photo/video scrapbook. npm workspaces: `shared`, `server` (API + worker), `web`.
Production runs as Docker Compose: `db` (Postgres 16), `api`, `worker` (ffmpeg/sharp), `nginx` (TLS, SPA, auth-gated `/media`).

## Setup

1. `cp deploy/.env.example deploy/.env` and fill it in:
   - `SESSION_SECRET`: `openssl rand -hex 32`
   - `OWNER_PASSWORD_HASH`: `npm run hash-password -w server -- 'your password'` (on Windows without Node 22:
     `docker compose -f deploy/compose.dev.yml run --rm dev npm run hash-password -w server -- 'your password'`).
     Keep the single quotes around the value in `.env`.
   - `POSTGRES_PASSWORD`, and the same password inside `DATABASE_URL`.
2. TLS certs in `deploy/certs/fullchain.pem` + `privkey.pem` (git-ignored):
   - Local/testing: `bash deploy/make-dev-cert.sh` (self-signed, needs Docker only).
   - Real domain, either:
     - certbot standalone (port 80 free): `certbot certonly --standalone -d your.domain`, then copy/symlink
       `fullchain.pem` and `privkey.pem` from `/etc/letsencrypt/live/your.domain/`; or
     - Cloudflare Origin Certificate: save the cert as `fullchain.pem` and the key as `privkey.pem`, SSL mode "Full (strict)".
3. `docker compose -f deploy/compose.yml up -d --build`
   - Or, on a VPS, skip building and use the published images (`dastewasmiu/scrapbook-{api,worker,nginx}` on Docker Hub):
     copy `deploy/compose.yml`, `deploy/.env` and `deploy/certs/` there, then
     `docker compose -f compose.yml pull && docker compose -f compose.yml up -d`.
     Pin a version with `IMAGE_TAG=<commit>` in `.env`; use another registry/user with `IMAGE_PREFIX=<user>/scrapbook`.
   - Publish new images: `docker compose -f deploy/compose.yml build && docker compose -f deploy/compose.yml push`.
4. `SMOKE_PASSWORD='your password' bash deploy/smoke.sh` (add `BASE=https://your.domain` for a remote host). All lines should say PASS.


Stop: `docker compose -f deploy/compose.yml down` (volumes `pgdata`, `media`, `uploads` are kept; add `-v` only to wipe everything).

## Backups

- Database: `docker compose -f deploy/compose.yml exec -T db pg_dump -U scrapbook scrapbook | gzip > scrapbook-$(date +%F).sql.gz`
- Media (originals included): `docker run --rm -v scrapbook-prod_media:/media:ro -v "$PWD":/out alpine tar czf /out/media-$(date +%F).tgz -C /media .`
- `uploads` is scratch space for in-flight tus uploads; no need to back it up.

## Moving media to S3 (spec section 8)

DB rows only hold relative keys (`<mediaId>/display.webp`) and the web app builds URLs from `VITE_MEDIA_BASE_URL` (default `/media`).
To move: `aws s3 sync` the `media` volume to a bucket, put CloudFront in front, rebuild the nginx image with build arg
`VITE_MEDIA_BASE_URL=https://cdn.example.com` (`ARG` in `deploy/Dockerfile`), and change the worker's write step (`server/src/storage.ts`) to write to S3.
Note CloudFront then needs its own access control (signed cookies/URLs) in place of nginx `auth_request`.

## Manual checks still owed by the owner

- Resumable upload: start a large video upload, throttle the network (DevTools) and cut/restore it; it must resume, not restart.
- Real phone: touch-edit a page (drag, pinch, rotate) on an actual device.
- Fast-4G page-flip test: throttle to Fast 4G and flip through a full album; no empty frames.
