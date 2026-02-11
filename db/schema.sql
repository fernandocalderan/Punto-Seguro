CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  zones JSONB NOT NULL DEFAULT '[]'::jsonb,
  business_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 0,
  daily_cap INT NOT NULL DEFAULT 999,
  last_assigned_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  city TEXT,
  postal_code TEXT,
  business_type TEXT,
  risk_level TEXT,
  urgency TEXT,
  budget_range TEXT,
  consent BOOLEAN NOT NULL,
  consent_timestamp TIMESTAMPTZ,
  consent_ip TEXT,
  evaluation_summary JSONB,
  provider_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  assigned_provider_id TEXT,
  assigned_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  sold_at TIMESTAMPTZ,
  intent_plazo TEXT,
  lead_score INT,
  ticket_estimated_eur INT,
  price_eur INT,
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_providers_active ON providers (active);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_provider_id ON leads (assigned_provider_id);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events (ts DESC);
