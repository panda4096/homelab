-- +goose Up
-- P9: per-user avatar. Small raster image (PNG/JPEG) stored in Postgres and served
-- via an auth-gated endpoint. avatar_updated_at doubles as a has-avatar flag and a
-- cache-busting version for the read URL.
ALTER TABLE users ADD COLUMN avatar_data bytea;
ALTER TABLE users ADD COLUMN avatar_mime text;
ALTER TABLE users ADD COLUMN avatar_updated_at timestamptz;

-- +goose Down
ALTER TABLE users DROP COLUMN IF EXISTS avatar_updated_at;
ALTER TABLE users DROP COLUMN IF EXISTS avatar_mime;
ALTER TABLE users DROP COLUMN IF EXISTS avatar_data;
