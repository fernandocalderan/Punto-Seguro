function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizePostalCode(value) {
  return String(value || "").replace(/\D/g, "").trim();
}

function debugAssignment(...args) {
  if (process.env.ASSIGNMENT_DEBUG === "true") {
    console.log("[assignment]", ...args);
  }
}

function zoneMatches(lead, provider) {
  if (!Array.isArray(provider.zones) || provider.zones.length === 0) return true;
  const leadPostalCode = normalizePostalCode(lead.postal_code);
  if (!leadPostalCode) return false;

  return provider.zones.some((zone) => {
    const normalizedZone = normalizePostalCode(zone);
    if (!normalizedZone) return false;
    if (normalizedZone.length === 5 && normalizedZone === leadPostalCode) return true;
    const isPostalPrefix = normalizedZone.length === 2 || normalizedZone.length === 3;
    if (isPostalPrefix && leadPostalCode.startsWith(normalizedZone)) return true;
    return false;
  });
}

function typeMatches(lead, provider) {
  if (!Array.isArray(provider.business_types) || provider.business_types.length === 0) return true;
  const leadType = normalize(lead.business_type);
  if (!leadType) return true;
  return provider.business_types.some((type) => normalize(type) === leadType);
}

function datePart(isoString) {
  if (!isoString) return "";
  return isoString.slice(0, 10);
}

function compareAssignmentOrder(a, b) {
  const aPriority = Number.isFinite(a.priority) ? a.priority : 100;
  const bPriority = Number.isFinite(b.priority) ? b.priority : 100;
  if (aPriority !== bPriority) return aPriority - bPriority;

  const aAssigned = a.last_assigned_at ? new Date(a.last_assigned_at).getTime() : 0;
  const bAssigned = b.last_assigned_at ? new Date(b.last_assigned_at).getTime() : 0;
  if (aAssigned !== bAssigned) return aAssigned - bAssigned;

  return a.name.localeCompare(b.name, "es");
}

async function assignProviders({
  lead,
  providers,
  leadRepository,
  maxProviders = 2,
  now = new Date(),
}) {
  // Manual checks (ASSIGNMENT_DEBUG=true):
  // 1) lead postal_code=08002 with zone=08002 => match exact.
  // 2) lead postal_code=08002 with zone=080 => match by prefix.
  // 3) lead postal_code=08840 with zones=["barcelona","abc"] => invalid zones ignored.
  const today = datePart(now.toISOString());

  const eligible = [];
  for (const provider of providers) {
    if (!provider.active) continue;
    if (!zoneMatches(lead, provider)) continue;
    if (!typeMatches(lead, provider)) continue;

    const assignedToday = await leadRepository.countAssignedForProviderOnDate(provider.id, today);
    if (assignedToday >= provider.daily_cap) continue;

    debugAssignment("eligible", {
      provider_id: provider.id,
      lead_postal_code: lead.postal_code,
      assigned_today: assignedToday,
    });
    eligible.push(provider);
  }

  eligible.sort(compareAssignmentOrder);

  return eligible.slice(0, maxProviders);
}

module.exports = {
  assignProviders,
};
