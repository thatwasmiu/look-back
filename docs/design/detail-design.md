# Look Back — Detail Design

Status: describes the code as built (October 2026). Read [high-level-design.md](high-level-design.md) first.
Paths are relative to the repository root.

## 1. Repository layout

```
shared/      @scrapbook/shared — zod schemas and data shared by web and server
  src/layout.ts           page layout schema (elements, frames, text, effects, backgrounds)
  src/templates.ts        scrapbook page templates (+ AI slots, fillTemplate); src/mangaTemplates.ts manga page layouts
  src/stickerIds.ts       sticker ids the AI may use (equal to web's drawings)
  src/media.ts            MediaDTO, AlbumDTO and related types
server/      Fastify api + worker
  src/index.ts            api entry: migrate, build app, listen
  src/worker.ts           worker entry: pg-boss handlers + periodic jobs
  src/app.ts              registers every route module
  src/migrations/*.sql    schema, applied in order at api start (migrate.ts)
  src/processing/         image.ts, video.ts, audio.ts, run.ts (process-media job)
  src/*.ts                one module per area (albums, pages, media, uploads, share, editLinks, auth, manage,
                          locations, mediaFiles, moveMedia, remoteMedia, objectStore, secrets, backup, restore,
                          drive, driveRoutes, driveBackup, gemini, aiRoutes, aiAlbum)
web/         React SPA
  src/pages/              routes (AlbumList, Editor, GuestEdit, Viewer, SharedAlbum, Guide + guideContent, PrintAlbum,
                          Manage, Login)
  src/editor/             canvas, toolbar, media tray, uploads, autosave, undo history, trim panel, frame camera
  src/i18n.tsx, i18n.vi.ts  t() / useT() / LangSwitch and the Vietnamese table
  src/guestLink.ts        last shared link, link/code parsing, per-link manifest
  src/render/             PageRenderer and element renderers (frames, video, decor, effects, text style)
  src/manga/              manga renderers, panel tools, shape overlay
  src/viewer/             book flipping, spreads, preloading
  src/manage/             /manage sections: storage locations, move bar, Drive backup, AI (Gemini) settings
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
| edit_token, edit_expires_at | text unique null, timestamptz | edit link (migration 010); the owner's DTO shows it only while unexpired |
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

Share and guest bundles never carry `share_token` / `edit_token`.

**drive_backup** (migration 008) — one row: `account_email`, `refresh_enc` (encrypted OAuth refresh token),
`folder_id`, `schedule` (`weekly` \| `daily` \| `off`), `status` (`idle` \| `running` \| `ok` \| `incomplete` \| `error` \|
`needs-reconnect`), `message`, `started_at`, `finished_at`, `bytes_sent`, `last_file_id`, `last_bytes`,
`complete_file_id`. Not in backups.

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
An edit-link guest (session `guest`, re-checked against the album each request) also reaches `PUT /api/pages/:id`
(own album; `guestEditAllowed`: same frames by id — only their `mediaId`/`crop`/`trim`/`z` may change — and same
`hidden`; text, stickers, tape, effects and paper are free → else 403), `GET /api/media/:id` (own album) and tus uploads (create: own album, image/video
only; continue: own album's uploads; no cancel). `/api/auth/check` and bucket media accept the guest for their
album's files.

| Method & path | Module | Purpose |
|---|---|---|
| ● POST /api/auth/login | auth | password → session (5 tries / 15 min per IP); the session expires 1 day after login |
| POST /api/auth/logout | auth | end session (client also clears offline caches) |
| ● GET /api/auth/check | auth | nginx `auth_request` for `/media/*`: owner, matching share cookie, or the guest of that album |
| ● GET /api/health | app | liveness |
| GET /api/albums · POST /api/albums | albums | list (with cover, page count, share token) · create (empty, from a template design, or copying another album's design) |
| GET/PATCH/DELETE /api/albums/:id | albums | bundle (album + pages + media) · title/cover/music/background/direction · delete (files removed or queued) |
| POST /api/albums/:id/pages · PUT /api/albums/:id/page-order | pages | add page from template · reorder |
| PUT/DELETE /api/pages/:id | pages | save layout (zod-validated) · delete |
| GET/DELETE /api/media/:id | media | poll processing status · delete (frames emptied, cover/music cleared) |
| ALL /api/uploads[/*] | uploads | tus server (resumable, 50 MiB chunks, metadata `albumId`, `filename`, `filetype`) |
| POST/DELETE /api/albums/:id/share | share | create (idempotent) / revoke share token |
| POST/DELETE /api/albums/:id/edit-link | editLinks | make `{hours?: 1–168}` (default 8; a valid link keeps its code, gets the new expiry) → `{editToken, expiresAt}` · revoke |
| ● GET /api/manifest/:kind/:token | editLinks | app manifest (`e`/`s`) whose `id`/`start_url` is that link; nginx swaps it into the link's page |
| ● GET /api/edit/:token | editLinks | album bundle for a guest; sets `guest {albumId, token}` in the session |
| ● GET /api/share/:token | share | album bundle for viewers without hidden pages and media only they show (`hideHiddenPages`); sets `lb_share` cookie (30 days) |
| ● GET /api/share/:token/preview[.jpg] | share | Open Graph HTML for crawlers (page count excludes hidden pages; meta refresh → `/s/<token>?app`) · 1200×630 JPEG of the cover |
| GET /api/manage | manage | disk total/free, media/db size, every file with size, album, used, location, move state |
| POST /api/manage/move | manage | queue moves `{mediaIds, to: 'local' \| locationId}`; 400 unusable target, 409 over cap |
| GET /api/manage/backup | manage | streamed `.tar` backup |
| GET/POST /api/manage/locations · PATCH/DELETE …/:id | locations | list (no secrets) · add (after bucket check) · rename/cap/re-key · delete when empty |
| POST /api/manage/locations/:id/check · …/drop | locations | re-check health · forget a dead location (typed name) |
| GET/PATCH/DELETE /api/manage/drive · GET …/drive/connect · ●GET …/drive/callback · POST …/drive/run | driveRoutes | Drive status (`configured`, `connected`, email, schedule, status, sizes, next run) · schedule · disconnect (revokes) · OAuth start/finish (state in the session) · queue a backup now (409 while one runs) |
| GET/PUT /api/manage/ai · DELETE …/ai/key · POST …/ai/test | aiRoutes | Gemini settings `{hasKey, last4, model}` (key write-only) · test call |
| POST /api/ai/album | aiRoutes | `{prompt ≤200, mode, readingDirection?, title?}` → Gemini → design → created through POST /api/albums; 400 no key, 502 Gemini error |
| GET /media/:mediaId/* | remoteMedia | bucket media: 302 to presigned URL (playlists passed through); 401/404/503 |

Errors are `{ error: string }`; user-facing ones are Vietnamese (the web shows them as they come).

## 4. Worker (`server/src/worker.ts`)

| Job / timer | Code | What it does |
|---|---|---|
| `process-media` (pg-boss, 1 at a time, retry 1, 4 h expiry; photos have priority 10, so they go before queued videos/music; sharp uses all cores but one) | processing/run.ts | By kind: **image** — auto-rotate, `display.webp` (2048 px), `display.avif`, `thumb.webp` (400 px), blur data URL; **video** — probe, HLS renditions (`VIDEO_RENDITIONS`, 4 s segments, `nice` ffmpeg), `poster.webp`, original copy; **audio** — AAC `audio.m4a`. Sets `status`, `variants`, `bytes`; on failure `status=failed` and removes partial files. |
| `move-media` (no retry) | moveMedia.ts | See §6.2. |
| every 10 min | mediaFiles.runPendingDeletes | Delete queued bucket prefixes; on error `attempts+1`, `last_error`, location marked `error`. |
| every hour | uploads.cleanupAbandonedUploads | Mark abandoned uploads failed and delete their temp files. |
| `drive-backup` (pg-boss cron `0 3 * * 0` weekly / `0 3 * * *` daily, `Asia/Ho_Chi_Minh`; also "Back up now") | driveBackup.runDriveBackup | Fresh access token → ensure the Lookback folder → stream `buildBackup` into a resumable upload (32 MiB chunks) → verify size → keep it; delete older backups (an incomplete run replaces only the previous incomplete one, never the last complete one); `invalid_grant` → `needs-reconnect`; quota errors say how much space is needed. |

## 5. Front end (`web/src`)

### 5.1 Routes

| Path | Page | Notes |
|---|---|---|
| / | AlbumList | **＋ Scrapbook / ＋ Manga / ＋ Photobooth / ＋ Space** buttons open the create modal on that kind (mode, reading direction, template / ✨ AI / copy design; Photobooth = mode `photobooth` (migration 011): starts on a Booth page, the editor's **+ page** lists only Booth pages, own album templates, no AI; Space = mode `space`, a shape choice: vertical / horizontal / free / sphere), share dialog (view link, edit link with hours), Log out, EN/VI |
| /albums/:id | Viewer | book; `?page=N` opens on a page; **Share** → share-to-social dialog |
| /albums/:id/edit | Editor | `?page=N` opens on a page; Done returns to the edited page |
| /albums/:id/print | PrintAlbum | one page per sheet (210×280 mm), opens the print dialog (Save as PDF) |
| /s/:token | SharedAlbum | public, read-only Viewer (with the Share-to-social button); remembers the link; points the manifest at itself |
| /e/:token | GuestEdit | public; opens the edit link (guest session) into `EditorView guest`; remembers the link; per-link manifest; expired → message |
| /login | Login | password, EN/VI, and "Shared an album with you?": the last shared link or a pasted link/code |
| /guide | Guide | user guide in the current language (`guideContent.ts`), screenshots in `public/guide/*.jpg` (`src/dev/guide-shots.mjs`) |
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

### 5.2b Languages

`i18n.tsx`: `t(english, vars)` returns the English text, or its entry in `VI` (`i18n.vi.ts`) when the language is
Vietnamese (missing entries fall back to English; `{name}` placeholders). `useT()` re-renders on a switch;
`LangSwitch` (album list, editor, login) flips and saves `lb.lang`. Tests run in English.

### 5.3 Editor

- **State:** pages list + current page; per-page undo/redo history (`editor/history.ts`), commits coalesce by key
  within 500 ms (drags of a slider, quick taps).
- **Canvas** (`EditCanvas.tsx`): react-moveable for drag/resize/rotate/pinch, snap guides (page edges/centre, frames,
  text; drag only; on/off remembered in `localStorage`), pin, crop overlay, manga shape overlay, inline text editing
  (bubbles grow to fit typed text; while typing, a bubble/narration/shout keeps its drawn shape and only its own words
  hide — `.el-text:has(.text-editing)` — with the typed text laid out like them and a soft yellow selection),
  one-tap "+ add" under anything that isn't the selected item (effects, bubbles, stickers, other frames — via
  `elementsFromPoint`) with an enlarged invisible touch target. Leaving an edit mode never loses the edit: a tap
  elsewhere blurs the text editor first (so it saves), and crop / panel-shape changes kept in refs are committed
  whenever the mode ends, not only on Done. `lockFrames` (guests) keeps frames from moving.
- **Hidden pages:** the current page's thumbnail has **Ẩn / Hiện** (`layout.hidden`, one undo step, autosaved);
  hidden thumbnails are faded with an "Ẩn" badge and the page shows a note. Done / `?page=N` count only visible pages
  (a hidden page maps to the visible one before it); the viewer's Edit maps back to the full page index.
- **Toolbar:** a main row (**＋ Add** list, Paper, Background, Pin all, undo/redo, zoom, Snap, status) and, with an
  item selected, a row of that item's tools (Font, Frame style, Crop, Trim, Remove photo, panel/bubble tools,
  Duplicate, Pin, layer up/down, delete). Phones: both rows at the bottom; desktop: a side column with one
  full-width button per line and small groups (tail corners, layers, zoom) sharing a line. Pickers: frame styles,
  stickers, tape, effects, bubbles, lines, paper, Background (desk colour, album effect, reading direction, music),
  Font (typeface, size, align, line spacing, outline, colour), Trim.
- **Guest mode** (`EditorView guest`): no page tools, no Frame/Panel/Frame style/panel tools, no Background or title
  rename; frames can't be deleted, duplicated or pinned (Pin all pins everything else); a badge shows the link's expiry; EN/VI switch.
- **Frame menu** ("+ add" on an empty frame): an actions row (Shoot in the frame · Take photo/video · Upload — the
  first two on phones only, the frame camera left out inside Zalo on iPhone with a hint) above the album's photos.
- **Autosave** (`useAutosave.ts`): debounced `PUT /api/pages/:id`, retried on failure; leaving a page waits for it.
- **Two people on one page** (owner + guest, two devices): pages carry a version (`PageDTO.updatedAt`); a save sends
  the version it started from (`baseUpdatedAt`) and the server writes only if it still matches, else **409** with the
  page as it is now. The editor then loads that version (undo history reset, unsaved edits on that page dropped) and
  shows "Trang vừa được người khác sửa — đã tải bản mới". Different pages never clash. Other people's changes are
  not pushed live: a page shows what was loaded until a save is refused or the album is reopened. Emptying frames
  after a media delete doesn't bump the version. The owner's editor (`reload` prop) fetches the album again when its
  tab becomes visible: pages added / changed elsewhere (an edit-link guest) and their media come in, the open page
  stays as it is (its clash is the 409 above); if the open page was deleted elsewhere nothing is merged.
- **Frame camera, black preview:** a preview paused by the browser (rotation, resize) is played again; a camera
  track muted for over 1.5 s (iOS interruptions) is opened again.
- **Photobooth** (frame camera, when the page has other empty frames): one press shoots into the tapped frame,
  then every other empty frame in reading order (rows top to bottom, left→right or right→left for rtl manga), a
  countdown (self-timer, else 3 s) before each and a flash after; the window takes each frame's shape. Stop keeps
  the shots taken. Seven **Booth** page templates (strips of 3/4, 1 big + 3, 2×2, 3 + title card, title + 2,
  2 stacked) on pastel papers (pink, sky, mint, lined, cream), after classic photobooth prints. Papers added with them: `paper-lined`, `paper-pink`, `paper-sky`, `paper-mint`; `paper-black` is no longer offered but still accepted.
- **Photobooth extras** (per mode in `shared/src/modes.ts`: `photoFilters`, `shootFirst`, `boomerang`, `guestSets`):
  page `filter` (bw / sepia / film / warm, `PHOTO_FILTER_CSS`, drawn as `--photo-filter` on the photo windows);
  **Shoot a new set** (pick a layout → `addPage` → camera with `set`: front camera, Photobooth mode, beeps; when done
  `dd/mm/yyyy` texts get today's date and it offers another set); **Boomerang** in Share (the chosen pages' shots,
  forward and back ×3, 0.35 s each, recorded like the slideshow with the page filter on the canvas); **Kiosk** (full
  screen start screen with layouts, a thank-you after each set); guests of an edit link may `POST /api/albums/:id/pages`
  with a Booth layout (appended at the end; other modes → 403) and the Share box shows the edit link as a QR code
  (`qrcode`, drawn in the browser).
- **Space albums** (mode `space`, round 1 of `docs/superpowers/specs/2026-10-26-space-mode-design.md`): one page with
  `layout.space = { shape, cols, rows }` (vertical wall 1 × rows, horizontal strip cols × 1, ≤ 30 tiles of one 3:4
  page). Items are in tile units; `PageRenderer` places them at x / cols, y / rows and sets `--cqw / --cqh` to one
  tile (`calc(1cqw / cols)`; the iOS < 16 polyfill divides by `data-cols / data-rows`), so text and borders keep a
  page's proportions. Editor: no page strip, the stage scrolls; **🧩 Space**: shape (tiles map across), Longer /
  Shorter (`spaceOps.ts`, never below the items' reach), Arrange grid / scatter (seeded by photo id). Viewer:
  `SpaceView` scrolls the space, tap a photo → `PhotoViewer`. `SpaceTile` cuts one tile for album cards, the share
  carousel (one picture per tile) and print (one sheet per tile). The server refuses a second page (`maxPages`) and
  guests can't change `space`. Round 2: **free boards** (n × n tiles, 2–5, so the whole board is 3:4): Bigger / Smaller
  both ways, shapes map tile k row by row across the board, Arrange runs rows across all its tiles; the viewer opens
  the board whole and zooms 1–4× (pinch via touch events, Ctrl + wheel, double-tap, ＋ / −) about the fingers /
  pointer, scrolling both ways; share and print use the whole board as one picture / sheet. Round 3: **sphere**
  (1 × 1; frames' order is the globe's order, their boxes tucked inside the tile): `render/sphere.ts` spreads n photos
  on a Fibonacci sphere and turns / projects them; `SphereView` places thumbnail cards with CSS 3D (drag to turn with
  inertia, slow idle spin unless reduced motion, tap → photo viewer); `SphereEditor` shows the globe plus the order
  (◀ ▶ ✕), photos added by ＋ Add photos or Arrange; switching to a flat shape lays the photos out again as a grid. Share draws the
  globe on a canvas (`drawGlobe`): a still picture, or an 8 s turn recorded with `recordCanvas`; print: the photos as a
  grid; album card: a still globe.
- **Frame camera self-timer:** ⏱ cycles off / 3 / 5 / 10 s; Shoot or Record then counts down on screen, tapping
  again cancels.
- **＋ Add photos** (one multi-file pick, upload target `#fill`): on a page with ≥ 2 empty frames each upload goes
  into the next empty frame in reading order as soon as tus creates it (extras stay in the tray); on a space (owner
  only) the pick is batched — once every file has an id (or 8 s after the last) one `arrange(…, 'grid')` places them
  together, so they share grid rows (a sphere: onto the globe). Hidden on photobooth pages (Shoot a new set there).
- **Uploads** (`useUpload.ts`): one app-wide Uppy + tus instance (survives leaving the editor), resumable, local
  preview while uploading/processing (`localPreview.tsx`), camera capture on phones, polling until ready.

### 5.4 Viewer

`useFlip` (index, turn animation, swipe/keys/edges, rtl), `spread.ts` (two-page spread on wide landscape screens),
`preload.ts` (preload neighbouring pages' images), background music after the first interaction. `Book` and
`PrintAlbum` skip `layout.hidden` pages; with every page hidden the viewer says so.

### 5.5 PWA

- `manifest.webmanifest` + icons; installable. Pages of `/e/<code>` and `/s/<code>` are served (nginx `sub_filter`
  on `$request_uri`) with `/api/manifest/<e|s>/<code>` instead, whose `id`/`start_url` is the link; the client also
  swaps the link (`useLinkManifest`). Those pages are fetched from the network, never stored as the app shell.
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
  elements (in order) followed by `ai.texts` (box, style, max length; manga narration boxes are two lines tall,
  ≥ 0.075 of the page); its sticker spots are the layout's stickers followed by `ai.stickers`. 24 scrapbook and 18
  manga templates. Sticker ids the AI may use: `shared/src/stickerIds.ts` (must equal web's drawings).
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
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | optional: Google Drive backup OAuth client (setup: `docs/google-drive-backup.md`) |

The Gemini key and model are not env settings: they are entered in /manage (stored in `ai_settings`).

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
  "A new version is ready" / "Có bản cập nhật mới".
- Web tests run in English (`navigator.language` en-US in jsdom); `i18n.test.tsx` checks every Vietnamese entry keeps
  the same `{placeholders}`.

## 9. Known limits

- One owner; no audit log.
- Directory sizes on the VPS are measured by walking the tree on each `/manage` load.
- Service-worker caches only grow (no pruning).
- Bucket deletes are one request per object.
- A bucket that fails in the middle of a file truncates that backup download (download again).
- **Share to social** (`viewer/SocialShare.tsx`, lazy): each visible page drawn off screen by PageRenderer on the
  desk colour at 1080×1350 (post 4:5) or 1080×1920 (story/TikTok 9:16), photographed with html-to-image (JPEG 0.92,
  `<picture>` AVIF sources dropped), then `navigator.share({files})` or download. Facebook sharer link when there is
  a view link (owner's share link, or the `/s/` link a viewer came in by). Not on the example album. Videos show
  their poster; a bucket photo without CORS makes the export fail with a message. On Safari/iPhone each picture is
  drawn three times (the first draws miss the photos). **Make video** (`viewer/slideshow.ts`, where the browser can
  record): the same pictures, 3 s each with a 0.6 s cross-fade and a slow 5 % zoom, drawn on a canvas and recorded
  in real time with MediaRecorder, the album's music mixed in (looped, faded out; skipped if it can't be fetched).
  MP4 where supported (Safari, recent Chrome), else WebM with a note that Instagram may refuse it.
- Zalo's preview crawler user agent is not documented; if it ever says iPhone/Android, Zalo previews fall back to the
  app's generic card.
- Media on a hidden page is only left out of the share bundle; its URL still works for a share-cookie holder who
  already knows it (ids are random UUIDs).
- The owner's login lasts 30 days (`expiry`) and is re-issued once a day while used, so it only runs out after 30
  days without opening the app.
- Server error messages are Vietnamese only; the rest of the UI is Vietnamese/English.
- Inside in-app browsers (Zalo, Messenger) the app can't be installed and, on iPhone, the frame camera can't run.
- A page switch while in crop/shape mode saves the page first, so that pending crop/shape is not kept.
