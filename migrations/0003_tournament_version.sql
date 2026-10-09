-- Optimistic concurrency for multi-device score entry: every write bumps the
-- version, and PATCH /api/admin/tournament only commits if it is unchanged.
ALTER TABLE tournament ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
