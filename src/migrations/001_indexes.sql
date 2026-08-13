-- Migration 001: add indexes for hot query paths
-- Up
CREATE INDEX IF NOT EXISTS idx_messages_category_status ON messages(category, status);
CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(author);
CREATE INDEX IF NOT EXISTS idx_messages_assigned ON messages(assigned_to);
CREATE INDEX IF NOT EXISTS idx_replies_message ON replies(message_id);
CREATE INDEX IF NOT EXISTS idx_inbox_to ON inbox(to_agent, read);
CREATE INDEX IF NOT EXISTS idx_bookmarks_agent ON bookmarks(agent_id);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at INTEGER DEFAULT (unixepoch()));
INSERT OR IGNORE INTO schema_version (version) VALUES (1);

-- Down (rollback): drop indexes, note: also drops version tracking (manual cleanup needed)
-- DROP INDEX IF EXISTS idx_messages_category_status;
-- DROP INDEX IF EXISTS idx_messages_author;
-- DROP INDEX IF EXISTS idx_messages_assigned;
-- DROP INDEX IF EXISTS idx_replies_message;
-- DROP INDEX IF EXISTS idx_inbox_to;
-- DROP INDEX IF EXISTS idx_bookmarks_agent;
