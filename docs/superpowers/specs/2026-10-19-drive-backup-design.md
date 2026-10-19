# Automatic backup to Google Drive — design

Date: 2026-10-19. Status: draft for owner approval (builder check done).

## Why

The owner wants copies of everything kept off the VPS and off the storage buckets, without remembering to click
"Download backup": if the VPS or a bucket is lost, the albums and every photo/video can be rebuilt from Google Drive.

## What the owner decided

- **Periodic, unattended**: a job runs the backup on a schedule; **default once a week**.
- **One full backup kept**: each run uploads a new full `.tar` (the same backup as `/manage` → Download backup) and
  then deletes the previous one. Drive always holds exactly the latest backup.
- Managed from the hidden `/manage` page.

## Goals

1. Owner connects one Google account once, from `/manage`.
2. The worker makes a full backup on schedule and uploads it to a Drive folder **Look Back backup**.
3. The previous backup file is deleted only after the new one is fully uploaded and its size verified.
4. `/manage` shows: connected account, schedule, last run (time, size, OK / error with reason), next run; buttons
   **Backup ngay**, change schedule, disconnect.
5. Restoring = download the `.tar` from Drive to the VPS and run the existing `restore.js`.

## Non-goals

- Keeping several versions, incremental/deduplicated backups.
- Restoring from `/manage` or straight from Drive.
- More than one Google account, other clouds (Dropbox, OneDrive…).

## Anti-goals

- **Losing the last good backup**: never delete the old file before the new one is verified. A failed run leaves Drive
  as it was.
- **Over-reaching permissions**: the app may only see/manage files it created (scope `drive.file`), never the rest of
  the owner's Drive.
- **Leaking tokens**: the Google refresh token is encrypted at rest (same scheme as bucket keys), never sent to the
  browser, never logged, never in backups.
- **Hurting the app**: the backup runs in the worker, streamed (no full copy on the VPS disk), never in the api
  process.

## How it works

### Setup (one time, documented step by step)

- The owner creates a Google Cloud project, enables the **Google Drive API**, configures the OAuth consent screen
  (External, scopes `drive.file` + `openid email`) and sets publishing status **In production** — `drive.file` is a
  non-sensitive scope, so no Google verification is needed and refresh tokens don't expire after 7 days.
- Creates an OAuth client of type **Web application** with redirect URI
  `https://<domain>/api/manage/drive/callback`.
- Puts `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `deploy/.env` (passed to api and worker). Without them the
  Backup Drive section explains what to set up instead of offering "Connect".
- Guide: `docs/google-drive-backup.md` (Vietnamese, with the exact clicks); `/manage` links to it.

### Connect / disconnect

- **Kết nối Google Drive** → `GET /api/manage/drive/connect` → redirect to Google consent (`access_type=offline`,
  `prompt=consent`, random `state` kept in the owner's session) → `GET /api/manage/drive/callback` exchanges the code,
  stores the encrypted refresh token and the account email, creates (or finds) the folder **Look Back backup**, then
  returns to `/manage`.
- **Ngắt kết nối** revokes the token at Google and forgets it (existing backup files stay in Drive).

### Data (single settings row)

`drive_backup`: account email, encrypted refresh token, folder id, schedule (`weekly` | `daily` | `off`), last run
started/finished time, status (`ok` | `error` | `running`), message, last file id, last file size.
*(My call)* weekly = Sunday 03:00, daily = 03:00, time zone `Asia/Ho_Chi_Minh`.

### The job

- pg-boss cron schedule `drive-backup` (re-registered when the owner changes the schedule; removed when `off` or
  disconnected). **Backup ngay** sends the same job once. Only one run at a time (a second request while running is
  refused with a message).
- The run builds the backup tar stream with the **same code as the download** (the existing backup function is
  extracted so both use it) and streams it into a **Drive resumable upload** in chunks (size not known up front),
  file name `lookback-backup-YYYY-MM-DD.tar`, inside the folder.
- After upload: check Drive reports the same size as bytes sent → record success → delete every other
  `lookback-backup-*.tar` in that folder that the app created. Any failure: delete the half-made new file if Drive
  created one, keep the old one, record `error` + reason.
- Drive full ("storageQuotaExceeded") → error message says so, in Vietnamese, with the needed size.
- **Incomplete runs (owner decided: keep the old complete backup).** If some files couldn't be read (a broken bucket →
  `MISSING.txt` inside the tar), the new file is uploaded but the run ends as **"thiếu file"** (warning) and the latest
  *complete* backup is **not** deleted. Drive then holds at most two files: the last complete backup and the newest
  incomplete one (an older incomplete one is replaced by a newer one). The next complete run deletes both older files.
  The row remembers which file is the last complete backup (`complete_file_id`).

### Failures are shown on `/manage` only (owner decided)

No email or other alert. `/manage` makes problems obvious: status badge red for `error`, amber for "thiếu file", and a
plain reason ("Quyền truy cập Drive đã hết — bấm Kết nối lại", "Drive không đủ chỗ: cần ~X GB"). A revoked/expired
Google token (`invalid_grant`) turns into "cần kết nối lại".

### `/manage` section "Backup Drive"

Account, schedule picker (Hằng tuần / Hằng ngày / Tắt), last run, next run, status, **Backup ngay**, **Ngắt kết nối**,
link to the setup guide. While a run is going: "Đang backup…" with bytes uploaded so far (polled).

## Constraints

- Same stack: Fastify api, pg-boss worker, React `/manage` (lazy chunk). No Google SDK if plain HTTPS calls suffice
  (builder's call).
- Drive free space is shared with Gmail/Photos; during upload both old and new backups exist, so Drive needs about
  twice the backup size free. `/manage` shows the current backup size so the owner can judge.
- Works behind the existing nginx; the callback path is under `/api/manage/` (owner session required).

## Left to the builder

- Table/route/job names, chunk size (a multiple of 256 KiB), retry of individual chunk uploads, how progress is
  stored.
- Whether to use Google's token endpoint and Drive REST directly or a small library.
- Exact wording of the setup guide (Vietnamese) and status messages.
