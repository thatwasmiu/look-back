# Look Back — Detail Design

Status: describes the code as built (October 2026). Read [high-level-design.md](high-level-design.md) first.
Paths are relative to the repository root.

## 1. Repository layout

```
shared/      @scrapbook/shared — zod schemas and data shared by web and server
  src/layout.ts           page layout schema (elements, frames, text, effects, backgrounds)
  src/templates.ts        scrapbook page templates; src/mangaTemplates.ts manga page layouts
  src/media.ts            MediaDTO and related types
server/      Fastify api + worker
  src/index.ts            api entry: migrate, build app, listen
  src/worker.ts           worker entry: pg-boss handlers + periodic jobs
  src/app.ts              registers every route module
  src/migrations/*.sql    schema, applied in order at api start (migrate.ts)
  src/processing/         image.ts, video.ts, audio.ts, run.ts (process-media job)
  src/*.ts                one module per area (albums, pages, media, uploads, share, auth, manage,
                          locations, mediaFiles, moveMedia, remoteMedia, objectStore, secrets, restore)
web/         React SPA
  src/pages/              routes (AlbumList, Editor, Viewer, SharedAlbum, Guide, PrintAlbum, Manage, Login)
  src/editor/             canvas, toolbar, media tray, uploads, autosave, undo history, trim panel
  src/render/             PageRenderer and element renderers (frames, video, decor, effects, text style)
  src/manga/              manga renderers, panel tools, shape overlay
  src/viewer/             book flipping, spreads, preloading
  src/manage/             storage-locations UI for /manage
  public/sw.js            service worker; public/manifest.webmanifest
deploy/      Dockerfile, compose files, nginx config, .env.example
docs/        guides, designs, specs, plans
```

## 2. Data model

### 2.1 Tables (`server/src/migrations`)

**albums**

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| title | text | |
| cover_media_id | uuid null | cover shown in the album list and link previews |
| music_media_id | uuid null | background music (audio media of the album) |
| background_effect | text | album-wide animated effect (`none`, snow, petals…) |
| background_color | text | desk colour (`walnut`, `slate`, `ocean`…) |
| mode | text | `scrapbook` \| `manga` |
| reading_direction | text | `ltr` \| `rtl` (manga) |
| share_token | text unique null | 43-char base64url; null = not shared |
| created_at, updated_at | timestamptz | |

**pages** — `id`, `album_id → albums (cascade)`, `position int`, `layout jsonb` (a `PageLayout`), `updated_at`.

**media**

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | also the tus upload id and the folder/prefix name `<id>/` |
| album_id | uuid → albums (cascade) | |
| kind | text | `image` \| `video` \| `audio` |
| status | text | `uploading` → `processing` → `ready` \| `failed` |
| original_name, mime | text | |
| width, height, duration_sec | | from processing |
| blur_data_url | text | tiny webp data URL shown while the real image loads |
| variants | jsonb | keys of processed files, e.g. `{thumb, display, displayAvif, original}` / `{hls, poster, original}` / `{audio, original}` |
| error | text | processing error |
| storage_id | uuid → storage_locations, null | null = the VPS disk |
| bytes | bigint | total size of all its files (set by processing and moves) |
| moving_to | text | `'local'` or a location id while a move job runs |
| move_error | text | last move failure |

**storage_locations** — `id`, `name unique`, `kind ('s3')`, `endpoint`, `region`, `bucket`, `access_key_id`,
`secret_enc` (AES-256-GCM, see §6.3; null = keys must be re-entered), `cap_bytes`, `check_status`
(`ok` \| `error` \| `needs-keys`), `check_message`, `checked_at`, `created_at`.

**pending_deletes** — `id`, `storage_id → storage_locations (cascade)`, `prefix` (`<mediaId>/`), `attempts`,
`last_error`, `created_at`. Bucket objects still to delete.

**ai_settings** — one row: `key_enc` (Gemini API key, AES-256-GCM as §6.3), `key_last4`, `model` (null = default
in `gemini.ts`). Not in backups.

**schema_migrations** — applied migration file names. pg-boss keeps its own schema.

### 2.2 Page layout (`shared/src/layout.ts`)

```ts
PageLayout = { background: 'paper-cream' | 'paper-kraft' | 'paper-grid' | 'paper-dots' | 'paper-white'; elements: PageElement[];  // ≤ 200 elements, unique ids
               hidden?: true }  // editor only: left out of the viewer, share links and print
// Every element: id, x, y, w, h (fractions of the page, 0..1), rotation (deg), z, pinned?
PageElement =
  | Frame   { type: 'frame', frameStyle (polaroid, torn, circle, heart, …, 'panel'), mediaId | null,
              crop: { x, y, scale }, trim?: { start, end }            // video clip, seconds
              shape?: [x,y][] (3–8 points), border?, ink?, tone? }    // manga panel extras
  | Tape    { type: 'tape', tapeStyle }
  | Sticker { type: 'sticker', stickerId }
  | Text    { type: 'text', text ≤ 500, font, color '#rrggbb', size (fraction of page height),
              textStyle?: plain | speech | shout | thought | narration | sfx, tail?: bl|br|tl|tr|none,
              align?: left|center|right, lineHeight?: 0.6..3, outline? }
  | Effect  { type: 'effect', effect (sparkles, hearts, petals, … , speed-lines, focus-lines, screentone) }
```

All later additions are optional fields, so older pages stay valid. The server validates every saved layout with the
same schema (`PUT /api/pages/:id`).

### 2.3 Files on disk (`/data`)

```
/data/uploads/<mediaId>[.json]          in-progress tus uploads (cleaned up when abandoned)
/data/media/<mediaId>/original.<ext>     image/video original
                     display.webp, display.avif, thumb.webp           images
                     poster.webp, hls/master.m3u8, hls/720p.m3u8, hls/720p_0000.ts …   videos
                     audio.m4a                                        audio
/data/template-music/<template>.mp3      optional, read-only mount (built-in "2 3 con mực" template music)
```

A media that lives in a bucket has exactly the same keys under the bucket (`<mediaId>/…`) and no local folder.

## 3. API (`server/src`)

Owner session required for every `/api` route except the public ones marked ●. `/media/*` checks access itself.

| Method & path | Module | Purpose |
|---|---|---|
| ● POST /api/auth/login | auth | password → session (5 tries / 15 min per IP) |
| POST /api/auth/logout | auth | end session (client also clears offline caches) |
| ● GET /api/auth/check | auth | nginx `auth_request` for `/media/*`: owner or matching share cookie |
| ● GET /api/health | app | liveness |
| GET /api/albums · POST /api/albums | albums | list (with cover, page count, share token) · create (empty, from a template design, or copying another album's design) |
| GET/PATCH/DELETE /api/albums/:id | albums | bundle (album + pages + media) · title/cover/music/background/direction · delete (files removed or queued) |
| POST /api/albums/:id/pages · PUT /api/albums/:id/page-order | pages | add page from template · reorder |
| PUT/DELETE /api/pages/:id | pages | save layout (zod-validated) · delete |
| GET/DELETE /api/media/:id | media | poll processing status · delete (frames emptied, cover/music cleared) |
| ALL /api/uploads[/*] | uploads | tus server (resumable, 50 MiB chunks, metadata `albumId`, `filename`, `filetype`) |
| POST/DELETE /api/albums/:id/share | share | create (idempotent) / revoke share token |
| ● GET /api/share/:token | share | album bundle for viewers without hidden pages and media only they show (`hideHiddenPages`); sets `lb_share` cookie (30 days) |
| ● GET /api/share/:token/preview[.jpg] | share | Open Graph HTML for crawlers (page count excludes hidden pages; meta refresh → `/s/<token>?app`) · 1200×630 JPEG of the cover |
| GET /api/manage | manage | disk total/free, media/db size, every file with size, album, used, location, move state |
| POST /api/manage/move | manage | queue moves `{mediaIds, to: 'local' \| locationId}`; 400 unusable target, 409 over cap |
| GET /api/manage/backup | manage | streamed `.tar` backup |
| GET/POST /api/manage/locations · PATCH/DELETE …/:id | locations | list (no secrets) · add (after bucket check) · rename/cap/re-key · delete when empty |
| POST /api/manage/locations/:id/check · …/drop | locations | re-check health · forget a dead location (typed name) |
| GET/PUT /api/manage/ai · DELETE …/ai/key · POST …/ai/test | aiRoutes | Gemini settings `{hasKey, last4, model}` (key write-only) · test call |
| POST /api/ai/album | aiRoutes | `{prompt ≤200, mode, readingDirection?, title?}` → Gemini → design → created through POST /api/albums; 400 no key, 502 Gemini error |
| GET /media/:mediaId/* | remoteMedia | bucket media: 302 to presigned URL (playlists passed through); 401/404/503 |

Errors are `{ error: string }`; user-facing ones are Vietnamese.

## 4. Worker (`server/src/worker.ts`)

| Job / timer | Code | What it does |
|---|---|---|
| `process-media` (pg-boss, 1 at a time, retry 1, 4 h expiry) | processing/run.ts | By kind: **image** — auto-rotate, `display.webp` (2048 px), `display.avif`, `thumb.webp` (400 px), blur data URL; **video** — probe, HLS renditions (`VIDEO_RENDITIONS`, 4 s segments, `nice` ffmpeg), `poster.webp`, original copy; **audio** — AAC `audio.m4a`. Sets `status`, `variants`, `bytes`; on failure `status=failed` and removes partial files. |
| `move-media` (no retry) | moveMedia.ts | See §6.2. |
| every 10 min | mediaFiles.runPendingDeletes | Delete queued bucket prefixes; on error `attempts+1`, `last_error`, location marked `error`. |
| every hour | uploads.cleanupAbandonedUploads | Mark abandoned uploads failed and delete their temp files. |

## 5. Front end (`web/src`)

### 5.1 Routes

| Path | Page | Notes |
|---|---|---|
| /login | Login | |
| / | AlbumList | create modal (mode, reading direction, template / copy design), share dialog |
| /albums/:id | Viewer | book; `?page=N` opens on a page |
| /albums/:id/edit | Editor | `?page=N` opens on a page; Done returns to the edited page |
| /albums/:id/print | PrintAlbum | one page per sheet (210×280 mm), opens the print dialog (Save as PDF) |
| /s/:token | SharedAlbum | public, read-only Viewer |
| /guide | Guide | Vietnamese user guide with screenshots (`public/guide/*.jpg`, generated by `src/dev/guide-shots.mjs`) |
| /manage | Manage | hidden owner page, **lazy chunk** |
| /dev/* | dev previews | dev server only |

### 5.2 Rendering

- `PageRenderer` draws a `PageLayout` into a 3:4 `.page` container; positions are percentages; sizes use container
  query units (`cqh/cqw`) compiled by the `cq-vars` PostCSS plugin to `calc(N * var(--cqh))`, with
  `cqPolyfill.ts` setting the variables via ResizeObserver on browsers without container queries.
- `FrameView` per frame style; `BlurImage` (blur layer + `<picture>` avif/webp, fade-in; load error →
  `MediaUnavailable` crying-face placeholder); `VideoPlayer` (poster → hls.js, native HLS only where hls.js can't run;
  autoplays muted + looping in view mode; honours `trim`); manga `PanelFrame` (polygon clip, ink, tone) and
  `MangaText` (bubbles, narration, SFX); `textStyle.ts` builds lettering CSS (font, size, align, line height, outline).
- Effects are CSS/SVG overlays (`render/effects.tsx`); album background effects play behind the book.

### 5.3 Editor

- **State:** pages list + current page; per-page undo/redo history (`editor/history.ts`), commits coalesce by key
  within 500 ms (drags of a slider, quick taps).
- **Canvas** (`EditCanvas.tsx`): react-moveable for drag/resize/rotate/pinch, snap guides (page edges/centre, frames,
  text; drag only; on/off remembered in `localStorage`), pin, crop overlay, manga shape overlay, inline text editing
  (bubbles grow to fit typed text; while typing, a bubble/narration/shout keeps its drawn shape and only its own words
  hide — `.el-text:has(.text-editing)` — with the typed text laid out like them and a soft yellow selection),
  one-tap "+ add" even under effect layers.
- **Hidden pages:** the current page's thumbnail has **Ẩn / Hiện** (`layout.hidden`, one undo step, autosaved);
  hidden thumbnails are faded with an "Ẩn" badge and the page shows a note. Done / `?page=N` count only visible pages
  (a hidden page maps to the visible one before it); the viewer's Edit maps back to the full page index.
- **Toolbar:** element pickers, Font panel (typeface, size, align, line spacing, outline, colour), frame/panel tools,
  ✂ Trim for videos, z-order, duplicate, delete, undo/redo, zoom, Snap, save status.
- **Autosave** (`useAutosave.ts`): debounced `PUT /api/pages/:id`, retried on failure; leaving a page waits for it.
- **Uploads** (`useUpload.ts`): one app-wide Uppy + tus instance (survives leaving the editor), resumable, local
  preview while uploading/processing (`localPreview.tsx`), camera capture on phones, polling until ready.

### 5.4 Viewer

`useFlip` (index, turn animation, swipe/keys/edges, rtl), `spread.ts` (two-page spread on wide landscape screens),
`preload.ts` (preload neighbouring pages' images), background music after the first interaction. `Book` and
`PrintAlbum` skip `layout.hidden` pages; with every page hidden the viewer says so.

### 5.5 PWA

- `manifest.webmanifest` + icons; installable.
- `public/sw.js` (production only):

| Request | Strategy |
|---|---|
| navigations (not `/api`, `/media`) | network-first; fallback to the cached app shell (`/`, HTML only) |
| `GET /api/*` (except uploads, backup, preview image) | network-first; fallback to last good copy |
| `/assets`, `/brand`, `/example`, `/media` images | cache-first; `/media` fetched with CORS so bucket redirects are cacheable, plain fetch if CORS fails |
| video/audio/HLS, range requests, `/api/manage/backup` | network only |

  Logout posts `clear` to drop cached API data and files.
- **Update prompt:** each build writes `/version.json` and bakes the same value into the bundle; `UpdateNotice`
  compares them on open and when the app returns to the foreground.

## 6. Key algorithms

### 6.1 Media access check

1. nginx `location /media/` → `auth_request /_auth` → `GET /api/auth/check` with `X-Original-URI`.
2. Allowed if the owner session is present, or the `lb_share` cookie's token belongs to the album owning that media
   (`shareAllowsMedia`; only plain paths `/media/<uuid>/<name>[/<name>]` pass).
3. File on disk → nginx serves it (`Cache-Control: immutable`). Missing → `@remote_media` → api `GET /media/:id/*`,
   which repeats step 2 and resolves the media's location.

### 6.2 Moving a media file (`moveMedia.ts`)

```
row ← media(id); from ← row.storage_id; if from = to: clear moving_to; stop
src, dest ← side(from), side(to)        // local folder or bucket client
files ← src.list(id); if empty: error
for each file: dest.write(file, src.read(file))     // streamed; bucket uploads use UNSIGNED-PAYLOAD
verify dest.list(id) has the same keys and sizes
UPDATE media SET storage_id=to, bytes=Σsize, moving_to=null, move_error=null
  WHERE id=id AND storage_id IS NOT DISTINCT FROM from
if 0 rows (deleted/moved meanwhile): delete the copies; stop
remove source (local rm now; bucket → pending_deletes)
on any error: delete partial copies; moving_to=null; move_error=message
```

### 6.3 Bucket access

- `objectStore.ts`: aws4fetch SigV4, path-style `endpoint/bucket/key`; `put` (stream, UNSIGNED-PAYLOAD),
  `get`, `list` (ListObjectsV2, paged), `del`, `presign(key, seconds)`; errors are `BucketError` with the HTTP status.
- `checkBucket`: write → read → delete `lookback-check/<uuid>.txt`; run before saving keys.
- Secrets (`secrets.ts`): key = HKDF-SHA256(`SESSION_SECRET`, info `lookback-storage-secret`), AES-256-GCM, stored as
  base64(iv ‖ tag ‖ ciphertext). Changing `SESSION_SECRET` requires re-entering bucket keys.
- `remoteMedia.ts`: non-playlist → `302` presigned (600 s, `Cache-Control: private, max-age=300`); `.m3u8` → fetched
  and returned as-is (relative segment links come back through `/media`); missing object → 404; unreachable bucket →
  location marked `error`, 503. Location `error`/`needs-keys` → 503.

### 6.4 Deleting media

`deleteMediaRows` (in a transaction): empty frames showing the media, clear album cover/music, delete rows.
`removeMediaFiles` after commit: local folder removed immediately (errors only logged), bucket prefixes inserted
into `pending_deletes` for the worker. A location can be removed with "Xoá" only when it has no media and no pending
deletes; "Bỏ nơi lưu này" (drop) deletes its media rows and the location in one transaction without calling the
bucket.

### 6.5 Backup and restore

- `GET /api/manage/backup` streams a tar (tar-stream): `db.json` `{version, createdAt, migrations, tables:
  {storage_locations (secret_enc=null), albums, pages, media}}`, `RESTORE.txt`, `media/…` for every local file, then
  every bucket file read through the VPS, then `MISSING.txt` listing bucket files that could not be read. nginx passes
  it unbuffered with a 1 h timeout.
- `restore.js <backup.tar>`: extract with `tar`, migrate, truncate albums/pages/media/pending_deletes/storage_locations,
  insert rows (media `storage_id=null`; locations `secret_enc=null`, `check_status='needs-keys'`), replace the
  contents of `MEDIA_DIR` with the archive's `media/`. Everything ends up on the VPS.

### 6.6 AI album (`aiAlbum.ts`, `gemini.ts`, `shared/src/templates.ts`)

- Every page template except `blank` has `ai: { about, texts?, stickers? }`. Its text slots are the layout's own text
  elements (in order) followed by `ai.texts` (box, style, max length); its sticker spots are the layout's stickers
  followed by `ai.stickers`. Sticker ids the AI may use: `shared/src/stickerIds.ts` (must equal web's drawings).
- `buildPrompt` lists the mode's templates (id, about, slots), stickers and colours, with the description fenced as
  content. `answerSchema` is Gemini's `responseSchema` (enums for template/sticker/colour/effect ids, 4–10 pages).
- `generateJson`: `POST {geminiBase}/v1beta/models/{model}:generateContent`, key in `x-goog-api-key`, 45 s timeout (nginx
  gives `/api/ai/` 90 s). The answer is the non-thought text parts joined (thinking models may send thought parts).
  Default model `gemini-3.8-flash` (older Flash models are closed to new keys); a real run takes ~20 s.
- Key format: `PUT /api/manage/ai` accepts `^[A-Za-z0-9._-]+$`, 20–200 chars — both `AIza…` keys and the newer
  AI Studio `AQ.…` keys; invisible pasted characters are rejected.
  Errors → `bad-key` (400 API_KEY_INVALID/401/403), `no-model` (404), `quota` (429), `busy` (503), `timeout`, `unusable`, `http`,
  each with a Vietnamese message.
- `toDesign`: drops pages with unknown/other-mode templates, keeps ≤10, needs ≥4; unknown colour/effect → defaults;
  `fillTemplate` cuts text to the slot max, removes unfilled slots, skips unknown stickers; `albumDesignSchema` parse.

## 7. Configuration

`deploy/.env` (see `.env.example`):

| Variable | Meaning |
|---|---|
| POSTGRES_USER / POSTGRES_PASSWORD / DATABASE_URL | database |
| OWNER_PASSWORD_HASH | scrypt hash (`npm run hash-password -w server -- '<pw>'`), single-quoted |
| SESSION_SECRET | ≥ 32 random bytes hex; signs sessions and derives the bucket-key encryption key |
| MEDIA_DIR / UPLOAD_DIR | `/data/media`, `/data/uploads` |
| MAX_UPLOAD_BYTES | per-file limit (default 4 GiB) |
| VIDEO_RENDITIONS / FFMPEG_PRESET | e.g. `720` or `720,1080`; `veryfast` |
| COOKIE_SECURE / TRUST_PROXY / PORT | `true` behind HTTPS; `true` behind nginx; `3000` |

Link-preview crawlers (`deploy/nginx/common-http.inc`): `map $http_user_agent $link_crawler` — first
`(iphone|ipad|android).*zalo → 0` (Zalo's in-app browser), then the crawler list (facebookexternalhit, zalo,
telegrambot…). `map "$link_crawler:$uri:$args" $share_preview` rewrites only `/s/<token>` with no query string, so
`/s/<token>?app` always serves the app.

Compose also sets `TEMPLATE_MUSIC_DIR=/data/template-music`, `LOOKBACK_MODE` (nginx: `behind-proxy` \|
`standalone`), and image names via `IMAGE_PREFIX` / `IMAGE_TAG` (default `dastewasmiu/scrapbook-*:latest`).
The host proxy must allow large request bodies on `/api/uploads` (`client_max_body_size 60m`).

## 8. Build, test, deploy

- Dev and tests run in Docker: `docker compose -f deploy/compose.dev.yml run --rm dev sh -c "cd <server|web|shared>
  && npx vitest run"`. The dev compose file includes PostgreSQL and an S3 test server (versitygw) used by the
  storage tests (`S3_TEST_ENDPOINT`).
- Test suites: shared (schema), server (api + worker against a real database and S3 server), web (jsdom + Testing
  Library). Typecheck with `npx tsc --noEmit -p .` per package.
- Release: `docker compose -f deploy/compose.yml build` → push `api`, `worker`, `nginx` images → on the VPS
  `docker compose -f compose.yml pull && docker compose -f compose.yml up -d`.
- The web build stamps its version (build time) into the bundle and `/version.json`; open apps show
  "Có bản cập nhật mới".

## 9. Known limits

- One owner; no audit log.
- Directory sizes on the VPS are measured by walking the tree on each `/manage` load.
- Service-worker caches only grow (no pruning).
- Bucket deletes are one request per object.
- A bucket that fails in the middle of a file truncates that backup download (download again).
- Exporting single pages as images is not implemented (PDF via print only).
- Zalo's preview crawler user agent is not documented; if it ever says iPhone/Android, Zalo previews fall back to the
  app's generic card.
- Media on a hidden page is only left out of the share bundle; its URL still works for a share-cookie holder who
  already knows it (ids are random UUIDs).
