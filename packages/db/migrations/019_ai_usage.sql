-- AI Assistant usage logs
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id TEXT PRIMARY KEY,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  estimated_cost_usd REAL NOT NULL,
  model TEXT NOT NULL,
  tool_calls INTEGER DEFAULT 0,
  user_message TEXT,
  created_at TEXT DEFAULT (datetime('now', '+9 hours'))
);
