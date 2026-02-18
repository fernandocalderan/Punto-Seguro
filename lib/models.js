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
  const level = String(value || "MODERADA").trim().toUpperCase();

  // Backward compatibility with legacy levels.
  if (level === "BAJO") return "CONTROLADA";
  if (level === "MEDIO") return "MODERADA";
  if (level === "ALTO") return "ELEVADA";

  if (level === "CONTROLADA" || level === "MODERADA" || level === "ELEVADA" || level === "CRÍTICA") {
    return level;
  }

  return "MODERADA";
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
    if (riskLevel === "CRÍTICA" || riskLevel === "ELEVADA") return 1200;
    if (riskLevel === "CONTROLADA") return 600;
    return 900;
  }

  if (riskLevel === "CRÍTICA" || riskLevel === "ELEVADA") return 900;
  if (riskLevel === "CONTROLADA") return 450;
  return 650;
}

function derivePriceEur(leadType, riskLevel) {
  if (leadType === "comercio") {
    if (riskLevel === "CRÍTICA" || riskLevel === "ELEVADA") return 70;
    if (riskLevel === "CONTROLADA") return 20;
    return 35;
  }

  if (riskLevel === "CRÍTICA" || riskLevel === "ELEVADA") return 45;
  if (riskLevel === "CONTROLADA") return 15;
  return 25;
}

function normalizeUrgency(value) {
  const urgency = String(value || "").trim().toLowerCase();
  if (!urgency) return "baja";
  if (urgency === "alta" || urgency === "high") return "alta";
  if (urgency === "media" || urgency === "medium") return "media";
  if (urgency === "baja" || urgency === "low") return "baja";
  return "baja";
}

function hasMeaningfulSummary(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

function extractReasonsCount(parsedSummary) {
  if (!parsedSummary || typeof parsedSummary !== "object") return 0;

  const drivers = Array.isArray(parsedSummary.drivers) ? parsedSummary.drivers.length : 0;
  const topFactors = Array.isArray(parsedSummary.top_factors) ? parsedSummary.top_factors.length : 0;
  const factoresTop = Array.isArray(parsedSummary.factores_top) ? parsedSummary.factores_top.length : 0;
  const factorsTop = Array.isArray(parsedSummary.factors_top) ? parsedSummary.factors_top.length : 0;

  return drivers + topFactors + factoresTop + factorsTop;
}

function deriveCommercialTier(score) {
  const numericScore = Math.max(0, Math.min(100, Math.round(toNumber(score, 0))));
  if (numericScore >= 80) return "Premium";
  if (numericScore >= 60) return "Alta";
  if (numericScore >= 40) return "Media";
  return "Baja";
}

function calculateCommercialScore({
  urgency,
  riskLevel,
  evaluationSummaryRaw,
  evaluationSummaryParsed,
  phoneVerified,
  otpResponseSeconds,
  city,
  budgetRange,
  notes,
  businessType,
}) {
  let score = 0;

  // A) Urgencia (max 30)
  const normalizedUrgency = normalizeUrgency(urgency);
  if (normalizedUrgency === "alta") score += 30;
  else if (normalizedUrgency === "media") score += 18;
  else score += 8;

  // B) Nivel IEI (max 25)
  if (riskLevel === "CRÍTICA") score += 25;
  else if (riskLevel === "ELEVADA") score += 20;
  else if (riskLevel === "MODERADA") score += 12;
  else if (riskLevel === "CONTROLADA") score += 5;
  else score += 8;

  // C) Evaluación completa / resumen (max 15)
  const hasSummaryPayload = hasMeaningfulSummary(evaluationSummaryRaw);
  if (hasSummaryPayload) {
    const summaryText = String(evaluationSummaryParsed?.summary || "").trim();
    const reasonsCount = extractReasonsCount(evaluationSummaryParsed);
    if (summaryText && reasonsCount >= 1) score += 15;
    else score += 8;
  }

  // D) Teléfono verificado (max 15)
  if (phoneVerified) score += 15;

  // E) Velocidad OTP (max 10)
  if (Number.isFinite(otpResponseSeconds)) {
    if (otpResponseSeconds <= 30) score += 10;
    else if (otpResponseSeconds <= 90) score += 6;
    else score += 3;
  } else {
    score += 3;
  }

  // F) Campos opcionales completados (max 5)
  let optionalCount = 0;
  if (String(city || "").trim()) optionalCount += 1;
  if (String(notes || "").trim()) optionalCount += 1;
  if (String(businessType || "").trim() && String(businessType || "").trim().toLowerCase() !== "general") optionalCount += 1;

  const normalizedBudget = String(budgetRange || "").trim().toLowerCase();
  if (normalizedBudget && normalizedBudget !== "sin_definir") optionalCount += 1;
  if (String(urgency || "").trim()) optionalCount += 1;

  if (optionalCount >= 3) score += 5;
  else if (optionalCount >= 1) score += 3;

  return Math.max(0, Math.min(100, Math.round(score)));
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
  const resolvedRiskScore = toNumber(parsedEvaluationSummary?.risk_score ?? input.risk_score ?? input.iei_score, 0);
  const riskScore = Math.max(0, Math.min(100, Math.round(resolvedRiskScore)));
  const baseRiskScore = riskScore;
  const leadTypeForPricing = resolveLeadTypeForPricing(input.business_type, parsedEvaluationSummary);
  const leadScore = deriveLeadScore(baseRiskScore, intentPlazo);
  const ticketEstimatedEur = deriveTicketEstimatedEur(leadTypeForPricing, riskLevel);
  const priceEur = derivePriceEur(leadTypeForPricing, riskLevel);
  const phoneVerified = toBoolean(input.phone_verified, false);
  const otpResponseSecondsRaw = Number(input.otp_response_seconds);
  const otpResponseSeconds = Number.isFinite(otpResponseSecondsRaw) ? Math.max(0, Math.round(otpResponseSecondsRaw)) : null;
  const computedCommercialScore = calculateCommercialScore({
    urgency: input.urgency,
    riskLevel,
    evaluationSummaryRaw: evaluationSummary,
    evaluationSummaryParsed: parsedEvaluationSummary,
    phoneVerified,
    otpResponseSeconds,
    city: input.city,
    budgetRange: input.budget_range,
    notes: input.notes,
    businessType: input.business_type,
  });
  const explicitCommercialScore = Number(input.commercial_score);
  const commercialScore = Number.isFinite(explicitCommercialScore)
    ? Math.max(0, Math.min(100, Math.round(explicitCommercialScore)))
    : computedCommercialScore;
  const commercialTier = String(input.commercial_tier || "").trim() || deriveCommercialTier(commercialScore);
  const providerIds = Array.isArray(input.provider_ids)
    ? input.provider_ids
        .map((id) => String(id).trim())
        .filter(Boolean)
        .slice(0, 2)
    : [];
  const assignedProviderId = providerIds.length > 0 ? providerIds[0] : null;

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
    risk_score: riskScore,
    urgency: String(input.urgency || "media").trim().toLowerCase(),
    budget_range: String(input.budget_range || "sin_definir").trim().toLowerCase(),
    intent_plazo: intentPlazo,
    phone_verified: phoneVerified,
    otp_started_at: input.otp_started_at || null,
    otp_verified_at: input.otp_verified_at || null,
    otp_response_seconds: otpResponseSeconds,
    commercial_score: commercialScore,
    commercial_tier: commercialTier,
    lead_score: leadScore,
    ticket_estimated_eur: ticketEstimatedEur,
    price_eur: priceEur,
    consent: toBoolean(input.consent, false),
    consent_timestamp: input.consent_timestamp || (toBoolean(input.consent, false) ? nowIso : null),
    consent_ip: input.consent_ip || options.ip || null,
    provider_ids: providerIds,
    assigned_provider_id: assignedProviderId,
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
    if (!lead.phone) throw new Error("Lead phone is required");
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
