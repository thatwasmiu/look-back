# Look Back

Private photo/video scrapbook. npm workspaces: `shared`, `server` (API + worker), `web`.
Production runs as Docker Compose: `db` (Postgres 16), `api`, `worker` (ffmpeg/sharp), `nginx` (SPA, auth-gated `/media`).

## Setup

1. `cp deploy/.env.example deploy/.env` and fill it in:
   - `SESSION_SECRET`: `openssl rand -hex 32`
   - `OWNER_PASSWORD_HASH`: `npm run hash-password -w server -- 'your password'` (on Windows without Node 22:
     `docker compose -f deploy/compose.dev.yml run --rm dev npm run hash-password -w server -- 'your password'`).
     Keep the single quotes around the value in `.env`.
   - `POSTGRES_PASSWORD`, and the same password inside `DATABASE_URL`.
2. `docker compose -f deploy/compose.yml up -d --build`
   - Or, on a VPS, skip building and use the published images (`dastewasmiu/scrapbook-{api,worker,nginx}` on Docker Hub):
     copy `deploy/compose.yml` and `deploy/.env` there, then
     `docker compose -f compose.yml pull && docker compose -f compose.yml up -d`.
     Pin a version with `IMAGE_TAG=<commit>` in `.env`; use another registry/user with `IMAGE_PREFIX=<user>/scrapbook`.
   - Publish new images: `docker compose -f deploy/compose.yml build && docker compose -f deploy/compose.yml push`.
3. Point your HTTPS nginx at it (below).
4. `SMOKE_PASSWORD='your password' bash deploy/smoke.sh` (add `BASE=https://your.domain` to test through the outer nginx). All lines should say PASS.

### Default: behind your own HTTPS nginx

The app's nginx serves **plain HTTP on `127.0.0.1:8080` only** (unreachable from outside the host) and takes the
visitor's IP from the outer proxy's `X-Forwarded-For` — needed for the login rate limit. Your nginx on the host
terminates HTTPS (certbot, Cloudflare origin cert, …) and proxies everything:

```nginx
server {
  listen 443 ssl;
  http2 on;
  server_name album.example.com;
  ssl_certificate     /etc/letsencrypt/live/album.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/album.example.com/privkey.pem;

  client_max_body_size 60m;        # tus uploads send 50 MiB chunks
  proxy_request_buffering off;     # stream uploads instead of buffering them to disk first
  proxy_buffering off;             # stream video segments
  proxy_read_timeout 300s;
  proxy_send_timeout 300s;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;   # overwrite, don't append: clients can't spoof their IP
    proxy_set_header X-Forwarded-Proto https;
  }
}
server {
  listen 80;
  server_name album.example.com;
  return 301 https://$host$request_uri;
}
```

Locally (no outer nginx) just open http://localhost:8080.

### Alternative: HTTPS directly from the app (no outer nginx)

`docker compose -f deploy/compose.yml -f deploy/compose.standalone.yml up -d` — the app's nginx listens on 80/443
itself. Put certs in `deploy/certs/fullchain.pem` + `privkey.pem` (git-ignored):
- Local/testing: `bash deploy/make-dev-cert.sh` (self-signed, needs Docker only).
- Real domain: certbot standalone (`certbot certonly --standalone -d your.domain`, then copy `fullchain.pem` and
  `privkey.pem` from `/etc/letsencrypt/live/your.domain/`), or a Cloudflare Origin Certificate (SSL mode "Full (strict)").
- Smoke test with `BASE=https://localhost`.

Stop: `docker compose -f deploy/compose.yml down` (volumes `pgdata`, `media`, `uploads` are kept; add `-v` only to wipe everything).

## Template music (optional)

A built-in album template can start with background music. Put the track on the server as
`deploy/template-music/<template>.mp3` (or `.m4a`) — for "2 3 con mực" that is `deploy/template-music/squids.mp3`.
The folder is mounted read-only into the api and is ignored by git and the Docker build, so your music never ends up
in the repo or the public images. Without the file the template still works, just without music.

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
