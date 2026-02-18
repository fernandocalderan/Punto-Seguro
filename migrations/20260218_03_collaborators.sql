CREATE TABLE IF NOT EXISTS collaborators (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  tracking_code TEXT NOT NULL UNIQUE,
  commission_type TEXT NOT NULL,
  commission_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS collaborator_id TEXT,
  ADD COLUMN IF NOT EXISTS collaborator_tracking_code TEXT,
  ADD COLUMN IF NOT EXISTS commission_estimated_eur INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_leads_collaborator_id ON leads (collaborator_id);
CREATE INDEX IF NOT EXISTS idx_collaborators_tracking_code ON collaborators (tracking_code);
