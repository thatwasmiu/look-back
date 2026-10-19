# Multi-location media storage — design

Date: 2026-10-19. Status: draft for owner approval (builder check done).

## Why

Look Back runs on one VPS with a limited disk. The owner wants to keep adding photos and videos ("càng nhiều càng tốt")
without the VPS filling up, by spreading media files over several storage locations — mostly free object-storage
tiers (Cloudflare R2 ≈10 GB, Backblaze B2 ≈10 GB, other S3-compatible buckets). Each file lives in exactly **one**
place; this is not replication or backup.

## What the owner decided

- **New uploads always land on the VPS**, exactly as today (processing with sharp/ffmpeg needs local files anyway).
- **Moving happens later, by hand, on the hidden `/manage` page**: pick files, "Chuyển sang…" another location.
  Moves are allowed in every direction: VPS → bucket, bucket → bucket, bucket → VPS.
- **Storage locations are added and managed on `/manage`** (not in `.env`).
- **When a location is broken** (offline, expired account, wrong keys, locked), viewers see a **cute crying-face
  placeholder (ToT) in that frame**, not a broken image. Everything stored elsewhere keeps working.
- **The backup stays complete**: "Download backup" also contains files that live in buckets (the VPS fetches them
  and streams them into the same `.tar`). A restore puts every file back on the VPS disk.
- **A location that is dead for good can be dropped**: a "Bỏ nơi lưu này" action, behind a strong confirmation,
  forgets that location and every media file stored there (their frames become empty), accepting that those files
  are lost.
- **The `/manage` page code is lazy-loaded**: it is its own JS chunk, never part of the bundle album viewers download.
  Its file list only loads small thumbnails, lazily as they scroll into view — never originals.

## Goals

1. A media record says where its files are; the app resolves every read through that.
2. `/manage` gains a **Nơi lưu (Storage locations)** section: list, add, test, edit keys, set an optional size cap,
   remove (only when empty).
3. `/manage` file list shows each file's location and can move a selection to another location, with progress.
4. Viewers, share links, the editor, link previews and offline viewing behave as today wherever a file lives.
5. Deleting a media file or an album deletes its files in whichever location holds them.
6. The backup remains a complete copy of all albums and all media files, wherever they live.

## Non-goals (this round)

- Automatic moves by rule (age, size, album) — manual only.
- Storing one file in two places, or using buckets as the backup destination.
- Uploading straight from the browser to a bucket.
- Google Drive / OneDrive / Dropbox / Telegram as locations (API limits, poor streaming, ToS risk).
- Per-album default locations.

## Anti-goals (would be a failure even if it works)

- **Losing a file during a move.** A move must copy everything and verify it before deleting the source; an
  interruption at any point leaves the file fully readable at its old location.
- **Making media public.** Buckets stay private; only the owner or a valid share link can get a file, as today.
  No permanent public URLs.
- **Leaking bucket keys**: never sent back to the browser after saving, never in logs, never in the backup file.
- **Slowing down viewers**: no extra JS for album viewers, no media bytes flowing through the VPS for remote files.

## How it works

### Data

- New table `storage_locations`: id, name, kind (`s3`), endpoint, region, bucket, access key id, **encrypted** secret,
  optional size cap (bytes), last check status + message + time, created_at.
  The VPS disk is the implicit location `local` (no row; always exists; cannot be removed).
- `media` gains `storage_id` (null = local) and `bytes` (total size of all its files; filled when processing finishes
  and on every move — so per-location totals come from the DB, no bucket listing).
- Object keys in a bucket are the same relative keys as on disk: `<mediaId>/<variant…>` (e.g. `…/hls/720/seg3.ts`).

### Secrets (builder's call on details, owner's requirement on outcome)

- **My call:** encrypt secret keys at rest with AES-256-GCM, key derived from `SESSION_SECRET` (HKDF). Consequence to
  document on the page: changing `SESSION_SECRET` means re-entering bucket keys.
- After saving, the page shows only the access key id; the secret field can only be replaced.
- The backup (`/api/manage/backup`) leaves the secrets out (rows kept, secret blanked); after a restore, each location
  shows "cần nhập lại khoá" until keys are re-entered.

### Serving files (my call)

- nginx keeps serving `/media/...` from disk behind the same `auth_request` as today. **If the file isn't on disk**
  (`try_files` miss), nginx hands the request to the api, which looks up the media's location and answers with a
  **302 to a short-lived presigned URL** (a few minutes) on the bucket. Files on the VPS are untouched by this.
- HLS: for a remote video the api serves the `.m3u8` playlists itself, rewritten so every segment/sub-playlist line is
  a presigned URL (segments then load straight from the bucket).
- If the location is broken (check failed recently, signing impossible, or the bucket answers an error), the client
  ends up with a failed image/video load → the frame shows the **crying placeholder**. In `BlurImage` and
  `VideoPlayer`, a load error shows the placeholder instead of an empty blur / "không phát được video" chip
  *(my call: the same placeholder for any media that fails to load, local or remote — the owner's ask was about broken
  locations, but a single look is simpler and nicer)*.
- Buckets need CORS allowing the app's origin (hls.js loads playlists/segments with XHR; the offline service worker
  needs readable responses to cache). The "add location" form shows the exact CORS rule to paste into R2/B2.
- Link-preview image (`/api/share/:token/preview.jpg`) and anything else server-side that reads a media file reads it
  through the same location lookup (local file or bucket GET).

### Backup and restore (owner decided: complete backup)

- `/api/manage/backup` keeps its format (`db.json` + `RESTORE.txt` + `media/<mediaId>/…`), and now also streams in
  the files of every media stored in a bucket, read from the bucket through the VPS (no full local copy needed —
  stream object by object into the tar).
- `db.json` gains `storage_locations` rows with secrets blanked, and media rows keep their `storage_id` for the record.
- **My call:** if a location can't be read during a backup, the backup still completes; the files it couldn't fetch
  are listed in a `MISSING.txt` inside the tar, and the page warns before/after downloading when a location is
  broken.
- **Restore** brings everything back **onto the VPS disk** (every media row restored with `storage_id = local`), so a
  restored album works with no bucket at all. Location rows are restored without secrets ("cần nhập lại khoá").
  RESTORE.txt says the VPS needs free space for the whole backup. *(My call)* Objects still sitting in buckets from
  before the restore are left alone (not deleted automatically); re-entering keys shows them nowhere — documented.

### Dropping a dead location (owner decided)

- "Bỏ nơi lưu này" on a location row: confirmation requires typing the location's name and states how many files will
  be lost. Then, in one transaction: every media row on that location is deleted the same way `DELETE /api/media/:id`
  does (frames emptied, cover/music cleared), and the location row is removed. No calls to the bucket.
- The normal "Xoá" stays as designed: only for an empty location (no media, no pending deletes).

### Deleting files on a bucket (my call)

- Deleting a media file or album removes the rows immediately (as today) and records the bucket objects to delete in a
  small pending-deletes table; a job deletes them and retries later if the bucket is unreachable. A location with
  pending deletes is not "empty", so it can't be removed with plain "Xoá" until they finish.

### Moving files

- A move is a background job (pg-boss, same queue machinery as processing) per media file:
  copy every file under `<mediaId>/` from source to destination → verify (count + sizes) → in one DB update set
  `storage_id`, `bytes` → delete the source copy. Failure at any step: delete partial destination copies, leave
  `storage_id` unchanged, record the error on the media row; the UI shows it and the file can be retried.
- While a file is moving it is still served from its source.
- A move into a location whose size cap would be exceeded is refused up front with a clear message.
- The page shows progress for the selection (n / total, current file) by polling.

### `/manage` additions

- **Nơi lưu** section: one row per location — name, kind, used / cap (e.g. "R2: 3.2 / 10 GB"), file count, status
  badge (OK / "Không kết nối được: <reason>" / "cần nhập lại khoá"). Buttons: Kiểm tra kết nối, Sửa, Xoá (disabled
  while it holds files).
- **Thêm nơi lưu** form: name, type preset (Cloudflare R2 / Backblaze B2 / S3 khác — presets prefill endpoint format and
  region), endpoint, bucket, access key id, secret key, optional cap (GB). Saving runs the connection test first
  (write → read → delete a tiny object) and refuses to save a location that fails it.
- **Files** list: new column/label "Nơi lưu"; a filter by location; with a selection, **Chuyển sang…** opens a picker of
  healthy locations (excluding the files' current one), then shows progress.
- Storage section: the VPS disk numbers stay; add per-location totals.

### Front-end weight

- `/manage` (and anything only it uses) is a lazy route (`React.lazy` + `Suspense`), so the main bundle does not grow.
- File list thumbnails use `loading="lazy"` and the small `thumb`/`poster` variant only.
- The service worker does not precache app code (it only keeps files actually used), so installed apps of album
  viewers never download the `/manage` chunk. Keep it that way: don't add a precache list that includes it.

## Constraints

- Stack stays as is: Fastify + pg + pg-boss api/worker, React/Vite web, nginx in front, Docker Compose on one VPS.
- Prefer a small S3 request-signing library over the full AWS SDK (builder's call which; it must work with R2 and B2).
- Must keep working on the existing deployment without manual data migration: existing media are `local`.
- Offline viewing (service worker) must keep working for files that live in buckets.

## Left to the builder

- Exact table/column names, migration number, job names, API routes and payload shapes.
- The signing library, presign expiry (a few minutes), caching of "location is broken" state.
- How the service worker caches redirected media (keyed by the `/media/...` URL as today).
- The crying placeholder's drawing (original art, in the style of the app's stickers — no copied characters).
- Whether the size cap counts processed variants (it should count everything a media file stores).
