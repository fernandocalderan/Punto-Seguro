ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS lead_score INT,
  ADD COLUMN IF NOT EXISTS ticket_estimated_eur INT,
  ADD COLUMN IF NOT EXISTS intent_plazo TEXT,
  ADD COLUMN IF NOT EXISTS assigned_provider_id TEXT,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_eur INT;

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_provider_id ON leads (assigned_provider_id);
