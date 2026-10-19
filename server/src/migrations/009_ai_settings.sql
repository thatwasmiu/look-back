-- AI album (Gemini): one settings row. The API key is encrypted (secrets.ts); only its last 4 chars are shown.
-- Not part of backups (BACKUP_TABLES): after a restore the key is entered again.
create table ai_settings (
  id smallint primary key default 1 check (id = 1),
  key_enc text,
  key_last4 text,
  model text
);
