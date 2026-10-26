-- Album modes are listed in the app (shared ALBUM_MODES / MODES) and checked there: no list in the database, so a
-- new mode (photobooth now, more later) needs no migration.
alter table albums drop constraint if exists albums_mode_check;
