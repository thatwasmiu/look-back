-- Background music: audio uploads, and the track an album plays while it is viewed.
alter table media drop constraint media_kind_check;
alter table media add constraint media_kind_check check (kind in ('image', 'video', 'audio'));
alter table albums add column music_media_id uuid null;
