const { randomUUID } = require("node:crypto");

const LEAD_STATUSES = ["new", "validated", "sent", "accepted", "closed"];

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1 || value === "on") return true;
  if (value === "false" || value === "0" || value === 0 || value === "off") return false;
  return fallback;
}

function toInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createProvider(input = {}, existingProvider) {
  const provider = existingProvider ? { ...existingProvider } : {};

  provider.id = provider.id || input.id || randomUUID();
  provider.name = String(input.name ?? provider.name ?? "").trim();
  provider.email = String(input.email ?? provider.email ?? "").trim().toLowerCase();
  provider.phone = String(input.phone ?? provider.phone ?? "").trim();
  provider.zones = toArray(input.zones ?? provider.zones);
  provider.business_types = toArray(input.business_types ?? provider.business_types);
  provider.active = toBoolean(input.active ?? provider.active, true);
  provider.priority = toInteger(input.priority ?? provider.priority, 100);
  provider.daily_cap = Math.max(1, toInteger(input.daily_cap ?? provider.daily_cap, 10));
  provider.last_assigned_at =
    input.last_assigned_at !== undefined
      ? input.last_assigned_at || null
      : provider.last_assigned_at || null;

  if (!provider.name) {
    throw new Error("Provider name is required");
  }
  if (!provider.email) {
    throw new Error("Provider email is required");
  }

  return provider;
}

function createLead(input = {}, options = {}) {
  const nowIso = new Date().toISOString();
  const lead = {
    id: input.id || randomUUID(),
    created_at: input.created_at || nowIso,
    name: String(input.name || "").trim(),
    email: String(input.email || "").trim().toLowerCase(),
    phone: String(input.phone || "").trim(),
    city: String(input.city || "").trim(),
    postal_code: String(input.postal_code || "").trim(),
    business_type: String(input.business_type || "").trim().toLowerCase() || "general",
    risk_level: String(input.risk_level || "MEDIO").trim().toUpperCase(),
    urgency: String(input.urgency || "media").trim().toLowerCase(),
    budget_range: String(input.budget_range || "sin_definir").trim().toLowerCase(),
    consent: toBoolean(input.consent, false),
    consent_timestamp: input.consent_timestamp || (toBoolean(input.consent, false) ? nowIso : null),
    consent_ip: input.consent_ip || options.ip || null,
    provider_ids: Array.isArray(input.provider_ids) ? input.provider_ids.slice(0, 2) : [],
    status: LEAD_STATUSES.includes(input.status) ? input.status : "new",
    notes: input.notes ? String(input.notes) : "",
    evaluation_summary: input.evaluation_summary ? String(input.evaluation_summary) : "",
  };

  if (!lead.name) throw new Error("Lead name is required");
  if (!lead.email) throw new Error("Lead email is required");
  if (!lead.phone) throw new Error("Lead phone is required");
  if (!lead.city) throw new Error("Lead city is required");
  if (!lead.postal_code) throw new Error("Lead postal_code is required");
  if (!lead.consent) throw new Error("Lead consent must be accepted");

  return lead;
}

module.exports = {
  LEAD_STATUSES,
  createProvider,
  createLead,
};
