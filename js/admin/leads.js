(function adminLeads() {
  const tableBody = document.querySelector("#leads-table tbody");
  const detailSection = document.getElementById("lead-detail");
  const detailContent = document.getElementById("lead-detail-content");
  const updateForm = document.getElementById("lead-update-form");
  const alertNode = document.getElementById("lead-alert");
  const metricsNode = document.getElementById("metrics");
  const statusFilter = document.getElementById("status-filter");

  const leadIdInput = document.getElementById("lead-id");
  const statusInput = document.getElementById("lead-status");
  const notesInput = document.getElementById("lead-notes");

  const primaryProviderSelect = document.getElementById("manual-provider-primary");
  const secondaryProviderSelect = document.getElementById("manual-provider-secondary");
  const manualNoteInput = document.getElementById("manual-note");
  const assignManualBtn = document.getElementById("assign-manual-btn");
  const reassignAutoBtn = document.getElementById("reassign-auto-btn");
  const anonymizeReasonInput = document.getElementById("anonymize-reason");
  const anonymizeBtn = document.getElementById("anonymize-btn");

  let leadsCache = [];
  let providersCache = [];
  let providerMap = new Map();
  let activeStatusFilter = "all";

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

  function getVisibleLeads() {
    if (!activeStatusFilter || activeStatusFilter === "all") return leadsCache;
    return leadsCache.filter((lead) => lead.status === activeStatusFilter);
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
        return `
          <tr>
            <td>${new Date(lead.created_at).toLocaleString("es-ES")}</td>
            <td>${lead.name}<br><span class="muted">${lead.email}</span></td>
            <td>${lead.city} (${lead.postal_code})</td>
            <td>${lead.risk_level}</td>
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

  function formatEvaluationSummary(lead) {
    if (!lead.evaluation_summary) {
      return "<div class=\"notice\">Resumen evaluación: No disponible</div>";
    }

    if (typeof lead.evaluation_summary === "string") {
      return `<div class="notice">Resumen evaluación: ${escapeHtml(lead.evaluation_summary)}</div>`;
    }

    const summaryJson = JSON.stringify(lead.evaluation_summary, null, 2);
    const factors = Array.isArray(lead.evaluation_summary.factores_top)
      ? lead.evaluation_summary.factores_top
      : [];
    const factorsHtml = factors.length > 0
      ? `<ul class="list">${factors
        .map((factor) => `<li>${escapeHtml(factor.texto || "Factor")}</li>`)
        .join("")}</ul>`
      : "<p class=\"muted\">Sin factores destacados guardados.</p>";

    return `
      <div class="notice">
        <p><b>Top factores</b></p>
        ${factorsHtml}
      </div>
      <pre style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:0.75rem;overflow:auto;">${escapeHtml(summaryJson)}</pre>
    `;
  }

  function openLeadDetail(lead) {
    detailSection.style.display = "grid";
    leadIdInput.value = lead.id;
    statusInput.value = lead.status;
    notesInput.value = lead.notes || "";
    if (manualNoteInput) manualNoteInput.value = "";
    if (anonymizeReasonInput) anonymizeReasonInput.value = "";

    renderProviderSelects(Array.isArray(lead.provider_ids) ? lead.provider_ids : []);

    const isDeleted = lead.status === "deleted" || Boolean(lead.deleted_at);
    if (assignManualBtn) assignManualBtn.disabled = isDeleted;
    if (reassignAutoBtn) reassignAutoBtn.disabled = isDeleted;
    if (primaryProviderSelect) primaryProviderSelect.disabled = isDeleted;
    if (secondaryProviderSelect) secondaryProviderSelect.disabled = isDeleted;
    if (manualNoteInput) manualNoteInput.disabled = isDeleted;

    detailContent.innerHTML = `
      <div class="grid">
        <div>
          <p><b>Lead ID:</b> ${lead.id}</p>
          <p><b>Nombre:</b> ${lead.name}</p>
          <p><b>Teléfono:</b> ${lead.phone}</p>
          <p><b>Email:</b> ${lead.email}</p>
          <p><b>Ciudad:</b> ${lead.city}</p>
          <p><b>Código postal:</b> ${lead.postal_code}</p>
        </div>
        <div>
          <p><b>Tipo:</b> ${lead.business_type}</p>
          <p><b>Riesgo:</b> ${lead.risk_level}</p>
          <p><b>Lead score:</b> ${lead.lead_score ?? "-"}</p>
          <p><b>Ticket estimado:</b> ${toCurrency(lead.ticket_estimated_eur)}</p>
          <p><b>Precio:</b> ${toCurrency(lead.price_eur)}</p>
          <p><b>Plazo intención:</b> ${intentLabel(lead.intent_plazo)}</p>
          <p><b>Urgencia:</b> ${lead.urgency}</p>
          <p><b>Presupuesto:</b> ${lead.budget_range}</p>
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
      ${formatEvaluationSummary(lead)}
    `;
  }

  async function loadAll() {
    const [leadsData, metricsData, providersData] = await Promise.all([
      api("/api/admin/leads"),
      api("/api/admin/metrics"),
      api("/api/admin/providers"),
    ]);

    leadsCache = leadsData.leads || [];
    providersCache = providersData.providers || [];
    providerMap = new Map(providersCache.map((provider) => [provider.id, provider]));

    renderTable();
    renderMetrics(metricsData);
    renderProviderSelects([]);
  }

  tableBody.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-open]");
    if (!button) return;

    const selected = leadsCache.find((lead) => lead.id === button.dataset.open);
    if (!selected) return;

    try {
      const data = await api(`/api/admin/leads/${selected.id}`);
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

    try {
      await api(`/api/admin/leads/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: statusInput.value,
          notes: notesInput.value,
        }),
      });

      showAlert("Lead actualizado.");
      await loadAll();
      const data = await api(`/api/admin/leads/${id}`);
      openLeadDetail(data.lead);
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  async function reloadAndOpenLead(id) {
    await loadAll();
    const data = await api(`/api/admin/leads/${id}`);
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

  anonymizeBtn?.addEventListener("click", async () => {
    showAlert("");

    const id = leadIdInput.value;
    if (!id) return;

    const ok = window.confirm("¿Anonimizar este lead? Esto eliminará datos personales y marcará el lead como deleted.");
    if (!ok) return;

    const reason = String(anonymizeReasonInput?.value || "").trim();

    try {
      await api(`/api/admin/leads/${id}/anonymize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      showAlert("Lead anonimizado.");
      await reloadAndOpenLead(id);
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  statusFilter?.addEventListener("change", (event) => {
    activeStatusFilter = String(event.target.value || "all");
    renderTable();
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  });

  loadAll().catch((error) => {
    showAlert(error.message, true);
  });
})();
