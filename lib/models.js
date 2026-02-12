const { randomUUID } = require("node:crypto");

const LEAD_STATUSES = ["new", "validated", "assigned", "sent", "accepted", "closed", "sold", "rejected", "deleted"];
const LEAD_INTENT_OPTIONS = new Set(["esta_semana", "1_3_meses", "informativo"]);

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

function toZoneCodes(value) {
  return toArray(value)
    .map((item) => String(item).trim())
    .map((item) => item.replace(/\D/g, ""))
    .filter((item) => item.length === 2 || item.length === 3 || item.length === 5)
    .filter((item, index, list) => list.indexOf(item) === index);
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

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePostalCode(value) {
  return String(value || "").replace(/\D/g, "").trim();
}

function normalizeRiskLevel(value) {
  const level = String(value || "MEDIO").trim().toUpperCase();
  if (level === "BAJO" || level === "ALTO") return level;
  return "MEDIO";
}

function normalizeIntentPlazo(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  return LEAD_INTENT_OPTIONS.has(normalized) ? normalized : null;
}

function parseEvaluationSummary(value) {
  if (value === undefined || value === null || value === "") {
    return {
      raw: "",
      parsed: null,
    };
  }

  if (typeof value === "object") {
    return {
      raw: value,
      parsed: value,
    };
  }

  const text = String(value);
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return {
        raw: parsed,
        parsed,
      };
    }
  } catch (_error) {
    // Keep summary as plain text if JSON parsing fails.
  }

  return {
    raw: text,
    parsed: null,
  };
}

function deriveLeadScore(baseRiskScore, intentPlazo) {
  let score = Math.round(toNumber(baseRiskScore, 0));
  if (intentPlazo === "esta_semana") score += 10;
  if (intentPlazo === "1_3_meses") score += 5;
  if (intentPlazo === "informativo") score -= 30;
  return Math.max(0, score);
}

function resolveLeadTypeForPricing(businessType, evaluationSummary) {
  const business = String(businessType || "").trim().toLowerCase();
  const evalType = String(evaluationSummary?.tipo_inmueble || "").trim().toLowerCase();
  if (business === "comercio" || evalType === "comercio") return "comercio";
  return "vivienda";
}

function deriveTicketEstimatedEur(leadType, riskLevel) {
  if (leadType === "comercio") {
    if (riskLevel === "ALTO") return 1200;
    if (riskLevel === "BAJO") return 600;
    return 900;
  }

  if (riskLevel === "ALTO") return 900;
  if (riskLevel === "BAJO") return 450;
  return 650;
}

function derivePriceEur(leadType, riskLevel) {
  if (leadType === "comercio") {
    if (riskLevel === "ALTO") return 70;
    if (riskLevel === "BAJO") return 20;
    return 35;
  }

  if (riskLevel === "ALTO") return 45;
  if (riskLevel === "BAJO") return 15;
  return 25;
}

function createProvider(input = {}, existingProvider) {
  const provider = existingProvider ? { ...existingProvider } : {};

  provider.id = provider.id || input.id || randomUUID();
  provider.name = String(input.name ?? provider.name ?? "").trim();
  provider.email = String(input.email ?? provider.email ?? "").trim().toLowerCase();
  provider.phone = String(input.phone ?? provider.phone ?? "").trim();
  provider.zones = toZoneCodes(input.zones ?? provider.zones);
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
  const { raw: evaluationSummary, parsed: parsedEvaluationSummary } = parseEvaluationSummary(input.evaluation_summary);
  const riskLevel = normalizeRiskLevel(input.risk_level);
  const intentPlazo = normalizeIntentPlazo(input.intent_plazo);
  const baseRiskScore = toNumber(parsedEvaluationSummary?.risk_score, 0);
  const leadTypeForPricing = resolveLeadTypeForPricing(input.business_type, parsedEvaluationSummary);
  const leadScore = deriveLeadScore(baseRiskScore, intentPlazo);
  const ticketEstimatedEur = deriveTicketEstimatedEur(leadTypeForPricing, riskLevel);
  const priceEur = derivePriceEur(leadTypeForPricing, riskLevel);

  const lead = {
    id: input.id || randomUUID(),
    created_at: input.created_at || nowIso,
    name: String(input.name || "").trim(),
    email: String(input.email || "").trim().toLowerCase(),
    phone: String(input.phone || "").trim(),
    city: String(input.city || "").trim(),
    postal_code: normalizePostalCode(input.postal_code),
    business_type: String(input.business_type || "").trim().toLowerCase() || "general",
    risk_level: riskLevel,
    urgency: String(input.urgency || "media").trim().toLowerCase(),
    budget_range: String(input.budget_range || "sin_definir").trim().toLowerCase(),
    intent_plazo: intentPlazo,
    lead_score: leadScore,
    ticket_estimated_eur: ticketEstimatedEur,
    price_eur: priceEur,
    consent: toBoolean(input.consent, false),
    consent_timestamp: input.consent_timestamp || (toBoolean(input.consent, false) ? nowIso : null),
    consent_ip: input.consent_ip || options.ip || null,
    provider_ids: Array.isArray(input.provider_ids) ? input.provider_ids.slice(0, 2) : [],
    assigned_provider_id: input.assigned_provider_id || null,
    assigned_at: input.assigned_at || null,
    accepted_at: input.accepted_at || null,
    sold_at: input.sold_at || null,
    assignment_mode: String(input.assignment_mode || "").trim().toLowerCase() || "auto",
    assigned_by: input.assigned_by ? String(input.assigned_by).trim() : null,
    updated_at: input.updated_at || null,
    deleted_at: input.deleted_at || null,
    status: LEAD_STATUSES.includes(input.status) ? input.status : "new",
    notes: input.notes ? String(input.notes) : "",
    evaluation_summary: evaluationSummary,
  };

  if (lead.status !== "deleted") {
    if (!lead.name) throw new Error("Lead name is required");
    if (!lead.email) throw new Error("Lead email is required");
    if (!lead.phone) throw new Error("Lead phone is required");
    if (!lead.city) throw new Error("Lead city is required");
    if (!lead.postal_code) throw new Error("Lead postal_code is required");
    if (!/^\d{5}$/.test(lead.postal_code)) throw new Error("Lead postal_code must be 5 digits");
    if (!lead.consent) throw new Error("Lead consent must be accepted");
  }

  return lead;
}

module.exports = {
  LEAD_STATUSES,
  createProvider,
  createLead,
};
