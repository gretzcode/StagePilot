-- StagePilot Material Storage Provider & TTL Migration

CREATE TABLE IF NOT EXISTS material_registry (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  room_code TEXT,
  source_type TEXT NOT NULL DEFAULT 'EXTERNAL_URL',
  material_type TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'external_url',
  storage_reference TEXT,
  title TEXT NOT NULL,
  original_file_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER DEFAULT 0,
  object_key TEXT,
  external_url TEXT,
  slide_count INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'READY',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  deleted_at INTEGER,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_material_registry_owner ON material_registry(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_material_registry_room ON material_registry(room_code);
CREATE INDEX IF NOT EXISTS idx_material_registry_expires ON material_registry(expires_at);
