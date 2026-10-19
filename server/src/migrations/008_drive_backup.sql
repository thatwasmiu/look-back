-- Automatic backup to the owner's Google Drive: one settings/status row. The refresh token is encrypted (secrets.ts).
-- Not part of backups (BACKUP_TABLES).
create table drive_backup (
  id smallint primary key default 1 check (id = 1),
  account_email text,
  refresh_enc text,
  folder_id text,
  schedule text not null default 'weekly' check (schedule in ('weekly', 'daily', 'off')),
  status text not null default 'idle' check (status in ('idle', 'running', 'ok', 'incomplete', 'error', 'needs-reconnect')),
  message text,
  started_at timestamptz,
  finished_at timestamptz,
  bytes_sent bigint,
  last_file_id text,
  last_bytes bigint,
  complete_file_id text
);
