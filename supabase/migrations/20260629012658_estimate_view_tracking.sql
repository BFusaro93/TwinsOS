-- Proposal view tracking on share tokens
ALTER TABLE estimate_share_tokens
  ADD COLUMN IF NOT EXISTS first_viewed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS last_viewed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS view_count       integer NOT NULL DEFAULT 0;
