CREATE TABLE IF NOT EXISTS evaluation_snapshots (
  token TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS evaluation_snapshots_expires_at_idx
  ON evaluation_snapshots (expires_at);
