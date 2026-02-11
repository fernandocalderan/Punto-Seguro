function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function zoneMatches(lead, provider) {
  if (!Array.isArray(provider.zones) || provider.zones.length === 0) return true;
  const leadCity = normalize(lead.city);
  const leadPostalCode = normalize(lead.postal_code);

  return provider.zones.some((zone) => {
    const normalizedZone = normalize(zone);
    if (!normalizedZone) return false;
    return normalizedZone === leadPostalCode || normalizedZone === leadCity;
  });
}

function typeMatches(lead, provider) {
  if (!Array.isArray(provider.business_types) || provider.business_types.length === 0) return true;
  const leadType = normalize(lead.business_type);
  return provider.business_types.some((type) => normalize(type) === leadType);
}

function datePart(isoString) {
  if (!isoString) return "";
  return isoString.slice(0, 10);
}

function compareAssignmentOrder(a, b) {
  const aAssigned = a.last_assigned_at ? new Date(a.last_assigned_at).getTime() : 0;
  const bAssigned = b.last_assigned_at ? new Date(b.last_assigned_at).getTime() : 0;
  if (aAssigned !== bAssigned) return aAssigned - bAssigned;

  const aPriority = Number.isFinite(a.priority) ? a.priority : 100;
  const bPriority = Number.isFinite(b.priority) ? b.priority : 100;
  if (aPriority !== bPriority) return aPriority - bPriority;

  return a.name.localeCompare(b.name, "es");
}

async function assignProviders({
  lead,
  providers,
  leadRepository,
  maxProviders = 2,
  now = new Date(),
}) {
  const today = datePart(now.toISOString());

  const eligible = [];
  for (const provider of providers) {
    if (!provider.active) continue;
    if (!zoneMatches(lead, provider)) continue;
    if (!typeMatches(lead, provider)) continue;

    const assignedToday = await leadRepository.countAssignedForProviderOnDate(provider.id, today);
    if (assignedToday >= provider.daily_cap) continue;

    eligible.push(provider);
  }

  eligible.sort(compareAssignmentOrder);

  return eligible.slice(0, maxProviders);
}

module.exports = {
  assignProviders,
};
