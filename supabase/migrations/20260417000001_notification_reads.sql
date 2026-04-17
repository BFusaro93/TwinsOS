-- Stores which notifications each user has read, enabling cross-device sync.
-- Notification IDs are deterministic strings like "req-approval-{uuid}", "wo-overdue-{uuid}", etc.
CREATE TABLE IF NOT EXISTS notification_reads (
  user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notif_id text        NOT NULL,
  read_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notif_id)
);

ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;

-- Users can only see and manage their own rows
CREATE POLICY "notification_reads_select" ON notification_reads
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notification_reads_insert" ON notification_reads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notification_reads_delete" ON notification_reads
  FOR DELETE USING (auth.uid() = user_id);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS notification_reads_user_idx ON notification_reads(user_id);
