CREATE TABLE IF NOT EXISTS integration_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT DEFAULT 'Bearer',
  expires_at INTEGER NOT NULL,
  scopes TEXT,
  account_email TEXT,
  account_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_integration_credentials_user_provider ON integration_credentials(user_id, provider);
