CREATE TABLE IF NOT EXISTS oauth_transactions (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  host_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  consumed_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_transactions_state_hash ON oauth_transactions(state_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_transactions_host ON oauth_transactions(host_user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_transactions_status ON oauth_transactions(status, expires_at);
