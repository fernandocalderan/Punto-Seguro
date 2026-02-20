(function adminLeads() {
  const tableBody = document.querySelector("#leads-table tbody");
  const detailSection = document.getElementById("lead-detail");
  const detailContent = document.getElementById("lead-detail-content");
  const updateForm = document.getElementById("lead-update-form");
  const alertNode = document.getElementById("lead-alert");
  const metricsNode = document.getElementById("metrics");
  const statusFilter = document.getElementById("status-filter");
  const searchInput = document.getElementById("q-search");
  const ieiFilter = document.getElementById("iei-filter");
  const ticketMinInput = document.getElementById("ticket-min");
  const noProviderInput = document.getElementById("no-provider");

  const leadIdInput = document.getElementById("lead-id");
  const statusInput = document.getElementById("lead-status");
  const notesInput = document.getElementById("lead-notes");
  const assignedProviderInput = document.getElementById("lead-assigned-provider-id");
  const providerIdsInput = document.getElementById("lead-provider-ids");
  const priceInput = document.getElementById("lead-price-eur");
  const ticketInput = document.getElementById("lead-ticket-estimated-eur");
  const urgencyInput = document.getElementById("lead-urgency");
  const budgetRangeInput = document.getElementById("lead-budget-range");
  const intentPlazoInput = document.getElementById("lead-intent-plazo");
  const collaboratorIdInput = document.getElementById("lead-collaborator-id");
  const collaboratorTrackingInput = document.getElementById("lead-collaborator-tracking-code");
  const editToggleBtn = document.getElementById("lead-edit-toggle-btn");
  const saveBtn = document.getElementById("lead-save-btn");
  const leadDeleteBtn = document.getElementById("lead-delete-btn");

  const primaryProviderSelect = document.getElementById("manual-provider-primary");
  const secondaryProviderSelect = document.getElementById("manual-provider-secondary");
  const manualNoteInput = document.getElementById("manual-note");
  const assignManualBtn = document.getElementById("assign-manual-btn");
  const reassignAutoBtn = document.getElementById("reassign-auto-btn");
  const leadModal = document.getElementById("lead-modal");
  const leadModalClose = document.getElementById("lead-modal-close");
  const leadModalBackdrop = leadModal?.querySelector("[data-close-lead-modal]");

  let leadsCache = [];
  let providersCache = [];
  let providerMap = new Map();
  let activeStatusFilter = "all";
  let searchDebounceTimer = null;
  let selectedLead = null;
  let editMode = false;
  const deepLinkParams = new URLSearchParams(window.location.search);
  const deepLinkLeadId = deepLinkParams.get("lead") || deepLinkParams.get("id");
  let deepLinkHandled = false;

  function showAlert(message, isError) {
    if (!message) {
      alertNode.style.display = "none";
      alertNode.textContent = "";
      alertNode.className = "notice";
      return;
    }

    alertNode.style.display = "block";
    alertNode.textContent = message;
    alertNode.className = isError ? "notice error" : "notice";
  }

  async function api(path, options) {
    const response = await fetch(path, options);
    if (response.status === 401) {
      window.location.href = "/admin/login";
      throw new Error("Unauthorized");
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }

    return data;
  }

  function intentLabel(value) {
    if (value === "esta_semana") return "Esta semana";
    if (value === "1_3_meses") return "1-3 meses";
    if (value === "informativo") return "Informativo";
    return "-";
  }

  function toCurrency(value) {
    if (value === null || value === undefined || value === "") return "-";
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "-";
    return `${parsed} EUR`;
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function parseAmount(value) {
    if (value === null || value === undefined || value === "") return NaN;
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    const cleaned = String(value).replace(/[^\d,.-]/g, "").replace(",", ".");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function leadRiskBucket(lead) {
    const token = normalizeText(
      lead?.risk_level ||
      lead?.riskLevel ||
      lead?.iei_level ||
      lead?.exposure_level ||
      ""
    );
    if (token.includes("crit")) return "critica";
    if (token.includes("elev")) return "elevada";
    if (token.includes("moder")) return "moderada";
    return "";
  }

  function leadTicketValue(lead) {
    return parseAmount(
      lead?.ticket_estimated_eur ??
      lead?.ticket_estimated ??
      lead?.ticket ??
      lead?.ticket_eur ??
      lead?.price_eur
    );
  }

  function leadHasProvider(lead) {
    const primary = String(
      lead?.assigned_provider_id ??
      lead?.assignedProviderId ??
      lead?.provider_id ??
      ""
    ).trim();
    if (primary && primary !== "-") return true;

    if (Array.isArray(lead?.provider_ids)) {
      return lead.provider_ids.some((id) => {
        const token = String(id || "").trim();
        return token && token !== "-";
      });
    }

    return false;
  }

  function leadSearchHaystack(lead) {
    const createdAt = lead?.created_at ? new Date(lead.created_at).toLocaleString("es-ES") : "";
    const provider = providerLabel(lead?.assigned_provider_id);
    return normalizeText([
      lead?.name,
      lead?.email,
      lead?.postal_code,
      lead?.zip,
      lead?.city,
      provider,
      lead?.status,
      lead?.risk_level,
      createdAt,
    ].filter(Boolean).join(" "));
  }

  function getVisibleLeads() {
    let filtered = Array.isArray(leadsCache) ? leadsCache.slice() : [];
    filtered = filtered.filter((lead) => !lead.deleted_at);

    if (activeStatusFilter && activeStatusFilter !== "all") {
      filtered = filtered.filter((lead) => lead.status === activeStatusFilter);
    }

    const query = normalizeText(searchInput?.value || "");
    if (query) {
      filtered = filtered.filter((lead) => leadSearchHaystack(lead).includes(query));
    }

    const ieiValue = normalizeText(ieiFilter?.value || "all");
    if (ieiValue && ieiValue !== "all") {
      filtered = filtered.filter((lead) => leadRiskBucket(lead) === ieiValue);
    }

    const ticketMinValue = parseAmount(ticketMinInput?.value);
    if (Number.isFinite(ticketMinValue) && ticketMinValue > 0) {
      filtered = filtered.filter((lead) => {
        const ticket = leadTicketValue(lead);
        return Number.isFinite(ticket) && ticket >= ticketMinValue;
      });
    }

    if (Boolean(noProviderInput?.checked)) {
      filtered = filtered.filter((lead) => !leadHasProvider(lead));
    }

    return filtered;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function providerLabel(providerId) {
    if (!providerId) return "-";
    const provider = providerMap.get(providerId);
    if (!provider) return providerId;
    return provider.active ? provider.name : `${provider.name} (inactivo)`;
  }

  function providerSlotsForLead(lead) {
    const providerIds = Array.isArray(lead?.provider_ids)
      ? lead.provider_ids.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    const assignedProviderId = String(lead?.assigned_provider_id || "").trim();
    const explicitPrimaryId = String(lead?.provider_primary_id || "").trim();
    const explicitSecondaryId = String(lead?.provider_secondary_id || "").trim();

    const primaryId = providerIds[0] || assignedProviderId || explicitPrimaryId || null;
    const secondaryCandidate = providerIds[1] || explicitSecondaryId || null;
    const secondaryId = secondaryCandidate && secondaryCandidate !== primaryId ? secondaryCandidate : null;

    return { primaryId, secondaryId };
  }

  function relatedCollaboratorHtml(lead) {
    const collaborator = lead?._collaborator;
    if (!collaborator) {
      return "<p class=\"muted\">Sin colaborador atribuido.</p>";
    }

    const collaboratorName = escapeHtml(collaborator.name || "-");
    const collaboratorTracking = escapeHtml(collaborator.tracking_code || "-");
    const collaboratorId = encodeURIComponent(collaborator.id);
    const estimatedCommission = toCurrency(lead?.commission_estimated_eur);

    return `
      <p><b>Colaborador:</b> ${collaboratorName}</p>
      <p><b>Tracking code:</b> <code>${collaboratorTracking}</code></p>
      <p><b>Comisión estimada:</b> ${estimatedCommission}</p>
      <p><a class="btn btn-secondary btn-compact" href="/admin/collaborators?id=${collaboratorId}">Ver colaborador</a></p>
    `;
  }

  function relatedProvidersHtml(lead) {
    const slots = providerSlotsForLead(lead);
    const providers = Array.isArray(lead?._providers) ? lead._providers : [];
    const providerById = new Map(providers.map((provider) => [provider.id, provider]));
    const orderedIds = [slots.primaryId, slots.secondaryId].filter(Boolean);

    const rows = orderedIds
      .map((providerId, index) => {
        const provider = providerById.get(providerId) || providerMap.get(providerId);
        if (!provider) return "";

        const role = index === 0 ? "Principal" : "Secundario";
        const providerName = escapeHtml(provider.name || providerId);
        const providerLinkId = encodeURIComponent(provider.id || providerId);
        return `
          <li>
            <b>${providerName}</b>
            · Estado asignación: ${role}
            · <a href="/admin/providers?id=${providerLinkId}">Ver proveedor</a>
          </li>
        `;
      })
      .filter(Boolean)
      .join("");

    if (!rows) {
      return "<p class=\"muted\">Sin proveedores asignados.</p>";
    }

    return `<ul class="list">${rows}</ul>`;
  }

  function renderIEIReport(diagInput) {
    if (!diagInput) return "";

    let diag = diagInput;
    if (typeof diagInput === "string") {
      try {
        diag = JSON.parse(diagInput);
      } catch (_error) {
        diag = { raw: diagInput };
      }
    }

    const level = diag.risk_level || "—";
    const score = diag.risk_score ?? "—";
    const tipo = diag.tipo_inmueble || "—";
    const fecha = diag.generated_at ? new Date(diag.generated_at).toLocaleString("es-ES") : "—";
    const factores = (diag.factores_top || diag.factors_top || []).slice(0, 3);

    const levelColor = {
      CONTROLADA: "#d1fae5",
      MODERADA: "#fef3c7",
      ELEVADA: "#fde68a",
      "CRÍTICA": "#fecaca",
      CRITICA: "#fecaca",
    }[String(level).toUpperCase()] || "#e5e7eb";

    const diagnosticJson = diag.raw ? diag.raw : JSON.stringify(diag, null, 2);

    const factorsHtml = Array.isArray(factores) && factores.length > 0
      ? factores.map((f) => `<li>${escapeHtml(f?.texto || f?.text || "-")}</li>`).join("")
      : "<li>-</li>";

    return `
      <div class="iei-card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">
          <div>
            <div style="font-size:2rem;font-weight:700;">IEI™ ${escapeHtml(score)}/100</div>
            <div style="font-size:0.9rem;color:#6b7280;">Generado: ${escapeHtml(fecha)}</div>
          </div>
          <div style="padding:0.4rem 0.8rem;border-radius:999px;background:${levelColor};font-weight:600;">
            ${escapeHtml(level)}
          </div>
        </div>

        <div style="margin-top:1rem;">
          <strong>Tipo:</strong> ${escapeHtml(tipo)}
        </div>

        <div style="margin-top:1rem;">
          <strong>Top factores</strong>
          <ul style="margin-top:0.5rem;padding-left:1.2rem;">
            ${factorsHtml}
          </ul>
        </div>

        <details style="margin-top:1rem;">
          <summary style="cursor:pointer;font-weight:600;">Ver diagnóstico técnico</summary>
          <pre style="margin-top:0.5rem;background:#f3f4f6;padding:0.75rem;border-radius:6px;overflow:auto;white-space:pre-wrap;">${escapeHtml(diagnosticJson)}</pre>
        </details>
      </div>
    `;
  }

  function renderProviderSelects(selectedIds) {
    if (!primaryProviderSelect || !secondaryProviderSelect) return;

    const providers = Array.isArray(providersCache) ? providersCache.slice() : [];
    providers.sort((a, b) => {
      const aActive = a.active ? 0 : 1;
      const bActive = b.active ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return String(a.name || "").localeCompare(String(b.name || ""), "es");
    });

    const optionHtml = providers
      .map((provider) => {
        const suffix = provider.active ? "" : " (inactivo)";
        return `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.name + suffix)}</option>`;
      })
      .join("");

    primaryProviderSelect.innerHTML =
      `<option value="">Selecciona proveedor</option>` + optionHtml;
    secondaryProviderSelect.innerHTML =
      `<option value="">Sin segundo proveedor</option>` + optionHtml;

    const ids = Array.isArray(selectedIds) ? selectedIds : [];
    const primary = ids[0] || "";
    const secondary = ids[1] && ids[1] !== primary ? ids[1] : "";

    primaryProviderSelect.value = primary;
    secondaryProviderSelect.value = secondary;
  }

  function renderAssignedProviderSelect(selectedId) {
    if (!assignedProviderInput) return;

    const providers = Array.isArray(providersCache) ? providersCache.slice() : [];
    providers.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es"));
    const options = providers
      .map((provider) => `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.name)}</option>`)
      .join("");

    assignedProviderInput.innerHTML = `<option value="">Sin proveedor</option>${options}`;
    assignedProviderInput.value = selectedId || "";
  }

  function parseProviderIdsField(value) {
    return Array.from(new Set(
      String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )).slice(0, 2);
  }

  function openLeadModal(title) {
    if (leadModal) leadModal.hidden = false;
    if (detailSection) detailSection.style.display = "grid";
    const titleNode = document.getElementById("lead-modal-title");
    if (titleNode) titleNode.textContent = title || "Lead";
  }

  function closeLeadModal() {
    if (leadModal) leadModal.hidden = true;
    if (detailSection) detailSection.style.display = "none";
  }

  function setEditMode(enabled) {
    editMode = Boolean(enabled);
    if (editToggleBtn) {
      editToggleBtn.textContent = editMode ? "Cancelar edicion" : "Editar";
    }
    if (saveBtn) {
      saveBtn.disabled = !editMode;
    }

    [
      statusInput,
      notesInput,
      assignedProviderInput,
      providerIdsInput,
      priceInput,
      ticketInput,
      urgencyInput,
      budgetRangeInput,
      intentPlazoInput,
      collaboratorIdInput,
      collaboratorTrackingInput,
    ].forEach((node) => {
      if (!node) return;
      node.disabled = !editMode;
    });
  }

  function hydrateLeadEditFields(lead) {
    if (!lead) return;

    statusInput.value = lead.status || "new";
    notesInput.value = lead.notes || "";
    renderAssignedProviderSelect(lead.assigned_provider_id || "");
    if (providerIdsInput) {
      providerIdsInput.value = Array.isArray(lead.provider_ids) ? lead.provider_ids.join(", ") : "";
    }
    if (priceInput) priceInput.value = Number.isFinite(Number(lead.price_eur)) ? String(lead.price_eur) : "";
    if (ticketInput) ticketInput.value = Number.isFinite(Number(lead.ticket_estimated_eur)) ? String(lead.ticket_estimated_eur) : "";
    if (urgencyInput) urgencyInput.value = lead.urgency || "media";
    if (budgetRangeInput) budgetRangeInput.value = lead.budget_range || "";
    if (intentPlazoInput) intentPlazoInput.value = lead.intent_plazo || "";
    if (collaboratorIdInput) collaboratorIdInput.value = lead.collaborator_id || "";
    if (collaboratorTrackingInput) collaboratorTrackingInput.value = lead.collaborator_tracking_code || "";
  }

  function renderMetrics(metrics) {
    const totals = metrics.totals || {};
    const status = metrics.leads_by_status || {};

    metricsNode.innerHTML = `
      <div class="card kpi" style="padding:1rem;">
        <span class="muted">Leads totales</span>
        <strong>${totals.leads || 0}</strong>
      </div>
      <div class="card kpi" style="padding:1rem;">
        <span class="muted">Proveedores</span>
        <strong>${totals.providers || 0}</strong>
      </div>
      <div class="card kpi" style="padding:1rem;">
        <span class="muted">Leads enviados</span>
        <strong>${status.sent || 0}</strong>
      </div>
    `;
  }

  function renderTable() {
    const visibleLeads = getVisibleLeads();
    if (visibleLeads.length === 0) {
      tableBody.innerHTML = "<tr><td colspan=\"11\">No hay leads para el filtro seleccionado.</td></tr>";
      return;
    }

    tableBody.innerHTML = visibleLeads
      .map((lead) => {
        const isDeleted = lead.status === "deleted" || Boolean(lead.deleted_at);
        const contactCell = isDeleted
          ? `<span class="badge badge-deleted">Anonimizado</span>`
          : `${escapeHtml(lead.name)}<br><span class="muted">${escapeHtml(lead.email || "-")}</span>`;
        const locationCell = isDeleted
          ? "-"
          : `${escapeHtml(lead.city)} (${escapeHtml(lead.postal_code)})`;

        return `
          <tr>
            <td>${new Date(lead.created_at).toLocaleString("es-ES")}</td>
            <td>${contactCell}</td>
            <td>${locationCell}</td>
            <td>${lead.risk_level || "-"}</td>
            <td>${lead.lead_score ?? "-"}</td>
            <td>${toCurrency(lead.ticket_estimated_eur)}</td>
            <td>${intentLabel(lead.intent_plazo)}</td>
            <td>${lead.status}</td>
            <td>${escapeHtml(providerLabel(lead.assigned_provider_id))}</td>
            <td>${toCurrency(lead.price_eur)}</td>
            <td><button type="button" class="btn btn-secondary btn-compact" data-open="${lead.id}">Ver</button></td>
          </tr>
        `;
      })
      .join("");
  }

  function applySmartFilters() {
    activeStatusFilter = String(statusFilter?.value || "all");
    renderTable();
  }

  function openLeadDetail(lead) {
    selectedLead = lead;
    openLeadModal(`Lead · ${lead.id}`);
    leadIdInput.value = lead.id;
    hydrateLeadEditFields(lead);
    if (manualNoteInput) manualNoteInput.value = "";
    setEditMode(false);

    renderProviderSelects(Array.isArray(lead.provider_ids) ? lead.provider_ids : []);

    const isDeleted = lead.status === "deleted" || Boolean(lead.deleted_at);
    if (assignManualBtn) assignManualBtn.disabled = isDeleted;
    if (reassignAutoBtn) reassignAutoBtn.disabled = isDeleted;
    if (primaryProviderSelect) primaryProviderSelect.disabled = isDeleted;
    if (secondaryProviderSelect) secondaryProviderSelect.disabled = isDeleted;
    if (manualNoteInput) manualNoteInput.disabled = isDeleted;
    if (leadDeleteBtn) leadDeleteBtn.disabled = isDeleted;
    if (editToggleBtn) editToggleBtn.disabled = isDeleted;

    const piiName = isDeleted ? "Anonimizado" : escapeHtml(lead.name);
    const piiPhone = isDeleted ? "-" : escapeHtml(lead.phone || "-");
    const piiEmail = isDeleted ? "-" : escapeHtml(lead.email || "-");
    const piiCity = isDeleted ? "-" : escapeHtml(lead.city || "-");
    const piiPostal = isDeleted ? "-" : escapeHtml(lead.postal_code || "-");
    const piiBadge = isDeleted ? `<p><span class="badge badge-deleted">Anonimizado</span></p>` : "";

    const diag = lead.evaluation_summary || lead.diagnostico || lead.evaluation || null;

    detailContent.innerHTML = `
      <div class="grid">
        <div>
          ${piiBadge}
          <p><b>Lead ID:</b> ${lead.id}</p>
          <p><b>Nombre:</b> ${piiName}</p>
          <p><b>Teléfono:</b> ${piiPhone}</p>
          <p><b>Email:</b> ${piiEmail}</p>
          <p><b>Ciudad:</b> ${piiCity}</p>
          <p><b>Código postal:</b> ${piiPostal}</p>
        </div>
        <div>
          <p><b>Tipo:</b> ${escapeHtml(lead.business_type)}</p>
          <p><b>Exposición (IEI™):</b> ${lead.risk_level || "-"}</p>
          <p><b>Lead score:</b> ${lead.lead_score ?? "-"}</p>
          <p><b>Ticket estimado:</b> ${toCurrency(lead.ticket_estimated_eur)}</p>
          <p><b>Precio:</b> ${toCurrency(lead.price_eur)}</p>
          <p><b>Plazo intención:</b> ${intentLabel(lead.intent_plazo)}</p>
          <p><b>Urgencia:</b> ${escapeHtml(lead.urgency)}</p>
          <p><b>Presupuesto:</b> ${escapeHtml(lead.budget_range)}</p>
          <p><b>Consentimiento:</b> ${lead.consent ? "Sí" : "No"}</p>
          <p><b>Fecha consentimiento:</b> ${lead.consent_timestamp || "-"}</p>
          <p><b>IP consentimiento:</b> ${lead.consent_ip || "-"}</p>
          <p><b>Proveedor principal:</b> ${escapeHtml(providerLabel(lead.assigned_provider_id))}</p>
          <p><b>Asignado:</b> ${lead.assigned_at || "-"}</p>
          <p><b>Proveedores:</b> ${escapeHtml((lead.provider_ids || []).map(providerLabel).join(", ") || "Sin asignación")}</p>
          <p><b>Modo asignación:</b> ${escapeHtml(lead.assignment_mode || "-")}</p>
          <p><b>Asignado por:</b> ${escapeHtml(lead.assigned_by || "-")}</p>
          <p><b>Actualizado:</b> ${lead.updated_at || "-"}</p>
          <p><b>Borrado:</b> ${lead.deleted_at || "-"}</p>
        </div>
      </div>
      ${renderIEIReport(diag)}
      <div id="lead-related-block" class="card" style="margin-top:1rem;padding:1rem;">
        <h3 style="margin:0 0 0.8rem;">Relaciones</h3>
        <div id="lead-related-collaborator">
          ${relatedCollaboratorHtml(lead)}
        </div>
        <div id="lead-related-providers" style="margin-top:0.8rem;">
          ${relatedProvidersHtml(lead)}
        </div>
      </div>
    `;
  }

  async function loadAll() {
    const [leadsData, metricsData, providersData] = await Promise.all([
      api("/api/admin/leads?expand=collaborator,providers"),
      api("/api/admin/metrics"),
      api("/api/admin/providers"),
    ]);

    leadsCache = leadsData.leads || [];
    providersCache = providersData.providers || [];
    providerMap = new Map(providersCache.map((provider) => [provider.id, provider]));

    applySmartFilters();
    renderMetrics(metricsData);
    renderProviderSelects([]);
    renderAssignedProviderSelect("");

    if (deepLinkLeadId && !deepLinkHandled) {
      deepLinkHandled = true;
      try {
        const data = await api(`/api/admin/leads/${encodeURIComponent(deepLinkLeadId)}?expand=collaborator,providers`);
        openLeadDetail(data.lead);
      } catch (_error) {
        // Ignore invalid deep link ids and keep default listing.
      }
    }
  }

  tableBody.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-open]");
    if (!button) return;

    const selected = leadsCache.find((lead) => lead.id === button.dataset.open);
    if (!selected) return;

    try {
      const data = await api(`/api/admin/leads/${selected.id}?expand=collaborator,providers`);
      openLeadDetail(data.lead);
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  updateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showAlert("");

    const id = leadIdInput.value;
    if (!id) return;
    if (!editMode) {
      showAlert("Pulsa Editar para modificar el lead.", true);
      return;
    }

    const providerIds = parseProviderIdsField(providerIdsInput?.value || "");
    const priceValue = parseAmount(priceInput?.value);
    const ticketValue = parseAmount(ticketInput?.value);

    const payload = {
      status: statusInput.value,
      notes: notesInput.value,
      assigned_provider_id: String(assignedProviderInput?.value || "").trim() || null,
      provider_ids: providerIds,
      urgency: urgencyInput?.value || "media",
      budget_range: budgetRangeInput?.value || "",
      intent_plazo: intentPlazoInput?.value || "",
      collaborator_id: collaboratorIdInput?.value || "",
      collaborator_tracking_code: collaboratorTrackingInput?.value || "",
    };

    if (Number.isFinite(priceValue)) {
      payload.price_eur = priceValue;
    }
    if (Number.isFinite(ticketValue)) {
      payload.ticket_estimated_eur = ticketValue;
    }

    try {
      await api(`/api/admin/leads/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      showAlert("Lead actualizado.");
      await loadAll();
      const data = await api(`/api/admin/leads/${id}?expand=collaborator,providers`);
      openLeadDetail(data.lead);
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  async function reloadAndOpenLead(id) {
    await loadAll();
    const data = await api(`/api/admin/leads/${id}?expand=collaborator,providers`);
    openLeadDetail(data.lead);
  }

  assignManualBtn?.addEventListener("click", async () => {
    showAlert("");

    const id = leadIdInput.value;
    if (!id) return;

    const primary = String(primaryProviderSelect?.value || "").trim();
    const secondaryRaw = String(secondaryProviderSelect?.value || "").trim();
    const secondary = secondaryRaw && secondaryRaw !== primary ? secondaryRaw : "";

    if (!primary) {
      showAlert("Selecciona un proveedor principal.", true);
      return;
    }

    const providerIds = Array.from(new Set([primary, secondary].filter(Boolean)));
    const note = String(manualNoteInput?.value || "").trim();

    try {
      const result = await api(`/api/admin/leads/${id}/assign-manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_ids: providerIds, note }),
      });

      const warnings = Array.isArray(result.warnings) && result.warnings.length > 0
        ? ` (warnings: ${result.warnings.join("; ")})`
        : "";
      showAlert(`Asignación manual guardada.${warnings}`);
      await reloadAndOpenLead(id);
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  reassignAutoBtn?.addEventListener("click", async () => {
    showAlert("");

    const id = leadIdInput.value;
    if (!id) return;

    try {
      await api(`/api/admin/leads/${id}/reassign-auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      showAlert("Reasignación automática aplicada.");
      await reloadAndOpenLead(id);
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  editToggleBtn?.addEventListener("click", () => {
    if (!selectedLead) return;

    if (editMode) {
      hydrateLeadEditFields(selectedLead);
      setEditMode(false);
      return;
    }

    setEditMode(true);
  });

  leadDeleteBtn?.addEventListener("click", async () => {
    showAlert("");
    const id = leadIdInput.value;
    if (!id) return;

    const ok = window.confirm("¿Eliminar este lead? Se aplicara soft delete y dejara de aparecer en el listado.");
    if (!ok) return;

    try {
      await api(`/api/admin/leads/${id}`, {
        method: "DELETE",
      });
      showAlert("Lead eliminado (soft).");
      closeLeadModal();
      selectedLead = null;
      setEditMode(false);
      await loadAll();
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  statusFilter?.addEventListener("change", (event) => {
    activeStatusFilter = String(event.target.value || "all");
    applySmartFilters();
  });

  searchInput?.addEventListener("input", () => {
    window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(() => {
      applySmartFilters();
    }, 200);
  });

  ieiFilter?.addEventListener("change", () => {
    applySmartFilters();
  });

  ticketMinInput?.addEventListener("input", () => {
    applySmartFilters();
  });

  noProviderInput?.addEventListener("change", () => {
    applySmartFilters();
  });

  leadModalClose?.addEventListener("click", closeLeadModal);
  leadModalBackdrop?.addEventListener("click", closeLeadModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && leadModal && leadModal.hidden === false) {
      closeLeadModal();
    }
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  });

  loadAll().catch((error) => {
    showAlert(error.message, true);
  });
})();
