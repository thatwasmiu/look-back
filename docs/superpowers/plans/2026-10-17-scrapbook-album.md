# Scrapbook Album Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Personal web app where the single owner builds scrapbook-style album pages on a free canvas (laptop + phone) and flips through them like a book, with fast loading of photos and large videos.

**Architecture:** npm-workspaces monorepo: `shared` (layout types, zod schemas, templates), `server` (Fastify API + tus upload endpoint + pg-boss worker running sharp/ffmpeg), `web` (Vite + React). One DOM-based `PageRenderer` draws pages for both view and decorate mode, so layout is identical everywhere. nginx serves built web and media files from disk, guarded by `auth_request`.

**Tech Stack:** Node 22 LTS, TypeScript, Fastify 5, `pg`, `pg-boss`, `@tus/server` + `@tus/file-store`, `sharp`, ffmpeg/ffprobe CLI, zod, Vite, React 18, react-router, `react-moveable`, `@uppy/core` + `@uppy/tus`, `hls.js`, Vitest, Testing Library, PostgreSQL 16, nginx, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-17-scrapbook-album-design.md`

## Global Constraints

- Node **22 LTS** in all containers. The host has Node 16 and no ffmpeg → **all install/test/dev commands run inside the `dev` container** (Task 1), never on the host.
- Single owner. No sign-up, no user table. Password stored as `OWNER_PASSWORD_HASH` in env (format `scrypt$<saltHex>$<hashHex>`, node `crypto.scrypt`, keylen 64).
- Media on disk at `MEDIA_DIR/<mediaId>/<variant>`. DB stores **relative keys only** (`<mediaId>/display.webp`). Web builds URLs from `VITE_MEDIA_BASE_URL` (default `/media`).
- Page aspect ratio **3:4 portrait**. Element geometry in page-relative units.
- Image variants: blur ~20px wide (base64 data URL in DB), `thumb.webp` 400px long edge, `display.webp` + `display.avif` 2048px long edge, `original.<ext>` kept. Auto-rotate by EXIF; derived files carry no metadata.
- Video: `poster.webp` + blur from frame at 1s (0s if shorter), HLS with ~4s segments under `hls/`, master `hls/master.m3u8`. Renditions from `VIDEO_RENDITIONS` (default `720`; `720,1080` allowed). Output H.264 `yuv420p` + AAC. `FFMPEG_PRESET` default `veryfast`. ffmpeg run via `nice -n 10`. Worker concurrency **1**.
- Media HTTP headers: `Cache-Control: private, max-age=31536000, immutable`. (Known ceiling: `private` means Cloudflare will not edge-cache media; signed URLs would be the upgrade.)
- Upload allow-list: `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/quicktime`, `video/webm`. `MAX_UPLOAD_BYTES` default `4294967296` (4 GiB). Uppy chunk size 50 MiB.
- Login rate limit: 5 failed attempts / 15 min per IP.
- Handwritten fonts must support Vietnamese: **Caveat** and **Patrick Hand** (self-hosted woff2, vietnamese + latin subsets).
- Every API route except `POST /api/auth/login` and `GET /api/health` requires the session.

## Review Focus

1. **Upload interrupted mid-video, then resumed** → continues from the server offset, no restart from zero. Test in Task 5.
2. **iPhone photos (HEIC) and HDR/HEVC 10-bit or portrait-rotated phone videos** → HEIC rejected with a clear message (file input `accept` lists only allow-listed types so iOS converts to JPEG); video comes out upright, `yuv420p`, short edge = rendition height. Tests in Task 5 and Task 7.
3. **Video with no audio track** → encodes fine, plays silent. Test in Task 7.
4. **Saving a layout that references media from another album, or media deleted meanwhile** → 400 for foreign media; deleting media clears it from every frame. Tests in Task 4.
5. **Flip to a page whose media is still processing or failed** → frame shows poster/blur + "processing…" or a failed badge, never a blank or broken image. Test in Task 10.

---

## File Structure

```
package.json                 # workspaces: shared, server, web
tsconfig.base.json
deploy/
  Dockerfile.dev             # node:22-bookworm + ffmpeg
  compose.dev.yml            # db (postgres:16) + dev container
  Dockerfile                 # prod: builds server + web
  compose.yml                # prod: db, api, worker, nginx
  nginx.conf
shared/src/
  layout.ts                  # element/page types + zod schemas
  media.ts                   # MediaDTO, AlbumBundle, PageDTO types
  templates.ts               # starter templates + instantiateTemplate
  index.ts
server/src/
  config.ts  db.ts  migrate.ts  migrations/001_init.sql
  app.ts                     # buildApp(config): FastifyInstance
  auth.ts  albums.ts  pages.ts  media.ts  uploads.ts
  queue.ts  storage.ts
  processing/image.ts  processing/video.ts  processing/run.ts
  index.ts  worker.ts  hash-password.ts
server/test/                 # vitest, real Postgres from compose.dev
  fixtures/                  # tiny jpg (EXIF-rotated), png
web/src/
  main.tsx  App.tsx  api.ts  mediaUrl.ts
  pages/Login.tsx  pages/AlbumList.tsx  pages/Viewer.tsx  pages/Editor.tsx
  render/PageRenderer.tsx  render/FrameView.tsx  render/BlurImage.tsx
  render/VideoPlayer.tsx  render/decor.tsx   # tape, sticker, text, backgrounds
  viewer/spread.ts  viewer/preload.ts  viewer/useFlip.ts
  editor/layoutOps.ts  editor/history.ts  editor/useAutosave.ts
  editor/EditCanvas.tsx  editor/Toolbar.tsx  editor/MediaTray.tsx  editor/useUpload.ts
  assets/  (paper backgrounds, tape, stickers as SVG/PNG, fonts)
```

---

### Task 1: Monorepo, dev container, shared layout schema

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `deploy/Dockerfile.dev`, `deploy/compose.dev.yml`, `shared/package.json`, `shared/src/layout.ts`, `shared/src/media.ts`, `shared/src/index.ts`
- Test: `shared/test/layout.test.ts`

**Interfaces:**
- Produces (`shared/src/layout.ts`):
  ```ts
  type Crop = { x: number; y: number; scale: number }   // x,y ∈ [0,1] focal point (object-position), scale ∈ [1,5]
  type Base = { id: string; x: number; y: number; w: number; h: number; rotation: number; z: number }
  type FrameEl   = Base & { type: 'frame'; frameStyle: 'polaroid' | 'plain' | 'torn'; mediaId: string | null; crop: Crop }
  type TapeEl    = Base & { type: 'tape'; tapeStyle: 'yellow' | 'pink' | 'mint' | 'kraft' }
  type StickerEl = Base & { type: 'sticker'; stickerId: string }
  type TextEl    = Base & { type: 'text'; text: string; font: 'caveat' | 'patrick-hand'; color: string; size: number } // size = fraction of page height
  type PageElement = FrameEl | TapeEl | StickerEl | TextEl
  type PageLayout = { background: 'paper-cream' | 'paper-kraft' | 'paper-grid' | 'paper-dots'; elements: PageElement[] }
  const pageLayoutSchema: z.ZodType<PageLayout>
  const PAGE_ASPECT = 3 / 4
  ```
  Bounds: `x,y ∈ [-0.5, 1.5]`, `w,h ∈ (0, 1.5]`, `rotation ∈ [-180, 180]`, `z` integer ≥ 0, `text` ≤ 500 chars, `color` `#rrggbb`, max 200 elements, ids unique.
- Produces (`shared/src/media.ts`):
  ```ts
  type MediaKind = 'image' | 'video'
  type MediaStatus = 'uploading' | 'processing' | 'ready' | 'failed'
  type Variants = { thumb?: string; display?: string; displayAvif?: string; poster?: string; hls?: string; original: string }
  type MediaDTO = { id: string; albumId: string; kind: MediaKind; status: MediaStatus; width: number | null; height: number | null;
                    durationSec: number | null; blurDataUrl: string | null; variants: Variants | null; error: string | null }
  type PageDTO = { id: string; albumId: string; position: number; layout: PageLayout }
  type AlbumDTO = { id: string; title: string; coverMediaId: string | null }
  type AlbumSummary = AlbumDTO & { coverThumb: string | null; pageCount: number }
  type AlbumBundle = { album: AlbumDTO; pages: PageDTO[]; media: MediaDTO[] }
  ```

- [ ] **Step 1:** `git init`, root `package.json` with `"workspaces": ["shared","server","web"]`, `.gitignore` (`node_modules`, `dist`, `.env`, `.superpowers/`, `data/`). `Dockerfile.dev`: `FROM node:22-bookworm`, `apt-get install -y ffmpeg`. `compose.dev.yml`: `db` (postgres:16, db `scrapbook`, user/pass `scrapbook`, port 5433:5432) and `dev` (build Dockerfile.dev, mounts repo at `/app`, named volume over `/app/node_modules`, env `DATABASE_URL=postgres://scrapbook:scrapbook@db:5432/scrapbook`, ports 5173 and 3000).
- [ ] **Step 2: Write failing tests** in `shared/test/layout.test.ts`:
  - `accepts the spec sample page` (frame/tape/sticker/text from spec §10 plus `crop {x:0.5,y:0.5,scale:1}`) → `safeParse(...).success === true`
  - `rejects w = 0`, `rejects x = 2`, `rejects crop.scale = 6`, `rejects duplicate element ids`, `rejects 201 elements`, `rejects color "red"` → `success === false`
- [ ] **Step 3:** Run `docker compose -f deploy/compose.dev.yml run --rm dev sh -c "npm install && npm test -w shared"` → FAIL (module missing).
- [ ] **Step 4:** Implement `layout.ts` (zod discriminated union on `type`, `.superRefine` for unique ids) and `media.ts` types; export from `index.ts`.
- [ ] **Step 5:** Re-run → PASS.
- [ ] **Step 6: Commit** `feat: monorepo, dev container, shared layout schema`.

---

### Task 2: Server skeleton, config, DB migrations

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/src/config.ts`, `server/src/db.ts`, `server/src/migrate.ts`, `server/src/migrations/001_init.sql`, `server/src/storage.ts`, `server/src/app.ts`, `server/src/index.ts`, `server/vitest.config.ts`, `server/test/helpers.ts`
- Test: `server/test/health.test.ts`, `server/test/storage.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type Config = { port: number; databaseUrl: string; ownerPasswordHash: string; sessionSecret: string; mediaDir: string; uploadDir: string;
                  maxUploadBytes: number; videoRenditions: number[]; ffmpegPreset: string; cookieSecure: boolean }
  function loadConfig(env?: NodeJS.ProcessEnv): Config          // throws listing every missing var
  function createPool(url: string): pg.Pool
  async function migrate(pool: pg.Pool): Promise<void>          // runs migrations/*.sql in name order, tracks in schema_migrations
  async function buildApp(config: Config, pool: pg.Pool): Promise<FastifyInstance>
  // storage.ts
  function keyFor(mediaId: string, variant: string): string     // `${mediaId}/${variant}`
  function absPath(mediaDir: string, key: string): string       // throws if resolved path escapes mediaDir
  // test/helpers.ts
  async function testApp(): Promise<{ app: FastifyInstance; pool: pg.Pool; config: Config; login(): Promise<string /*cookie*/> }> // truncates tables
  ```
- Schema (`001_init.sql`):
  - `albums(id uuid pk default gen_random_uuid(), title text not null, cover_media_id uuid null, created_at timestamptz default now(), updated_at timestamptz default now())`
  - `pages(id uuid pk, album_id uuid not null references albums on delete cascade, position int not null, layout jsonb not null, updated_at timestamptz)`; index `(album_id, position)`
  - `media(id uuid pk, album_id uuid not null references albums on delete cascade, kind text check in ('image','video'), status text not null, original_name text, mime text, width int, height int, duration_sec real, blur_data_url text, variants jsonb, error text, created_at timestamptz default now())`

- [ ] **Step 1: Failing tests:** `GET /api/health → 200 {ok:true}`; `loadConfig({})` throws message containing `DATABASE_URL` and `OWNER_PASSWORD_HASH`; `loadConfig` parses `VIDEO_RENDITIONS="720,1080"` → `[720,1080]`, default `[720]`; `absPath('/m', '../etc/passwd')` throws; `absPath('/m','a/b.webp') === '/m/a/b.webp'`.
- [ ] **Step 2:** Run `docker compose -f deploy/compose.dev.yml run --rm dev npm test -w server` → FAIL.
- [ ] **Step 3:** Implement. Fastify 5, `buildApp` registers routes from later tasks as they land. `index.ts`: loadConfig → createPool → migrate → listen.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5: Commit** `feat(server): skeleton, config, migrations`.

---

### Task 3: Single-owner auth

**Files:**
- Create: `server/src/auth.ts`, `server/src/hash-password.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/auth.test.ts`

**Interfaces:**
- Produces:
  ```ts
  async function hashPassword(pw: string): Promise<string>      // scrypt$salt$hash
  async function verifyPassword(pw: string, stored: string): Promise<boolean>  // timingSafeEqual
  function registerAuth(app: FastifyInstance, config: Config): void
  // routes: POST /api/auth/login {password} → 204 + cookie | 401 | 429
  //         POST /api/auth/logout → 204 ; GET /api/auth/check → 204 | 401 (used by nginx auth_request)
  // preHandler on every /api/* except login + health: 401 without session
  ```
- Session: `@fastify/secure-session` (encrypted cookie `sid`, `httpOnly`, `sameSite: 'lax'`, `secure: config.cookieSecure`, maxAge 30 days), key derived from `SESSION_SECRET`. Rate limit via `@fastify/rate-limit` on the login route only.
- `npm run hash-password -w server -- <pw>` prints the hash.

- [ ] **Step 1: Failing tests:** wrong password → 401; right → 204 and `set-cookie` contains `sid=` and `HttpOnly`; `GET /api/auth/check` without cookie → 401, with → 204; `GET /api/albums` without cookie → 401; 6th failed login in a row → 429; logout then check → 401; `verifyPassword('x', await hashPassword('x')) === true`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(server): single-owner auth`.

---

### Task 4: Albums, pages, layouts, media read/delete

**Files:**
- Create: `server/src/albums.ts`, `server/src/pages.ts`, `server/src/media.ts`, `shared/src/templates.ts` (minimal: one template `blank` now; Task 12 adds the real set)
- Modify: `server/src/app.ts`, `shared/src/index.ts`
- Test: `server/test/albums.test.ts`, `server/test/pages.test.ts`, `server/test/media-api.test.ts`

**Interfaces:**
- Consumes: `pageLayoutSchema`, DTO types (Task 1), session guard (Task 3).
- Produces (`shared/src/templates.ts`):
  ```ts
  type Template = { id: string; name: string; layout: PageLayout }
  const templates: Template[]
  function instantiateTemplate(id: string, newId: () => string): PageLayout   // fresh element ids; throws on unknown id
  ```
- Routes:
  | Route | Result |
  |---|---|
  | `GET /api/albums` | `AlbumSummary[]` newest first |
  | `POST /api/albums {title}` | `AlbumDTO` 201, creates page 0 from template `cover` if present else `blank` |
  | `PATCH /api/albums/:id {title?, coverMediaId?}` | `AlbumDTO` |
  | `DELETE /api/albums/:id` | 204, removes `MEDIA_DIR/<id>` dirs of its media |
  | `GET /api/albums/:id` | `AlbumBundle` (pages by position, all media incl. `blurDataUrl`) |
  | `POST /api/albums/:id/pages {templateId, position?}` | `PageDTO` 201; default append |
  | `PUT /api/pages/:id {layout}` | `PageDTO`; 400 on schema fail; 400 if any `frame.mediaId` not in this album |
  | `DELETE /api/pages/:id` | 204, positions re-compacted |
  | `PUT /api/albums/:id/page-order {pageIds}` | 204; 400 unless pageIds is exactly the album's page set |
  | `GET /api/media/:id` | `MediaDTO` |
  | `DELETE /api/media/:id` | 204; in one transaction sets `mediaId: null` in every frame using it, clears album cover if it was cover, deletes row; then removes files |
- Row→DTO mapping helpers `toMediaDTO(row)`, `toPageDTO(row)` in `media.ts` / `pages.ts`.

- [ ] **Step 1: Failing tests:** create/list/rename/delete album; bundle returns pages in order; add page from template appends with position = count; reorder with wrong set → 400; reorder valid → bundle order changes; save layout with invalid element → 400; **save layout with mediaId from another album → 400** (Review Focus 4); **delete media used in two frames → both frames now `mediaId: null`** (Review Focus 4); delete page compacts positions `[0,1,2]`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(server): albums, pages, layouts, media api`.

---

### Task 5: Resumable uploads (tus) + job enqueue

**Files:**
- Create: `server/src/uploads.ts`, `server/src/queue.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/uploads.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // queue.ts
  const JOB_PROCESS_MEDIA = 'process-media'
  type ProcessMediaJob = { mediaId: string; uploadPath: string }
  async function createQueue(databaseUrl: string): Promise<PgBoss>
  // uploads.ts
  function registerUploads(app: FastifyInstance, config: Config, pool: pg.Pool, boss: PgBoss): void
  ```
- tus endpoint `/api/uploads` (`@tus/server` with `FileStore` at `UPLOAD_DIR`), mounted behind the session guard; Fastify must pass raw body through (`addContentTypeParser('application/offset+octet-stream', ...)` no-op).
- Upload-Metadata required: `albumId`, `filename`, `filetype`. `onUploadCreate`: 400 if album missing, `filetype` not in allow-list (HEIC message: `"HEIC not supported — choose 'Most Compatible' or let the browser convert to JPEG"`), or size > `maxUploadBytes`; inserts media row `status='uploading'`. The tus `namingFunction` returns a fresh uuid that is **also the media row id**, so the client reads `mediaId` as the last path segment of the upload URL (no custom header).
- `onUploadFinish`: set `status='processing'`, enqueue `{mediaId, uploadPath}`.

- [ ] **Step 1: Failing tests** (use raw tus HTTP: POST create, PATCH chunks, HEAD offset):
  - create with `filetype=image/heic` → 400 and body mentions `HEIC`
  - create with unknown albumId → 400; without session → 401
  - **resume:** PATCH first half, then `HEAD` returns `Upload-Offset` = half, PATCH rest from that offset → 204, media row becomes `processing`, one `process-media` job exists (Review Focus 1)
  - size over limit (config override 1 KiB) → 413
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(server): resumable tus uploads`.

---

### Task 6: Image processing

**Files:**
- Create: `server/src/processing/image.ts`, `server/test/fixtures/rotated.jpg` (EXIF Orientation=6, 400×300 stored, with GPS tag), `server/test/fixtures/small.png`
- Test: `server/test/image.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type ProcessResult = { width: number; height: number; durationSec: number | null; blurDataUrl: string; variants: Variants }
  async function processImage(srcPath: string, mediaId: string, mediaDir: string, ext: string): Promise<ProcessResult>
  async function makeBlur(input: Buffer | string): Promise<string>                       // data URL, reused by Task 7
  async function writeWebp(input: Buffer | string, outPath: string, longEdge: number, quality: number): Promise<{ width: number; height: number }>
  ```
- Writes `original.<ext>` (copy), `thumb.webp` (400 long edge, q75), `display.webp` (2048 long edge, q82, `withoutEnlargement`), `display.avif` (same, q55, effort 4), blur = 20px wide webp q40 as `data:image/webp;base64,...`. `.rotate()` before resize; no `withMetadata`.

- [ ] **Step 1: Failing tests:** rotated fixture → result `width=300,height=400` (upright); `display.webp` exists and metadata `orientation` undefined and no `exif`; `blurDataUrl` starts with `data:image/webp;base64,` and is < 2 KB; small.png (smaller than 2048) not enlarged; all variant keys start with `${mediaId}/`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(server): image variants`.

---

### Task 7: Video processing

**Files:**
- Create: `server/src/processing/video.ts`
- Test: `server/test/video.test.ts` (generates inputs at test time with ffmpeg `testsrc`/`sine`)

**Interfaces:**
- Produces:
  ```ts
  type ProbeInfo = { width: number; height: number; rotation: number; durationSec: number; hasAudio: boolean }
  async function probe(path: string): Promise<ProbeInfo>             // ffprobe -of json
  function hlsArgs(input: string, outDir: string, info: ProbeInfo, renditions: number[], preset: string): string[]
  async function processVideo(srcPath: string, mediaId: string, mediaDir: string, ext: string, renditions: number[], preset: string): Promise<ProcessResult>
  ```
- Rendition `r` scales so the **short edge = r** (portrait 1080×1920 at r=720 → 720×1280), never upscales (skip renditions above source short edge, keep at least one at source size). `-c:v libx264 -preset <p> -profile:v high -pix_fmt yuv420p -g 96 -keyint_min 96 -sc_threshold 0`, `-c:a aac -b:a 128k` only if `hasAudio`, `-f hls -hls_time 4 -hls_playlist_type vod -hls_segment_filename hls/<r>p_%04d.ts`, `-master_pl_name master.m3u8` with `-var_stream_map`. Spawn as `nice -n 10 ffmpeg ...`. ffmpeg autorotate stays on (default).
- Poster: frame at `min(1, duration/2)` s → `poster.webp` (max 2048 long edge) + blur via the same sharp helpers as Task 6 (export `makeBlur(buf)` and `writeWebp(...)` from `image.ts`).

- [ ] **Step 1: Failing tests:**
  - `hlsArgs` for 1920×1080 at `[720]` contains `scale=-2:720`; for portrait 1080×1920 contains `scale=720:-2`
  - `hlsArgs` with `hasAudio:false` contains no `-c:a` (Review Focus 3)
  - 3 s 640×360 test video with audio → `hls/master.m3u8` exists, ≥1 `.ts`, `poster.webp` exists, `durationSec≈3`
  - **portrait via rotation metadata** (`-metadata:s:v rotate=90` on a 640×360 source) → probe of first segment gives width < height (Review Focus 2)
  - **10-bit input** (`-pix_fmt yuv420p10le` with libx264) → output segment `pix_fmt` is `yuv420p` (Review Focus 2)
  - video without audio → succeeds (Review Focus 3)
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(server): hls video encoding`.

---

### Task 8: Worker process

**Files:**
- Create: `server/src/processing/run.ts`, `server/src/worker.ts`
- Test: `server/test/worker.test.ts`

**Interfaces:**
- Consumes: `processImage` (Task 6), `processVideo` (Task 7), `ProcessMediaJob` (Task 5).
- Produces:
  ```ts
  async function runProcessMedia(job: ProcessMediaJob, pool: pg.Pool, config: Config): Promise<void>
  ```
  Reads media row (kind from mime), calls processor, updates `status='ready'` + width/height/duration/blur/variants; on throw sets `status='failed'`, `error` = first 500 chars, removes partial `MEDIA_DIR/<id>`; always deletes the tus upload file + `.json`. `worker.ts`: `boss.work(JOB_PROCESS_MEDIA, { batchSize: 1 }, ...)` with one worker (concurrency 1), retry limit 1.

- [ ] **Step 1: Failing tests:** image job → row `ready`, variants present, upload file gone; corrupt file (`random bytes` named .jpg) → `failed`, `error` non-empty, no `MEDIA_DIR/<id>` left.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(server): media worker`.

---

### Task 9: Web scaffold, login, API client, album list

**Files:**
- Create: `web/package.json`, `web/vite.config.ts` (dev proxy `/api` and `/media` → `http://localhost:3000`), `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/api.ts`, `web/src/mediaUrl.ts`, `web/src/pages/Login.tsx`, `web/src/pages/AlbumList.tsx`, `web/src/styles.css`
- Test: `web/test/mediaUrl.test.ts`, `web/test/Login.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  function mediaUrl(key: string): string           // `${import.meta.env.VITE_MEDIA_BASE_URL ?? '/media'}/${key}`
  class ApiError extends Error { status: number }
  const api: {
    login(password: string): Promise<void>; logout(): Promise<void>; check(): Promise<boolean>;
    listAlbums(): Promise<AlbumSummary[]>; createAlbum(title: string): Promise<AlbumDTO>;
    updateAlbum(id: string, patch: { title?: string; coverMediaId?: string | null }): Promise<AlbumDTO>;
    deleteAlbum(id: string): Promise<void>; getAlbum(id: string): Promise<AlbumBundle>;
    addPage(albumId: string, templateId: string, position?: number): Promise<PageDTO>;
    savePage(id: string, layout: PageLayout): Promise<PageDTO>; deletePage(id: string): Promise<void>;
    reorderPages(albumId: string, pageIds: string[]): Promise<void>;
    getMedia(id: string): Promise<MediaDTO>; deleteMedia(id: string): Promise<void>;
  }
  ```
  Any 401 → redirect to `/login`. Routes: `/login`, `/` (AlbumList), `/albums/:id` (Viewer), `/albums/:id/edit` (Editor).
- AlbumList: grid of cover thumbs on paper background, "New album" button, links to view/edit. Mobile-first CSS.

- [ ] **Step 1: Failing tests:** `mediaUrl('a/thumb.webp') === '/media/a/thumb.webp'`; Login submits password via mocked `fetch` and navigates to `/` on 204; shows "Wrong password" on 401.
- [ ] **Step 2:** Run `docker compose -f deploy/compose.dev.yml run --rm dev npm test -w web` → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(web): scaffold, login, album list`.

---

### Task 10: PageRenderer and scrapbook decor

**Files:**
- Create: `web/src/render/PageRenderer.tsx`, `web/src/render/FrameView.tsx`, `web/src/render/BlurImage.tsx`, `web/src/render/VideoPlayer.tsx`, `web/src/render/decor.tsx`, `web/src/assets/*` (4 paper backgrounds, 4 tape strips, ≥12 stickers, Caveat + Patrick Hand woff2 with vietnamese subset)
- Test: `web/test/PageRenderer.test.tsx`

**Interfaces:**
- Consumes: `PageLayout`, `MediaDTO`, `mediaUrl`.
- Produces:
  ```tsx
  type RenderProps = { layout: PageLayout; media: Map<string, MediaDTO>; mode: 'view' | 'edit';
                       renderOverlay?: (el: PageElement) => ReactNode }   // editor hooks selection UI here
  function PageRenderer(p: RenderProps): JSX.Element
  function BlurImage(p: { blurDataUrl: string | null; src: string; srcAvif?: string; alt?: string; objectPosition: string; scale: number }): JSX.Element
  function VideoPlayer(p: { media: MediaDTO; active: boolean }): JSX.Element   // poster until tapped; hls.js or native HLS
  ```
- Page box: `aspect-ratio: 3/4`, `container-type: size`; each element `position:absolute; left: x*100%; top: y*100%; width: w*100%; height: h*100%; transform: rotate(deg); z-index: z`. Text font-size `size*100cqh`. Frame: polaroid = white border (4% sides, 14% bottom) + soft shadow; media `object-fit: cover; object-position: crop.x*100% crop.y*100%; transform: scale(crop.scale)`. BlurImage: blur layer `filter: blur(12px)` underneath, sharp `<picture>` (avif source + webp img) fades in on `load` (300ms). Frame states: `mediaId null` → empty slot (edit: "+ add" dashed; view: plain paper), `processing` → blur/poster + "processing…" chip, `failed` → "upload failed" chip, never a broken `<img>`.

- [ ] **Step 1: Failing tests:** element `{x:0.1,y:0.2,w:0.3,h:0.4,rotation:-5}` renders with `left:10%`, `top:20%`, `width:30%`, `height:40%`, `rotate(-5deg)`; frame with `processing` media renders text `processing…` and no `<img src=…/display.webp>` (Review Focus 5); `failed` media renders `upload failed`; ready image renders `<source type="image/avif">` and `<img src="/media/<id>/display.webp">`; empty frame in view mode renders no "+ add".
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement components and assets.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Visual check:** dev server (`npm run dev` in container, ports 5173/3000), seed an album, screenshot one page at 1280×800 and 375×812; frames, tape, stickers, text must read as hand-made scrapbook (spec §4). Fix anything that looks like plain boxes.
- [ ] **Step 6: Commit** `feat(web): page renderer and scrapbook decor`.

---

### Task 11: Viewer — flip, spreads, background loading

**Files:**
- Create: `web/src/viewer/spread.ts`, `web/src/viewer/preload.ts`, `web/src/viewer/useFlip.ts`, `web/src/pages/Viewer.tsx`
- Test: `web/test/spread.test.ts`, `web/test/preload.test.ts`

**Interfaces:**
- Consumes: `PageRenderer`, `AlbumBundle`.
- Produces:
  ```ts
  // spread.ts — page 0 is the cover, shown alone; then [1,2], [3,4], …
  function visiblePages(index: number, total: number, spread: boolean): number[]
  function nextIndex(index: number, total: number, spread: boolean): number
  function prevIndex(index: number, total: number, spread: boolean): number
  // preload.ts
  type PreloadPlan = { now: string[]; soon: string[]; soonHls: string[]; idle: string[] }  // media keys
  function planPreload(pages: PageDTO[], media: Map<string, MediaDTO>, visible: number[]): PreloadPlan
  function runPreload(plan: PreloadPlan, signal: AbortSignal): void
  async function warmHls(masterUrl: string, segments: number, signal: AbortSignal): Promise<void>  // fetch master → first variant playlist → first N .ts
  ```
  `planPreload`: `now` = display (or poster) of ready media on visible pages; `soon` = display/poster on pages within ±2 of visible, not visible; `soonHls` = hls keys of ready videos on those pages; `idle` = thumbs of all other ready media. Never includes `original`. Only `ready` media.
  `runPreload`: `now` via `new Image()` + `decode()`; after all `now` settle → `soon` images + `warmHls(…, 2)`; `idle` via `requestIdleCallback` (fallback `setTimeout 200`) one at a time. Re-planned on every flip; previous run aborted.
- Viewer: spread when `matchMedia('(min-width: 900px) and (orientation: landscape)')`. Flip via swipe (pointer events, threshold 50px), ←/→ keys, click left/right page edge. Animation: 350ms slide + slight rotateY curl on the outgoing page (CSS transform), honors `prefers-reduced-motion`. Edit button → `/albums/:id/edit`.

- [ ] **Step 1: Failing tests:** `visiblePages(0,9,true) → [0]`, `(1,9,true) → [1,2]`, `(2,9,true) → [1,2]`, `(8,9,true) → [7,8]`, `(3,9,false) → [3]`; `nextIndex(0,9,true) → 1`, `nextIndex(1,9,true) → 3`, `nextIndex(8,9,true) → 8`; `planPreload` for 10 pages, visible `[3]`: `now` has page 3 display keys only, `soon` covers pages 1,2,4,5, `idle` holds thumbs of pages 0,6–9, no key ends with `original.*`, `processing` media absent, video on page 4 → its `hls/master.m3u8` in `soonHls`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Manual check:** throttle to "Fast 4G" in browser devtools, flip forward 3 times: no frame ever shows empty (spec §4). Network panel shows no original files fetched.
- [ ] **Step 6: Commit** `feat(web): flip viewer with background loading`.

---

### Task 12: Starter templates

**Files:**
- Modify: `shared/src/templates.ts`
- Test: `shared/test/templates.test.ts`

**Interfaces:**
- Produces: `templates` containing at least `cover`, `blank`, `one-hero`, `two-tilted`, `three-collage`, `four-grid-loose`, `hero-plus-two`, `video-feature` — each with polaroid frames (`mediaId: null`, `crop {0.5,0.5,1}`), 1–3 tape strips overlapping frame tops, and a title/text spot where it fits. Tilts within ±8°.

- [ ] **Step 1: Failing tests:** every template parses with `pageLayoutSchema`; every frame's unrotated box lies within `[0,1]` page bounds; `instantiateTemplate` returns ids different from the template's and different between two calls; unknown id throws.
- [ ] **Step 2:** Run `npm test -w shared` in container → FAIL. **Step 3:** Design templates (use PageRenderer in the dev server to iterate visually).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Visual check:** screenshot all templates at 375×812 with sample photos; each must look deliberate (spec §4). Show screenshots to the owner before continuing.
- [ ] **Step 6: Commit** `feat(shared): scrapbook page templates`.

---

### Task 13: Editor — canvas editing, history, autosave, pages

**Files:**
- Create: `web/src/editor/layoutOps.ts`, `web/src/editor/history.ts`, `web/src/editor/useAutosave.ts`, `web/src/editor/EditCanvas.tsx`, `web/src/editor/Toolbar.tsx`, `web/src/pages/Editor.tsx`
- Test: `web/test/layoutOps.test.ts`, `web/test/history.test.ts`, `web/test/useAutosave.test.ts`

**Interfaces:**
- Consumes: `PageRenderer` (`mode:'edit'`, `renderOverlay`), `instantiateTemplate`, `templates`, `api`.
- Produces:
  ```ts
  // layoutOps.ts — pure, return new PageLayout
  function addElement(l: PageLayout, el: PageElement): PageLayout              // z = max+1
  function updateElement(l: PageLayout, id: string, patch: Partial<PageElement>): PageLayout
  function removeElement(l: PageLayout, id: string): PageLayout
  function bringForward(l: PageLayout, id: string): PageLayout                 // swap z with next above
  function sendBackward(l: PageLayout, id: string): PageLayout
  function assignMedia(l: PageLayout, frameId: string, mediaId: string | null): PageLayout   // resets crop to {0.5,0.5,1}
  function newSticker(stickerId: string): StickerEl; function newTape(style: TapeEl['tapeStyle']): TapeEl
  function newText(): TextEl; function newFrame(): FrameEl                    // centered, small random tilt ±4°
  // history.ts
  type History<T> = { past: T[]; present: T; future: T[] }
  function initHistory<T>(v: T): History<T>; function push<T>(h: History<T>, v: T): History<T>   // cap past at 100, clears future
  function undo<T>(h: History<T>): History<T>; function redo<T>(h: History<T>): History<T>
  // useAutosave.ts
  function useAutosave(pageId: string, layout: PageLayout, save: (id: string, l: PageLayout) => Promise<unknown>, delayMs = 1000):
    { status: 'saved' | 'saving' | 'unsaved' | 'error'; flush(): Promise<void> }
  ```
- EditCanvas: `react-moveable` on the selected element: draggable, resizable (corner handles), rotatable, `pinchable: ['resizable','rotatable']` for touch; handle size 24px on coarse pointers. Converts px ↔ page units using the page box size; commit to history on drag/resize/rotate end (not every move). Tap empty page clears selection.
- Toolbar: laptop = top bar; phone (`pointer: coarse` or width < 700px) = bottom sheet. Actions: add frame / sticker picker / tape picker / text, bring forward, send backward, delete, undo, redo, background picker, save. Keys: Delete/Backspace, Ctrl+Z, Ctrl+Shift+Z, arrows nudge 0.5%.
- Text: double-click/double-tap → inline `contenteditable`, font + color pickers.
- Pages strip: thumbnails (PageRenderer scaled) with add (template picker), delete (confirm), drag reorder → `api.reorderPages`.
- Autosave: debounce 1000 ms after last change; `flush()` on page switch, route leave and `visibilitychange: hidden`; status chip shows state.

- [ ] **Step 1: Failing tests:** `addElement` sets `z` = max+1; `bringForward` on top element is a no-op; `assignMedia` sets mediaId and resets crop; `removeElement` unknown id → same layout; history: push×3, undo×2, redo×1 gives present = 2nd value; push after undo clears future; 101 pushes keep `past.length === 100`; autosave (fake timers): two changes within 1000 ms → one save call with the latest layout; `flush()` saves immediately; failed save → status `error`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Manual check** in mobile emulation (375×812, touch) and desktop: drag, pinch-resize, two-finger rotate, add sticker, undo, reload → layout persisted.
- [ ] **Step 6: Commit** `feat(web): decorate mode editor`.

---

### Task 14: Media tray, uploads, crop inside frame

**Files:**
- Create: `web/src/editor/MediaTray.tsx`, `web/src/editor/useUpload.ts`
- Modify: `web/src/editor/EditCanvas.tsx`, `web/src/pages/Editor.tsx`
- Test: `web/test/useUpload.test.ts`, `web/test/MediaTray.test.tsx`

**Interfaces:**
- Consumes: `assignMedia`, `api.getMedia`, `api.deleteMedia`, tus endpoint (Task 5).
- Produces:
  ```ts
  const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm'
  type UploadItem = { localId: string; name: string; progress: number; mediaId: string | null; state: 'uploading' | 'paused' | 'error' | 'done'; error?: string }
  function useUpload(albumId: string, onCreated: (mediaId: string, targetFrameId?: string) => void):
    { items: UploadItem[]; add(files: File[], targetFrameId?: string): void; retry(localId: string): void }
  function pollUntilSettled(id: string, get: (id: string) => Promise<MediaDTO>, intervalMs = 3000): Promise<MediaDTO>
  ```
  Uppy core + tus (`endpoint: '/api/uploads'`, `chunkSize: 50*1024*1024`, `retryDelays: [0, 1000, 3000, 5000, 10000]`, resume via fingerprint stored in localStorage), metadata `albumId, filename, filetype`. Server's `HEIC` 400 message shown on the item.
- MediaTray: side panel (laptop) / bottom sheet tab (phone) listing album media thumbs with status chips; "Upload" button + drop zone (`<input type=file multiple accept={ACCEPT}>`). Drag a tray item onto a frame (pointer-based drag so it works on touch) → `assignMedia`. Tap empty frame "+ add" → file picker → upload with `targetFrameId` → assigned when `mediaId` known (frame shows processing state meanwhile). Delete media from tray (confirm). "Set as album cover" on a tray item → `api.updateAlbum(id, { coverMediaId })`.
- Crop: double-click/double-tap a filled frame → crop mode: drag pans (`crop.x/y`, clamped [0,1]), wheel/pinch zooms (`crop.scale` clamped [1,5]); Done commits to history.

- [ ] **Step 1: Failing tests:** `pollUntilSettled` resolves when status becomes `ready` and when `failed`, polls with interval (fake timers); `useUpload` with mocked Uppy: `upload-success` with `uploadURL` `/api/uploads/<uuid>` calls `onCreated('<uuid>', frameId)`; an `upload-error` 400 body containing `HEIC` sets item `error` to that message; MediaTray renders a `processing…` chip for processing media and file input `accept` equals `ACCEPT` (Review Focus 2).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Manual check:** upload a ~200 MB video, kill network (devtools offline) at ~40%, restore → upload resumes near 40%, not 0 (spec §4). Photo appears blurred → sharp after processing.
- [ ] **Step 6: Commit** `feat(web): media tray, resumable upload, crop`.

---

### Task 15: Production deploy

**Files:**
- Create: `deploy/Dockerfile`, `deploy/compose.yml`, `deploy/nginx.conf`, `deploy/.env.example`, `README.md`
- Test: `deploy/smoke.sh`

**Interfaces:**
- Consumes: everything.
- `Dockerfile`: multi-stage, node:22-bookworm-slim + ffmpeg; builds shared/server/web; final image runs `node server/dist/index.js` (api) or `node server/dist/worker.js` (worker). nginx image copies `web/dist`.
- `compose.yml`: `db` (postgres:16, volume `pgdata`), `api`, `worker` (`cpus: 1.0`, `mem_limit: 1g`), `nginx` (80, 443). Shared volumes `media` → `/data/media`, `uploads` → `/data/uploads`. Restart `unless-stopped`.
- `nginx.conf`: 80 → 301 to https; 443 with certs mounted at `/etc/nginx/certs/{fullchain,privkey}.pem`; `/` SPA (`try_files $uri /index.html`), hashed `/assets/` immutable cache; `/api/` → `api:3000` (`client_max_body_size 60m`, `proxy_request_buffering off` for `/api/uploads`); `/media/` → `alias /data/media/` with `auth_request /_auth` (internal → `api:3000/api/auth/check`), `Cache-Control: private, max-age=31536000, immutable`, types `application/vnd.apple.mpegurl m3u8; video/mp2t ts`; deny `original.*` is **not** done (owner may download originals).
- README: set `.env` from example (`npm run hash-password`), get certs (certbot standalone or Cloudflare origin cert), `docker compose -f deploy/compose.yml up -d`, backups (`pg_dump` + `media` volume), switching to S3 (§8 of spec).
- `smoke.sh`: after `up`, `curl -k https://localhost/api/health` → 200; `/api/albums` → 401; `/media/x` without cookie → 401; login → cookie → `/api/albums` 200.

- [ ] **Step 1:** Write `smoke.sh` and run against nothing → FAIL.
- [ ] **Step 2:** Implement deploy files (self-signed cert for local run).
- [ ] **Step 3:** `docker compose -f deploy/compose.yml up -d --build && bash deploy/smoke.sh` → all checks PASS.
- [ ] **Step 4:** End-to-end: create album, upload 50 photos + one 5-min video, decorate 3 pages, view on phone emulation; video processing finishes; flips show no empty frames.
- [ ] **Step 5: Commit** `feat(deploy): docker compose, nginx, readme`.
