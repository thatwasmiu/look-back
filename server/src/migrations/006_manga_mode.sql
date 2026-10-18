-- Album mode (fixed at creation) and reading direction (manga albums may read right-to-left).
alter table albums add column mode text not null default 'scrapbook' check (mode in ('scrapbook', 'manga'));
alter table albums add column reading_direction text not null default 'ltr' check (reading_direction in ('ltr', 'rtl'));
