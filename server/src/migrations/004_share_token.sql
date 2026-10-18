-- Secret code for a read-only public link to one album; null = not shared.
alter table albums add column share_token text unique;
