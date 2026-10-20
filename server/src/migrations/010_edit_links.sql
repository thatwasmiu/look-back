-- Temporary edit link for one album: anyone holding it may put photos into the existing frames and change text,
-- until edit_expires_at (8 hours after it was made). Null = none.
alter table albums add column edit_token text unique;
alter table albums add column edit_expires_at timestamptz;
