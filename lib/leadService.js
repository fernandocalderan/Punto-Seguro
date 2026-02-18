const { assignProviders } = require("./assignment");
const { trackEvent } = require("./events");
const { calculateCollaboratorCommission } = require("./models");

async function createLeadAndDispatch({
  leadInput,
  requesterIp,
  repositories,
  emailService,
  maxProvidersPerLead,
}) {
  const now = new Date();
  const nowIso = now.toISOString();
  const trackingCodeRaw = String(leadInput?.collaborator_tracking_code || "").trim().toUpperCase();
  let collaborator = null;

  if (trackingCodeRaw && repositories.collaborators && typeof repositories.collaborators.findByTrackingCode === "function") {
    const found = await repositories.collaborators.findByTrackingCode(trackingCodeRaw);
    if (found && found.status === "active") {
      collaborator = found;
    }
  }

  const persistedTrackingCode = collaborator ? collaborator.tracking_code : trackingCodeRaw || null;

  let lead = await repositories.leads.create(
    {
      ...leadInput,
      status: "new",
      provider_ids: [],
      collaborator_id: collaborator ? collaborator.id : null,
      collaborator_tracking_code: persistedTrackingCode,
      commission_estimated_eur: 0,
    },
    { ip: requesterIp }
  );

  if (collaborator && lead.phone_verified) {
    const estimatedCommission = calculateCollaboratorCommission(lead, collaborator);
    if (estimatedCommission !== lead.commission_estimated_eur) {
      lead = await repositories.leads.update(lead.id, {
        ...lead,
        commission_estimated_eur: estimatedCommission,
      });
    }
  }

  await trackEvent(repositories.events, "lead_submitted", {
    lead_id: lead.id,
    city: lead.city,
    risk_level: lead.risk_level,
    business_type: lead.business_type,
    collaborator_id: lead.collaborator_id || null,
    collaborator_tracking_code: lead.collaborator_tracking_code || null,
  });

  lead = await repositories.leads.update(lead.id, {
    ...lead,
    status: "validated",
  });

  const candidates = await repositories.providers.listActive();
  const assignedProviders = await assignProviders({
    lead,
    providers: candidates,
    leadRepository: repositories.leads,
    maxProviders: maxProvidersPerLead,
    now,
  });

  const assignedProviderIds = assignedProviders.map((provider) => provider.id);
  const primaryProvider = assignedProviders[0] || null;

  if (assignedProviderIds.length > 0) {
    lead = await repositories.leads.update(lead.id, {
      ...lead,
      provider_ids: assignedProviderIds,
      assigned_provider_id: primaryProvider ? primaryProvider.id : null,
      assigned_at: nowIso,
      status: "assigned",
    });
    await repositories.providers.touchAssignedAt(assignedProviderIds, nowIso);
  }

  await trackEvent(repositories.events, "lead_assigned", {
    lead_id: lead.id,
    provider_ids: assignedProviderIds,
    assigned_provider_id: primaryProvider ? primaryProvider.id : null,
    provider_count: assignedProviderIds.length,
  });

  for (const provider of assignedProviders) {
    await emailService.sendProviderLeadEmail(provider, lead);
  }

  if (assignedProviderIds.length > 0) {
    lead = await repositories.leads.update(lead.id, {
      ...lead,
      status: "sent",
    });
  }

  await emailService.sendUserConfirmationEmail(lead, maxProvidersPerLead);

  await trackEvent(repositories.events, "lead_sent", {
    lead_id: lead.id,
    provider_count: assignedProviderIds.length,
    email_mode: emailService.mode,
  });

  return {
    lead,
    assignedProviders,
  };
}

module.exports = {
  createLeadAndDispatch,
};
