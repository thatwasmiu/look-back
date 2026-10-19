-- Media can live on the VPS disk (storage_id null) or in an S3-compatible bucket. Secrets are encrypted (secrets.ts).
create table storage_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null check (kind = 's3'),
  endpoint text not null,
  region text not null default 'auto',
  bucket text not null,
  access_key_id text not null,
  secret_enc text null,
  cap_bytes bigint null,
  check_status text not null default 'ok' check (check_status in ('ok', 'error', 'needs-keys')),
  check_message text null,
  checked_at timestamptz null,
  created_at timestamptz not null default now()
);

alter table media add column storage_id uuid null references storage_locations(id);
alter table media add column bytes bigint null;
alter table media add column moving_to text null; -- 'local' or a location id, while a move job runs
alter table media add column move_error text null;

-- Bucket objects still to delete (the bucket may be down when their media is deleted); retried by the worker.
create table pending_deletes (
  id bigserial primary key,
  storage_id uuid not null references storage_locations(id) on delete cascade,
  prefix text not null,
  attempts int not null default 0,
  last_error text null,
  created_at timestamptz not null default now()
);
