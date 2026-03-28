-- Migration 012: Add configurable submit-reply message to forms
ALTER TABLE forms ADD COLUMN submit_reply_enabled INTEGER DEFAULT 1;
ALTER TABLE forms ADD COLUMN submit_reply_type TEXT DEFAULT 'flex';
ALTER TABLE forms ADD COLUMN submit_reply_content TEXT;
