# Google Drive Auto-Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The worker uploads a full backup `.tar` to the owner's Google Drive on a schedule (default weekly), keeps the latest complete backup, and `/manage` shows and controls it.

**Architecture:** The existing backup tar stream is extracted into a reusable builder. A small Drive REST client (plain `fetch`, OAuth refresh token) uploads it with a resumable upload. Settings live in a one-row `drive_backup` table; a pg-boss cron schedule (`Asia/Ho_Chi_Minh`) triggers the `drive-backup` job in the worker. Tests run against an in-process fake Google server.

**Tech Stack:** Fastify 5, pg, pg-boss 10 (`schedule` with `tz`), Node 22 `fetch`, `tar-stream`, React (lazy `/manage`).

**Spec:** `docs/superpowers/specs/2026-10-19-drive-backup-design.md`

## Global Constraints

- OAuth scopes exactly: `https://www.googleapis.com/auth/drive.file openid email`; consent with `access_type=offline&prompt=consent`.
- Redirect URI = `<request origin>/api/manage/drive/callback` (origin from `req.protocol` + `req.hostname`, as share previews do).
- Refresh token encrypted with `encryptSecret` (`server/src/secrets.ts`); never returned by any route, never logged; `drive_backup` is not in `BACKUP_TABLES`.
- Folder name `Look Back backup`; file name `lookback-backup-YYYY-MM-DD.tar` (UTC date).
- Schedules: `weekly` = cron `0 3 * * 0`, `daily` = `0 3 * * *`, tz `Asia/Ho_Chi_Minh`; default `weekly`; `off` unschedules.
- Never delete the last complete backup unless a newer **complete** one is verified (size on Drive = bytes sent). An incomplete run (MISSING files) is kept as well; Drive holds at most: last complete + newest incomplete.
- Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (optional; feature shows setup help when absent); test-only overrides `GOOGLE_OAUTH_BASE` (default `https://oauth2.googleapis.com`), `GOOGLE_AUTH_BASE` (default `https://accounts.google.com`), `GOOGLE_API_BASE` (default `https://www.googleapis.com`).
- User-facing status/errors in Vietnamese; button names as in the spec: **Kết nối Google Drive**, **Kết nối lại**, **Backup ngay**, **Ngắt kết nối**, schedule **Hằng tuần / Hằng ngày / Tắt**.
- Upload chunk size 32 MiB (multiple of 256 KiB).

## Review Focus

1. **Token revoked / expired (`invalid_grant`)** — run ends `error`, status "cần kết nối lại", old backups untouched. → Task 4 test `revoked token: needs reconnect, Drive untouched`.
2. **Drive full mid-upload (`storageQuotaExceeded`)** — run `error` with "Drive không đủ chỗ", partial new file deleted, old kept. → Task 4 test `quota exceeded mid-upload keeps the old backup`.
3. **"Backup ngay" while a run is going** — second request refused 409 "Đang backup…", no second job. → Task 3 test `run now is refused while running`.
4. **Worker restarted mid-run (row stuck `running`)** — a run whose `started_at` is older than the job expiry (4 h) counts as failed and doesn't block new runs. → Task 4 test `stale running state does not block`.
5. **Folder deleted by the owner in Drive** — next run recreates `Look Back backup` instead of failing forever. → Task 4 test `missing folder is recreated`.

---

### Task 1: Reusable backup builder

**Files:**
- Create: `server/src/backup.ts`
- Modify: `server/src/manage.ts` (route uses the builder; `BACKUP_TABLES`, `RESTORE_HELP` move to `backup.ts`), `server/src/restore.ts` (import path)
- Test: `server/test/manage.test.ts` (existing backup tests must keep passing), `server/test/backup.test.ts`

**Interfaces:**
- Produces: `export function buildBackup(pool: pg.Pool, config: Config): { stream: Readable; done: Promise<{ bytes: number; missing: string[] }> }` — `stream` is the tar (`tar-stream` pack); `done` resolves after finalize with total bytes emitted and the MISSING lines (empty = complete); rejects if the stream fails. `export const BACKUP_TABLES`, `export const backupFileName = (d = new Date()) => \`lookback-backup-${d.toISOString().slice(0, 10)}.tar\``.

- [ ] **Step 1: Failing test** `backup.test.ts`: `done reports bytes equal to the stream length and no missing files` — consume `stream` into a Buffer; `expect((await done).bytes).toBe(buf.length)`; `expect((await done).missing).toEqual([])`; `backupFileName(new Date('2026-10-19T10:00:00Z')) === 'lookback-backup-2026-10-19.tar'`.
- [ ] **Step 2: Run** `cd server && npx vitest run test/backup.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** by moving the route's body into `buildBackup` (count bytes with a pass-through counter on the pack output); the route becomes `const { stream } = buildBackup(...); reply.…send(stream)`.
- [ ] **Step 4: Run** whole server suite → PASS (incl. existing manage backup/restore tests).
- [ ] **Step 5: Commit** `refactor(server): reusable backup builder`.

### Task 2: Settings table + Drive client + fake Google

**Files:**
- Create: `server/src/migrations/008_drive_backup.sql`, `server/src/drive.ts`, `server/test/fakeGoogle.ts`, `server/test/drive.test.ts`
- Modify: `server/src/config.ts` (google fields), `server/test/helpers.ts` (truncate `drive_backup`), `deploy/.env.example` (two commented vars)

**Interfaces:**
- Produces:
  - table `drive_backup(id smallint primary key default 1 check (id = 1), account_email text, refresh_enc text, folder_id text, schedule text not null default 'weekly' check (schedule in ('weekly','daily','off')), status text not null default 'idle' check (status in ('idle','running','ok','incomplete','error','needs-reconnect')), message text, started_at timestamptz, finished_at timestamptz, bytes_sent bigint, last_file_id text, last_bytes bigint, complete_file_id text)`.
  - `Config` gains `googleClientId: string`, `googleClientSecret: string`, `googleOauthBase`, `googleAuthBase`, `googleApiBase` (env names in Global Constraints; ids default `''`).
  - `drive.ts`:
    ```ts
    export class DriveError extends Error { constructor(message: string, readonly status: number, readonly reason?: string) }
    export function authUrl(config: Config, redirectUri: string, state: string): string;
    export async function exchangeCode(config: Config, code: string, redirectUri: string): Promise<{ refreshToken: string; email: string }>;
    export async function accessToken(config: Config, refreshToken: string): Promise<string>;   // DriveError reason 'invalid_grant' when revoked
    export async function ensureFolder(config: Config, token: string, folderId: string | null): Promise<string>; // existing (not trashed) or new 'Look Back backup'
    export async function uploadFile(config: Config, token: string, folderId: string, name: string, body: Readable, onProgress?: (bytes: number) => void): Promise<{ id: string; size: number }>;
    export async function deleteFile(config: Config, token: string, id: string): Promise<void>;   // 404 = done
    export async function revoke(config: Config, refreshToken: string): Promise<void>;
    ```
    `uploadFile`: `POST {api}/upload/drive/v3/files?uploadType=resumable` (metadata name + parents) → `Location`; `PUT` 32 MiB chunks with `Content-Range: bytes a-b/*`, last chunk `bytes a-b/total` (empty stream → `bytes */0`); 308 continues; final 200/201 → `id`; then `GET files/{id}?fields=size` → `size`. Google error JSON → `DriveError(message, status, error.errors[0].reason)`.
  - `fakeGoogle.ts`: `startFakeGoogle(): Promise<{ base: string; files: Map<string, { name: string; parents: string[]; data: Buffer; trashed: boolean }>; revokeToken(t: string): void; failNextChunkWith(reason: string): void; close(): Promise<void> }>` — implements the token endpoint (`authorization_code`, `refresh_token`, `invalid_grant` for revoked), `/oauth2/v3/userinfo` or id_token email, files list/create/get/delete, resumable upload, revoke.
- [ ] **Step 1: Failing tests** `drive.test.ts` against the fake: `upload in chunks round-trips the bytes` (70 MiB stream → stored buffer equals input, returned `size` 70 MiB, ≥ 3 PUTs); `ensureFolder reuses or recreates` (same id twice; after trashing it, a new id); `revoked refresh token → DriveError reason invalid_grant`; `authUrl has drive.file scope, offline access, consent prompt and the state`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** server suite → PASS.
- [ ] **Step 5: Commit** `feat(server): Drive client and backup settings table`.

### Task 3: Connect, settings and run-now routes

**Files:**
- Create: `server/src/driveRoutes.ts`, `server/test/driveRoutes.test.ts`
- Modify: `server/src/app.ts`, `server/src/queue.ts` (`JOB_DRIVE_BACKUP = 'drive-backup'`, queue opts retryLimit 0, expire 4 h), `server/src/auth.ts` only if the callback needs a guard tweak (it stays owner-only)

**Interfaces:**
- Consumes: Task 2.
- Produces routes (owner session):
  - `GET /api/manage/drive` → `{ configured: boolean; connected: boolean; email: string | null; schedule; status; message; startedAt; finishedAt; bytesSent; lastBytes; nextRun: string | null }` (never the token). `nextRun` = next 03:00 `Asia/Ho_Chi_Minh` (Sunday for weekly) as ISO, computed by `export function nextRunAt(schedule, now = new Date()): Date | null` (unit-tested: Saturday 23:00 VN → Sunday 03:00 VN; Sunday 04:00 VN → next Sunday).
  - `GET /api/manage/drive/connect` → 302 to `authUrl` with a random `state` stored in the session (`driveState`); 400 if not configured.
  - `GET /api/manage/drive/callback?code&state` → state mismatch 400; else `exchangeCode`, upsert row (encrypted token, email, status `idle`), `ensureFolder`, apply schedule, 302 to `/manage#drive`.
  - `PATCH /api/manage/drive` `{ schedule }` → update + `applySchedule`.
  - `POST /api/manage/drive/run` → 409 `{ error: 'Đang backup…' }` if status `running` (and not stale per Task 4), 400 if not connected; else `boss.send(JOB_DRIVE_BACKUP, {})` → `{ queued: true }`.
  - `DELETE /api/manage/drive` → `revoke` (errors ignored), delete row, unschedule → 204.
  - `export async function applySchedule(boss: PgBoss, schedule: 'weekly' | 'daily' | 'off'): Promise<void>` (`boss.schedule(JOB_DRIVE_BACKUP, cron, {}, { tz: 'Asia/Ho_Chi_Minh' })` / `boss.unschedule`).
- [ ] **Step 1: Failing tests:** `connect → callback stores an encrypted token and never returns it` (follow redirect URL's `state`; GET shows `connected: true`, email; JSON has no token; DB `refresh_enc` decrypts); `wrong state is refused`; `schedule change re-registers the cron` (spy/inspect `pgboss.schedule` table: cron `0 3 * * *`, tz `Asia/Ho_Chi_Minh`; `off` removes it); `run now is refused while running` (row `running`, fresh `started_at` → 409 and no job queued); `not configured → GET says configured:false, connect 400`; `disconnect revokes and forgets`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** server suite → PASS.
- [ ] **Step 5: Commit** `feat(server): connect Google Drive, schedule and run-now routes`.

### Task 4: The backup job

**Files:**
- Create: `server/src/driveBackup.ts`, `server/test/driveBackup.test.ts`
- Modify: `server/src/worker.ts` (work `drive-backup`, batch 1)

**Interfaces:**
- Consumes: `buildBackup` (T1), Drive client (T2).
- Produces: `export async function runDriveBackup(pool: pg.Pool, config: Config): Promise<void>`:
  1. Load row; not connected → return. If `status = 'running'` and `started_at` > now − 4 h → return (another run). Set `running`, `started_at`, `bytes_sent = 0`, message null.
  2. `accessToken`; `invalid_grant` → status `needs-reconnect`, message "Quyền truy cập Drive đã hết — bấm Kết nối lại.", stop.
  3. `folder = ensureFolder(row.folder_id)` (save it). `{ stream, done } = buildBackup()`; `uploadFile(folder, backupFileName(), stream, bytes → update bytes_sent at most every 5 s)`.
  4. Verify `size === (await done).bytes`, else error "Bản backup trên Drive không khớp kích thước".
  5. Complete (`missing` empty): delete every other file the app has in the folder named `lookback-backup-*.tar` (list via fields `files(id,name)`), set `complete_file_id = last_file_id = new id`, status `ok`. Incomplete: delete only older incomplete files (all except `complete_file_id` and the new one), `last_file_id = new id`, status `incomplete`, message "Thiếu N file (nơi lưu đang lỗi) — vẫn giữ bản đầy đủ trước đó."
  6. Any other failure: delete the new file if it was created, status `error`, message: `storageQuotaExceeded` → "Drive không đủ chỗ: cần khoảng X GB trống." (X = bytes sent/1 GiB, 1 decimal), else the error message. Always set `finished_at`.
- [ ] **Step 1: Failing tests** (fake Google + real DB; local media files only unless noted):
  - `first run uploads one file and records ok` — file in folder named `lookback-backup-<date>.tar`, its bytes are a valid tar containing `db.json`; row `ok`, `last_bytes` = size.
  - `a second complete run replaces the first` — exactly one file afterwards, id = `complete_file_id`.
  - `incomplete run keeps the last complete backup` — make a bucket media unreadable (location with a missing bucket, `skipIf(!s3Available)`): two files; row `incomplete`; next complete run → one file.
  - `revoked token: needs reconnect, Drive untouched`.
  - `quota exceeded mid-upload keeps the old backup` — `failNextChunkWith('storageQuotaExceeded')` → still exactly the old file, row `error`, message starts "Drive không đủ chỗ".
  - `stale running state does not block` — row `running`, `started_at` 5 h ago → run proceeds to `ok`.
  - `missing folder is recreated` — trash the folder → run `ok`, new `folder_id`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** server suite → PASS.
- [ ] **Step 5: Commit** `feat(server): scheduled Google Drive backup job`.

### Task 5: `/manage` "Backup Drive" section + setup guide

**Files:**
- Create: `web/src/manage/DriveBackup.tsx`, `web/test/DriveBackup.test.tsx`, `docs/google-drive-backup.md`
- Modify: `web/src/api.ts` (`DriveStatus` type + `driveStatus()`, `setDriveSchedule(s)`, `runDriveBackup()`, `disconnectDrive()`), `web/src/pages/Manage.tsx` (render section with `id="drive"`), `web/src/styles.css`

**Interfaces:**
- Consumes: Task 3 routes.
- UI: not configured → short text + link "Hướng dẫn cài đặt" (GitHub URL of `docs/google-drive-backup.md`); not connected → **Kết nối Google Drive** (`window.location.href = '/api/manage/drive/connect'`); connected → email, schedule radio **Hằng tuần / Hằng ngày / Tắt**, last run (time, size via `fmtBytes`), next run, status badge (ok green; incomplete amber with message; error / needs-reconnect red with message; running "Đang backup… <bytesSent>" polled every 3 s), **Backup ngay** (disabled while running; shows server error verbatim), **Kết nối lại** when `needs-reconnect`, **Ngắt kết nối** (confirm "Ngắt kết nối Google Drive? Các bản backup trên Drive vẫn được giữ.").
- Guide (Vietnamese): create project → enable Drive API → OAuth consent screen External, scopes `drive.file`, `openid`, `email`, publish **In production** → Credentials → OAuth client "Web application", redirect `https://lookback.daste.io.vn/api/manage/drive/callback` → put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `deploy/.env` → `docker compose up -d` → `/manage` → Kết nối. Plus restore steps (download tar from Drive → restore command).
- [ ] **Step 1: Failing tests:** `not configured shows the setup link`; `connected shows email, schedule and last run; changing schedule PATCHes`; `running shows progress and disables Backup ngay`; `needs-reconnect shows Kết nối lại`; `Backup ngay 409 shows "Đang backup…"`.
- [ ] **Step 2: Run** `cd web && npx vitest run test/DriveBackup.test.tsx` → FAIL. **Step 3: Implement.** **Step 4: Run** web suite + `npx tsc --noEmit -p .` → PASS.
- [ ] **Step 5: Commit** `feat(web): Backup Drive section on /manage, setup guide`.

### Task 6: Real-account check (owner)

**Files:** none (fixes only if something breaks).

- [ ] **Step 1:** Rebuild the local stack; owner follows `docs/google-drive-backup.md` with redirect `http://127.0.0.1:2611/api/manage/drive/callback` added to the OAuth client, logs in on `/manage`, clicks **Kết nối Google Drive**.
- [ ] **Step 2:** **Backup ngay** → Drive folder "Look Back backup" holds one `lookback-backup-<date>.tar` whose size matches `/manage`; download it and `tar -tf` lists `db.json` and `media/…`.
- [ ] **Step 3:** **Backup ngay** again → still exactly one file (the new one).
- [ ] **Step 4:** Commit any fixes: `fix: issues found in Drive backup check`.
