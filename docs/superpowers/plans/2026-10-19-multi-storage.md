# Multi-location Media Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Media files can live on the VPS disk or in S3-compatible buckets (one place each); the owner adds buckets and moves files on `/manage`, and every read resolves through the media row's location.

**Architecture:** A `storage_locations` table plus `media.storage_id` (null = VPS). A small S3 client (aws4fetch, UNSIGNED-PAYLOAD streaming) does put/get/list/delete/presign. nginx still serves local files; on a disk miss it hands `/media/...` to the api, which checks access and 302s to a presigned bucket URL (HLS playlists are rewritten). Moves and bucket deletions run in the worker; backup becomes a Node tar stream (tar-stream) that also pulls bucket files.

**Tech Stack:** Fastify 5, pg, pg-boss 10, Node 22 (`crypto` AES-256-GCM + HKDF), `aws4fetch`, `tar-stream`, React 18 + Vite, nginx, MinIO (dev/test only).

**Spec:** `docs/superpowers/specs/2026-10-19-multi-storage-design.md`

## Global Constraints

- New uploads always land on the VPS; nothing in upload/processing changes except recording `media.bytes`.
- One media = one location; a media's files are every object under `<mediaId>/` (same relative keys as on disk).
- Buckets stay private: only presigned URLs, expiry **600 s**. No permanent public URLs.
- Secret keys: AES-256-GCM, key = HKDF-SHA256(`SESSION_SECRET`, salt `''`, info `'lookback-storage-secret'`, 32 bytes). Never returned to the browser, never logged, blanked (`null`) in backups.
- A move never loses a file: copy all → verify (object count + sizes) → commit `storage_id` → delete source. Any failure deletes partial copies, keeps `storage_id`, records `media.move_error`.
- Location statuses shown: `ok` → "OK", `error` → "Không kết nối được: <message>", `needs-keys` → "cần nhập lại khoá".
- Placeholder copy: **"Ảnh tạm thời không tải được"**, crying face (ToT) drawn as original SVG art in the app's sticker style.
- `/manage` is a lazy route (`React.lazy`); the service worker never precaches it. File-list images: `thumb`/`poster` only, `loading="lazy"`.
- Backup stays complete (bucket files streamed into the tar); restore puts every file on the VPS (`storage_id = null`).
- Vietnamese for warnings/confirmations/errors; tool/button names may stay English as elsewhere in the app.
- All tests run in Docker: `docker compose -f deploy/compose.dev.yml run --rm dev sh -c "cd <pkg> && npx vitest run <file>"`.

## Review Focus

1. **Bucket without CORS** — photos still display (redirect works for `<img>`), they just aren't cached for offline; no errors thrown in the service worker. → Task 9 test `media fetch falls back to a plain fetch when the CORS fetch fails`.
2. **Deleting a media/album whose bucket is down** — rows go away at once, objects are queued and deleted on a later worker pass; a location with queued deletes can't be removed with "Xoá". → Task 4 test `pending deletes survive a failing bucket and are retried`.
3. **Media deleted while its move is running** — the job must not resurrect it; the copied objects are removed. → Task 5 test `a media deleted during its move leaves no copy behind`.
4. **Wrong keys / unreachable endpoint when adding or editing a location** — refused with the bucket's error message, nothing saved. → Task 3 test `adding a location that fails the check saves nothing`.
5. **Share-link viewer opening a bucket file of another album** — 401, never a presigned URL. → Task 6 test `share cookie of album A cannot open bucket media of album B`.

---

### Task 1: Schema + secret encryption

**Files:**
- Create: `server/src/migrations/007_storage_locations.sql`, `server/src/secrets.ts`, `server/test/secrets.test.ts`
- Modify: `server/test/helpers.ts` (truncate list)

**Interfaces:**
- Produces:
  - table `storage_locations(id uuid pk default gen_random_uuid(), name text not null unique, kind text not null check (kind = 's3'), endpoint text not null, region text not null default 'auto', bucket text not null, access_key_id text not null, secret_enc text null, cap_bytes bigint null, check_status text not null default 'ok' check (check_status in ('ok','error','needs-keys')), check_message text null, checked_at timestamptz null, created_at timestamptz not null default now())`
  - `media.storage_id uuid null references storage_locations(id)`, `media.bytes bigint null`, `media.moving_to text null` (`'local'` or a location id), `media.move_error text null`
  - table `pending_deletes(id bigserial pk, storage_id uuid not null references storage_locations(id) on delete cascade, prefix text not null, attempts int not null default 0, last_error text null, created_at timestamptz not null default now())`
  - `encryptSecret(plain: string, sessionSecret: string): string` (base64 of iv‖tag‖ciphertext), `decryptSecret(blob: string, sessionSecret: string): string` (throws on tamper / wrong secret)

- [ ] **Step 1: Write the failing tests** in `server/test/secrets.test.ts`:
  `round trips` → `decryptSecret(encryptSecret('k3y', 's1'), 's1') === 'k3y'`; `differs each time` → two encryptions of the same text differ; `wrong session secret or tampered blob throws` → `expect(() => decryptSecret(blob, 's2')).toThrow()` and same for a blob with one char flipped.
- [ ] **Step 2: Run** `cd server && npx vitest run test/secrets.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `secrets.ts` with `crypto.hkdfSync('sha256', sessionSecret, '', 'lookback-storage-secret', 32)`, 12-byte random IV, `aes-256-gcm`. Write the migration (DDL above). In `test/helpers.ts` change the truncate to `truncate albums, pages, media, pending_deletes, storage_locations cascade`.
- [ ] **Step 4: Run** `npx vitest run` (whole server suite; migration applies) → all PASS.
- [ ] **Step 5: Commit** `feat(server): storage locations schema and secret encryption`.

### Task 2: S3 client + MinIO for tests

**Files:**
- Create: `server/src/objectStore.ts`, `server/test/objectStore.test.ts`, `server/test/s3.ts` (test helper)
- Modify: `deploy/compose.dev.yml` (add `minio` service + env on `dev`), `server/package.json` (`aws4fetch`)

**Interfaces:**
- Produces (`objectStore.ts`):
  ```ts
  export type BucketConfig = { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string };
  export type ObjectInfo = { key: string; size: number };
  export function bucketClient(b: BucketConfig): {
    put(key: string, body: Readable | Buffer, size: number, contentType?: string): Promise<void>;
    get(key: string): Promise<Response>;            // throws on non-2xx
    list(prefix: string): Promise<ObjectInfo[]>;    // all pages (ListObjectsV2)
    del(keys: string[]): Promise<void>;             // one DELETE per key; 404 counts as done
    presign(key: string, seconds: number): Promise<string>;
  };
  export async function checkBucket(b: BucketConfig): Promise<string | null>; // null = OK; else the error message
  ```
  - `test/s3.ts`: `export const s3Available = !!process.env.S3_TEST_ENDPOINT;` and `export async function testBucket(name: string): Promise<BucketConfig>` (creates the bucket in MinIO if missing, empties it).
- [ ] **Step 1: Add MinIO** to `compose.dev.yml`: service `minio` (`minio/minio:RELEASE.2024-10-13T13-34-11Z`, `command: server /data`, env `MINIO_ROOT_USER=minio`, `MINIO_ROOT_PASSWORD=minio-secret`), and on `dev`: `S3_TEST_ENDPOINT: http://minio:9000`, `S3_TEST_KEY: minio`, `S3_TEST_SECRET: minio-secret`, `depends_on: [db, minio]`. `npm i aws4fetch -w server`.
- [ ] **Step 2: Write the failing tests** (`describe.skipIf(!s3Available)`):
  - `put, list, get, delete round trip` — put `a/x.bin` (Buffer 1000 bytes) and `a/y/z.bin` (a `Readable` of 5 MiB with size given); `list('a/')` deep-equals both keys with sizes; `get('a/x.bin')` body equals the buffer; after `del([...])`, `list('a/')` is `[]`.
  - `presigned URL works without credentials and expires` — `fetch(await presign('a/x.bin', 600))` → 200 with the bytes; a URL signed with `seconds = 1`, fetched after 2 s → 403.
  - `checkBucket` — returns `null` for good config; for a wrong secret returns a non-empty string; for an unknown bucket returns a non-empty string; leaves no object behind (`list('lookback-check/')` is `[]`).
- [ ] **Step 3: Run** `npx vitest run test/objectStore.test.ts` → FAIL.
- [ ] **Step 4: Implement** with `AwsClient` from aws4fetch: path-style URLs `${endpoint}/${bucket}/${encodeURI(key)}`; uploads send header `x-amz-content-sha256: UNSIGNED-PAYLOAD`, `content-length: size`, body as a web stream with `duplex: 'half'`; `presign` via `aws.sign(url, { method: 'GET', aws: { signQuery: true }, ... })` with `X-Amz-Expires=seconds`. `checkBucket` writes `lookback-check/<uuid>.txt`, reads it back, deletes it; any thrown error → its message (≤ 300 chars).
- [ ] **Step 5: Run** the test → PASS. Run whole server suite → PASS.
- [ ] **Step 6: Commit** `feat(server): S3 client (aws4fetch) with MinIO-backed tests`.

### Task 3: Locations API

**Files:**
- Create: `server/src/locations.ts`, `server/test/locations.test.ts`
- Modify: `server/src/app.ts` (register)

**Interfaces:**
- Consumes: `encryptSecret/decryptSecret` (T1), `bucketClient/checkBucket` (T2).
- Produces:
  - `export async function loadBucket(pool: pg.Pool, sessionSecret: string, storageId: string): Promise<BucketConfig | null>` (null when the row is gone or `secret_enc` is null)
  - `export async function markLocation(pool: pg.Pool, storageId: string, error: string | null): Promise<void>` (sets `check_status` ok/error, message, `checked_at`)
  - Routes (owner-only like all `/api`):
    - `GET /api/manage/locations` → `LocationDTO[]`: `{ id, name, kind, endpoint, region, bucket, accessKeyId, capBytes, status, statusMessage, checkedAt, files, bytes, pendingDeletes }` — `files`/`bytes` = count / sum of `media.bytes` on it. **No secret field.**
    - `POST /api/manage/locations` body `{ name, endpoint, region?, bucket, accessKeyId, secretAccessKey, capBytes? }` → runs `checkBucket` first; failure → `400 { error: <message> }` and nothing saved; success → `201 LocationDTO`.
    - `PATCH /api/manage/locations/:id` body any of `{ name, capBytes, accessKeyId, secretAccessKey }`; when keys change, re-check first (400 on failure, row unchanged); new keys set status `ok`.
    - `POST /api/manage/locations/:id/check` → re-check, update status, return `LocationDTO`.
    - `DELETE /api/manage/locations/:id` → `409 { error: 'Nơi lưu còn file — hãy chuyển file đi trước.' }` when any media or pending delete references it; else 204.
- [ ] **Step 1: Write the failing tests** (`skipIf(!s3Available)` where a bucket is needed):
  - `adding a location that fails the check saves nothing` — wrong secret → 400 with non-empty `error`; `GET` list is `[]`.
  - `add, list without secrets, rename, re-key` — 201; listed row has no key containing `secret`; `JSON.stringify(list)` doesn't contain the secret string; DB `secret_enc` decrypts to it; PATCH name → listed; PATCH bad secret → 400 and the old secret still decrypts.
  - `delete refused while it holds files` — insert a media row with that `storage_id` → 409; remove the row → 204.
  - `check marks a broken location` — PATCH `endpoint` isn't allowed; instead update `bucket` in DB to a missing one, `POST …/check` → `status: 'error'`, `statusMessage` non-empty.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): storage locations API`.

### Task 4: Where a media's files live — sizes, deletes, dropping a location

**Files:**
- Create: `server/src/mediaFiles.ts`, `server/test/mediaFiles.test.ts`
- Modify: `server/src/media.ts` (delete route), `server/src/albums.ts` (album delete), `server/src/processing/run.ts` (store `bytes`), `server/src/worker.ts` (delete loop), `server/src/locations.ts` (drop route), `server/src/manage.ts` (move `dirBytes` out to `mediaFiles.ts` and import it back — avoids an import cycle)

**Interfaces:**
- Consumes: `loadBucket` (T3), `bucketClient` (T2).
- Produces (`mediaFiles.ts`):
  - `export async function dirBytes(dir: string): Promise<number>` (moved here unchanged from `manage.ts`)
  - `export async function deleteMediaRows(c: pg.PoolClient, ids: string[]): Promise<{ id: string; storageId: string | null }[]>` — the DB part of today's `DELETE /api/media/:id` (empty frames, clear cover/music, delete rows), returning where each lived. Used by media delete and by drop.
  - `export async function removeMediaFiles(pool: pg.Pool, config: Config, gone: { id: string; storageId: string | null }[]): Promise<void>` — local: `rm` as today (log, never throw); bucket: `insert into pending_deletes(storage_id, prefix) values ($1, $2)` with prefix `${id}/`.
  - `export async function runPendingDeletes(pool: pg.Pool, config: Config): Promise<void>` — for each row: list prefix, `del`, delete the row; on error `attempts+1`, `last_error`.
  - `export async function readMediaFile(pool: pg.Pool, config: Config, key: string): Promise<Buffer>` — local file or bucket GET, by the media id in `key`.
  - Route `POST /api/manage/locations/:id/drop` body `{ confirmName: string }` → 400 unless `confirmName === name`; then one transaction: `deleteMediaRows` for all media on it, `delete from storage_locations` (pending deletes cascade); returns `{ dropped: <n> }`. No bucket calls.
- Behaviour changes: `run.ts` sets `bytes = dirBytes(mediaPath)` in the same `update … status='ready'`; worker runs `runPendingDeletes` at start and every **10 min** (same pattern as upload cleanup).
- [ ] **Step 1: Write the failing tests:**
  - `deleting a local media still removes its folder` (existing behaviour through the new helpers).
  - `pending deletes survive a failing bucket and are retried` — media on a bucket location with 2 objects; `DELETE /api/media/:id` → 204, row gone, one `pending_deletes` row; break the location (wrong bucket in DB) → `runPendingDeletes` keeps the row with `attempts = 1`; fix it → row gone and `list(prefix)` is `[]`; while the row existed, `DELETE /api/manage/locations/:id` → 409.
  - `drop forgets a dead location` — 2 media on it, one in a page frame and one as cover; wrong `confirmName` → 400; right name → `{ dropped: 2 }`, frame `mediaId` null, cover null, location gone, no `pending_deletes`.
  - `processing records bytes` — extend an existing image-processing test: after `runProcessMedia`, `media.bytes` equals `dirBytes` of its folder and is > 0.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (album delete collects `{id, storage_id}` before deleting, then `removeMediaFiles`). **Step 4: Run** whole server suite → PASS.
- [ ] **Step 5: Commit** `feat(server): bucket-aware media deletion, drop location, media bytes`.

### Task 5: Moving files between locations

**Files:**
- Create: `server/src/moveMedia.ts`, `server/test/moveMedia.test.ts`
- Modify: `server/src/queue.ts`, `server/src/worker.ts`, `server/src/manage.ts` (`GET /api/manage` fields + `POST /api/manage/move`)

**Interfaces:**
- Consumes: T2–T4.
- Produces:
  - `queue.ts`: `export const JOB_MOVE_MEDIA = 'move-media'; export type MoveMediaJob = { mediaId: string; to: string | null };` (queue created like `process-media`, `retryLimit: 0`, `expireInSeconds: 4*3600`).
  - `export async function moveMedia(pool: pg.Pool, config: Config, job: MoveMediaJob): Promise<void>`: no-op if the row is gone or already at `to`. Copy every file (local walk / bucket `list`) to the destination (bucket `put` streams; local writes under `mediaDir/<id>/…`), verify destination (count + sizes equal), then `update media set storage_id=$to, bytes=$sum, moving_to=null, move_error=null where id=$1 and storage_id is not distinct from $from` — if 0 rows (deleted/moved meanwhile) delete the copies and stop; then delete the source (local `rm` / bucket via `pending_deletes`). On any error: delete partial copies, `update media set moving_to=null, move_error=$msg`.
  - `POST /api/manage/move` body `{ mediaIds: string[]; to: string }` (`'local'` or a location id) → 400 for unknown/`needs-keys`/`error` destination; 409 `{ error: 'Vượt giới hạn dung lượng của <name>' }` when `used + selected > cap_bytes`; else sets `moving_to`, sends one job per media not already there, returns `{ queued: n }`.
  - `GET /api/manage` file entries gain `location: string | null`, `movingTo: string | null`, `moveError: string | null`; `bytes` = `media.bytes` for bucket files (local still measured on disk).
- [ ] **Step 1: Write the failing tests** (`skipIf(!s3Available)`, two MinIO buckets A, B):
  - `local → A → B → local keeps every file byte-identical` — a media folder with `original.jpg`, `display.webp`, `hls/720/seg0.ts`; after each `moveMedia`: `storage_id` is the target, `bytes` = total size, source is empty (local dir gone / bucket list `[]` after `runPendingDeletes`), and the files' bytes equal the originals.
  - `a failed copy changes nothing` — destination bucket broken: `storage_id` unchanged, source files intact, `move_error` set, `moving_to` null, destination has no objects.
  - `a media deleted during its move leaves no copy behind` — delete the row between copy and commit (inject via a hook param `beforeCommit?: () => Promise<void>` on `moveMedia`, test-only) → no rows, destination list `[]`.
  - `move endpoint refuses over-cap and broken destinations` — cap 10 bytes → 409 with the message; status `error` → 400; good → `{ queued: 1 }` and `moving_to` set.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** server suite → PASS.
- [ ] **Step 5: Commit** `feat(server): move media between storage locations`.

### Task 6: Serving bucket files

**Files:**
- Create: `server/src/remoteMedia.ts`, `server/test/remoteMedia.test.ts`
- Modify: `server/src/app.ts`, `server/src/auth.ts` (guard exemption for `GET /media/*`), `server/src/share.ts` (preview reads via `readMediaFile`), `deploy/nginx/app-locations.inc`

**Interfaces:**
- Consumes: `shareAllowsMedia` (`share.ts`), `loadBucket`, `bucketClient`, `markLocation`, `readMediaFile`.
- Produces: route `GET /media/:mediaId/*`:
  - allowed if owner session, or `shareAllowsMedia(pool, cookie, request url)`; else 401.
  - media local or unknown → 404. Location `error`/`needs-keys`, or presign fails → **503**.
  - `*.m3u8` → fetch the object, rewrite each non-`#` line: another `.m3u8` stays relative (comes back through `/media`), anything else becomes `await presign(<resolved key>, 600)`; respond `application/vnd.apple.mpegurl`, `cache-control: no-store`. A failing bucket GET → `markLocation(error)` + 503.
  - anything else → **302** to `presign(key, 600)`, `cache-control: private, max-age=300`.
- nginx `/media/` block: replace `alias /data/media/;` with `root /data;` and add `try_files $uri @remote_media;`; new `location @remote_media { proxy_pass http://$api; }` (forwards the original `/media/...` URI and cookies; keep the existing headers).
- [ ] **Step 1: Write the failing tests:**
  - `owner gets a 302 to a working presigned URL` — media on bucket A with `display.webp`; `GET /media/<id>/display.webp` with owner cookie → 302; `fetch(location)` → 200 with the bytes.
  - `share cookie of album A cannot open bucket media of album B` → 401; own album → 302.
  - `HLS playlist is rewritten` — master `master.m3u8` (`720/index.m3u8`) and `720/index.m3u8` (`seg0.ts`): master body keeps `720/index.m3u8`; variant body has an absolute presigned `…/720/seg0.ts…X-Amz-Signature=` line that fetches 200.
  - `broken location → 503`, local media → 404.
  - extend the share preview test: preview.jpg of an album whose cover lives on a bucket is a 1200×630 JPEG.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (+ nginx). **Step 4: Run** server suite → PASS.
- [ ] **Step 5: Commit** `feat: serve bucket media via presigned redirects`.

### Task 7: Complete backup and restore

**Files:**
- Modify: `server/src/manage.ts` (backup), `server/src/restore.ts`, `server/test/manage.test.ts`, `server/package.json` (`tar-stream`, `@types/tar-stream` dev)

**Interfaces:**
- Consumes: `bucketClient`, `loadBucket`.
- Produces:
  - `BACKUP_TABLES = ['storage_locations', 'albums', 'pages', 'media']`; `storage_locations` rows dumped with `secret_enc: null`.
  - Backup tar built with `tar-stream` `pack()` piped to the reply: `db.json`, `RESTORE.txt`, every local file as `media/<rel path>` (streamed), then every bucket media's objects as `media/<key>` (size from `list`, body streamed from `get`), and `MISSING.txt` (one line per media id + location name + error) only when something couldn't be read. Same filename/headers as today.
  - Restore: truncate `albums, pages, media, pending_deletes, storage_locations cascade`; insert in `BACKUP_TABLES` order; force `media.storage_id = null`, `moving_to = null`; force each location `secret_enc = null`, `check_status = 'needs-keys'`. Files restored to `MEDIA_DIR` as today. RESTORE.txt adds: "Cần đủ chỗ trống trên VPS cho toàn bộ file backup. Sau khi khôi phục, mọi file nằm trên VPS; nhập lại khoá cho từng nơi lưu trên /manage."
- [ ] **Step 1: Write the failing tests** (extend `manage.test.ts`, bucket parts `skipIf(!s3Available)`):
  - `backup contains bucket files and no secrets` — one local media, one on bucket A; tar listing contains both media folders; extracted `db.json` has `storage_locations[0].secret_enc === null` and the raw tar doesn't contain the secret string.
  - `unreadable bucket → MISSING.txt, backup still completes`.
  - `restore puts everything on the VPS` — after restore both media have `storage_id` null, their files exist under `mediaDir`, location status `needs-keys`; `GET /media/<id>/…` for the formerly-remote one is served locally (inject → not 302).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** server suite → PASS.
- [ ] **Step 5: Commit** `feat(server): backups include bucket files; restore to VPS`.

### Task 8: `/manage` UI — locations, moving, lazy route

**Files:**
- Create: `web/src/manage/Locations.tsx`, `web/src/manage/MoveBar.tsx`, `web/test/ManageLocations.test.tsx`
- Modify: `web/src/api.ts`, `web/src/pages/Manage.tsx`, `web/src/App.tsx`, `web/src/styles.css`, `web/test/Manage.test.tsx`

**Interfaces:**
- Consumes: T3/T4/T5 routes.
- Produces (`api.ts`): `type StorageLocation = { id; name; kind: 's3'; endpoint; region; bucket; accessKeyId; capBytes: number | null; status: 'ok' | 'error' | 'needs-keys'; statusMessage: string | null; checkedAt: string | null; files: number; bytes: number; pendingDeletes: number }`; `ManagedFile` gains `location: string | null; movingTo: string | null; moveError: string | null`; `api.locations()`, `api.addLocation(body)`, `api.updateLocation(id, body)`, `api.checkLocation(id)`, `api.deleteLocation(id)`, `api.dropLocation(id, confirmName)`, `api.moveMedia(ids, to)`.
- UI:
  - `App.tsx`: `const Manage = lazy(() => import('./pages/Manage'))` inside `<Suspense>`.
  - **Nơi lưu** section (Locations.tsx): VPS row (disk numbers, not removable) + one row per location: name, "used / cap" (`fmtBytes`), file count, status badge with the exact copy from Global Constraints, buttons **Kiểm tra**, **Sửa**, **Xoá** (disabled when `files + pendingDeletes > 0`), **Bỏ nơi lưu này** (confirm field: type the name; text "Mất vĩnh viễn N file đang lưu ở đây. Gõ tên nơi lưu để xác nhận."). Add form: name, preset (Cloudflare R2: endpoint `https://<account-id>.r2.cloudflarestorage.com`, region `auto`; Backblaze B2: `https://s3.<region>.backblazeb2.com`, region from endpoint; S3 khác), endpoint, bucket, access key id, secret key (password input), cap (GB). Shows the CORS rule to paste:
    `[{"AllowedOrigins":["<window.location.origin>"],"AllowedMethods":["GET","HEAD"],"AllowedHeaders":["*"],"MaxAgeSeconds":3600}]`. Server errors shown verbatim.
  - **Files**: each row shows its location name ("VPS" for null), "đang chuyển → X" while `movingTo`, `moveError` in red; a location filter; with a selection, **Chuyển sang…** (MoveBar) lists healthy locations except the selection's single current one, posts the move, then polls `api.manage()` every 2 s while any selected file has `movingTo`, showing "Đang chuyển n/N".
- [ ] **Step 1: Write the failing tests:**
  - `locations list has no secret and shows status copy` — mocked `GET` with one `error` location → "Không kết nối được: <msg>"; one `needs-keys` → "cần nhập lại khoá".
  - `adding shows the server error and keeps the form` — POST 400 `{error:'InvalidAccessKeyId'}` → text visible, inputs keep values.
  - `drop needs the exact name` — button disabled until the typed name matches; then calls `POST …/drop` with `{ confirmName }`.
  - `move selected files` — select 2 → **Chuyển sang…** → pick "R2" → `POST /api/manage/move {mediaIds:[…], to:<id>}`; 409 message shown verbatim.
  - `Manage is a lazy chunk` — `App.tsx` source contains `lazy(() => import('./pages/Manage'))` (string check, like existing source-scan tests).
- [ ] **Step 2: Run** `cd web && npx vitest run test/ManageLocations.test.tsx test/Manage.test.tsx` → FAIL. **Step 3: Implement.** **Step 4: Run** web suite + `npx tsc --noEmit -p .` → PASS.
- [ ] **Step 5: Commit** `feat(web): storage locations and moving files on /manage`.

### Task 9: Crying placeholder + offline caching of bucket files

**Files:**
- Create: `web/src/render/MediaUnavailable.tsx`, `web/test/MediaUnavailable.test.tsx`
- Modify: `web/src/render/BlurImage.tsx`, `web/src/render/VideoPlayer.tsx`, `web/src/render/render.css`, `web/public/sw.js`

**Interfaces:**
- Produces: `export function MediaUnavailable(): JSX.Element` — absolutely fills its frame: original crying-face SVG (round face, ToT eyes with tear drops, small wobbly mouth, soft pastel like the app's stickers) + caption "Ảnh tạm thời không tải được".
- Behaviour: `BlurImage` `onError` → render `<MediaUnavailable />` (instead of only dropping the sharp layer). `VideoPlayer` when `failed` → `<MediaUnavailable />` replaces the "không phát được video" chip. Upload/processing `failed` status chip in `FrameView` is unchanged.
- `sw.js` `cacheFirst` for `/media/` image requests: `fetch(new Request(req.url, { mode: 'cors', credentials: 'same-origin' }))`; if that throws, `return fetch(req)` (not cached). Responses still cached under the `/media/...` URL.
- [ ] **Step 1: Write the failing tests:**
  - `a photo that fails to load shows the crying placeholder` — render `BlurImage`, fire `error` on the img → text "Ảnh tạm thời không tải được" present, no `img.sharp`.
  - `a video that fails shows it too` — existing VideoPlayer fatal-error test now expects the placeholder text instead of the chip.
  - `media fetch falls back to a plain fetch when the CORS fetch fails` — load `public/sw.js` into a fake worker scope (vm + stubbed `caches`/`fetch`, `fetch` rejecting for `mode: 'cors'`) → `respondWith` resolves to the plain fetch's response; nothing `put` in the cache.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** web suite → PASS.
- [ ] **Step 5: Commit** `feat(web): crying placeholder for media that can't load; cache bucket files offline`.

### Task 10: End-to-end check on the local stack

**Files:** none new (verification + any fixes it finds).

- [ ] **Step 1:** Run a throwaway MinIO reachable by both the api container and the browser: `docker run -d --name lb-minio -p 9100:9000 -e MINIO_ROOT_USER=minio -e MINIO_ROOT_PASSWORD=minio-secret minio/minio:RELEASE.2024-10-13T13-34-11Z server /data`; create bucket `lb-test` and set the CORS rule (allow `http://127.0.0.1:2611`) with `mc`; rebuild `docker compose -f deploy/compose.yml up -d --build`.
- [ ] **Step 2:** On `http://127.0.0.1:2611/manage` (local test password): add location with endpoint `http://host.docker.internal:9100`, bucket `lb-test`, keys `minio` / `minio-secret`; move one photo and one video → the album viewer shows both, the video plays, and `/media/...` requests answer 302 to `host.docker.internal:9100`.
- [ ] **Step 3:** `docker stop lb-minio` → the moved photo shows the crying placeholder; others fine; `/manage` shows "Không kết nối được". `docker start lb-minio` → **Kiểm tra** → OK.
- [ ] **Step 4:** Download a backup → tar contains the moved files; drop a test location with typed name → frames emptied. Finally `docker rm -f lb-minio`.
- [ ] **Step 5:** Main JS bundle size unchanged vs. before Task 8 (±2 KB); `/manage` chunk is a separate file in `web/dist/assets`.
- [ ] **Step 6: Commit** any fixes: `fix: issues found in storage end-to-end check`.
