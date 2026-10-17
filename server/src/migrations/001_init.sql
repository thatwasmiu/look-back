create table albums (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  cover_media_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table pages (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references albums(id) on delete cascade,
  position int not null,
  layout jsonb not null,
  updated_at timestamptz not null default now()
);
create index pages_album_position_idx on pages (album_id, position);

create table media (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references albums(id) on delete cascade,
  kind text not null check (kind in ('image','video')),
  status text not null,
  original_name text,
  mime text,
  width int,
  height int,
  duration_sec real,
  blur_data_url text,
  variants jsonb,
  error text,
  created_at timestamptz not null default now()
);
