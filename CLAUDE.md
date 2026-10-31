# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

"Look Back": a private photo/video scrapbook (albums of pages with framed photos, videos, stickers, text). npm workspaces
`shared`, `server`, `web`. Production is Docker Compose (`deploy/compose.yml`): Postgres 16, `api`, `worker`, `nginx`.
`README.md` covers setup, HTTPS, backups and moving media to S3.

## Commands

Node may not be installed on the host (Windows); everything runs in the dev container, which also starts Postgres
(host port 5433) and an S3-compatible server (versitygw) used by the storage tests.

```bash
docker compose -f deploy/compose.dev.yml run --rm dev npm install
docker compose -f deploy/compose.dev.yml run --rm dev npm test -w server     # needs db + s3 (started automatically)
docker compose -f deploy/compose.dev.yml run --rm dev npm test -w web
docker compose -f deploy/compose.dev.yml run --rm dev npm test -w shared
# one file / one test
docker compose -f deploy/compose.dev.yml run --rm dev npx -w server vitest run test/albums.test.ts
docker compose -f deploy/compose.dev.yml run --rm dev npx -w web vitest run test/Viewer.test.tsx -t "flips"
# typecheck + build the web app (tsc runs as part of build)
docker compose -f deploy/compose.dev.yml run --rm dev npm run build -w web
# dev servers: vite on :5173 (proxies /api and /media to the api on :3000). The api (`npm run dev -w server`,
# tsx watch) also needs OWNER_PASSWORD_HASH, SESSION_SECRET, MEDIA_DIR, UPLOAD_DIR (server/src/config.ts);
# the dev compose only sets DATABASE_URL.
docker compose -f deploy/compose.dev.yml run --rm --service-ports dev sh -c "cd web && npx vite --host 0.0.0.0 --port 5173"
# owner password hash for deploy/.env
docker compose -f deploy/compose.dev.yml run --rm dev npm run hash-password -w server -- 'your password'
# after deploying: end-to-end smoke test (all lines PASS)
SMOKE_PASSWORD='…' bash deploy/smoke.sh
```

Server tests share one database (`fileParallelism: false`); `server/test/helpers.ts` `testApp()` migrates, truncates the
tables and builds a real Fastify app with a logged-in cookie. Fakes for external services live in `server/test`
(`fakeGoogle.ts`, `fakeGemini.ts`, `s3.ts`). Web tests are Vitest + jsdom + Testing Library in `web/test`.

## Architecture

**One owner, password login.** `server/src/auth.ts` checks `OWNER_PASSWORD_HASH` and sets a secure-session cookie
(login is rate-limited by IP, which is why nginx overwrites `X-Forwarded-For` and the api runs with `TRUST_PROXY`).
Everything else is either the owner's session or a token link: `/s/:token` read-only share (`share.ts`) and `/e/:token`
guest edit (`editLinks.ts`). Both web routes sit outside the login gate in `web/src/App.tsx`.

**Media never goes through the api for reads.** nginx serves `/media/<mediaId>/<variant>` straight from the `media`
volume after an `auth_request` to `/api/auth/check`, which accepts the owner's session or a share/edit token for that
album (`deploy/nginx/app-locations.inc`). A file not on disk falls through to the api (`remoteMedia.ts`), which checks
access again and redirects to a short-lived presigned bucket URL (HLS playlists are passed through instead, so their
relative segment links keep coming back through it). DB rows store only relative keys (`<mediaId>/display.webp`,
`storage.ts` `keyFor`); the web builds URLs from `VITE_MEDIA_BASE_URL` (`web/src/mediaUrl.ts`).

**Upload → queue → worker.** Uploads are resumable tus (`uploads.ts`, 50 MiB chunks; the outer nginx must not buffer).
A finished upload enqueues a pg-boss job in Postgres (`queue.ts`). `worker.ts` runs `process-media`
(`processing/image.ts` sharp, `video.ts` ffmpeg → HLS renditions, `audio.ts`), `move-media` (between the VPS disk and
S3-compatible **storage locations**, `objectStore.ts` is a minimal SigV4 client) and `drive-backup` (Google Drive,
`driveBackup.ts`). Images get a higher priority than videos. The worker also cleans abandoned uploads and retries
`pending_deletes` for bucket objects.

**Pages are JSON layouts validated by `shared`.** `shared/src/layout.ts` holds the zod schemas for a page layout
(frames, text, stickers; geometry in page units, a page is 1 × 1, aspect `PAGE_ASPECT`). The same schemas validate on the
server (`pages.ts`) and drive the web editor and renderer. Album **modes** (`scrapbook`, `manga`, `photobooth`, `space`)
are defined in one table, `shared/src/modes.ts` (`MODES`): a new mode is one entry there plus its id in `ALBUM_MODES`;
the DB stores the mode as text, so no migration. A `space` album is one page of cols × rows tiles that scrolls instead of
flipping. Page templates are in `templates.ts` / `mangaTemplates.ts`.

**Web.** `pages/` are routes; `editor/` (EditCanvas with react-moveable, `layoutOps.ts`/`spaceOps.ts` pure layout edits,
`history.ts` undo, `useAutosave.ts`), `render/` (PageRenderer, frames, effects, VideoPlayer with hls.js) shared by the
viewer, editor and print view; `viewer/` (book flip, preload, slideshow, SpaceView); `manga/`; `manage/` (the hidden
`/manage` page: storage locations, Drive backup, AI settings). `/dev/*` preview routes exist in dev builds only.
CSS uses container query units compiled to `var(--cqh)` (see `vite.config.ts`, `cqPolyfill.ts`) for older iOS.
UI strings are English keys translated via `t()` / `useT()` with Vietnamese in `web/src/i18n.vi.ts`; add a VI entry
for every new string. The service worker plus `/version.json` drive the "new version" notice (`UpdateNotice.tsx`).

**AI albums.** `aiAlbum.ts` / `aiRoutes.ts` ask Gemini (`gemini.ts`) to lay photos out on the mode's templates; the key
is stored encrypted (`secrets.ts`) and set on `/manage`.

## Conventions

- Database changes are new numbered files in `server/src/migrations/` (`NNN_name.sql`), applied in order at startup by
  `migrate.ts`, each in a transaction. Never edit an applied migration.
- Server imports use `.js` extensions (ESM, run with tsx, bundled with tsup).
- Specs and plans for past features: `docs/superpowers/specs`, `docs/superpowers/plans`; design notes in `docs/design`.
- Template music (`deploy/template-music/`) and certs (`deploy/certs/`) are git-ignored and must stay out of images.
