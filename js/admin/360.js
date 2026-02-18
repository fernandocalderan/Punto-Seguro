(function admin360View() {
  const fromInput = document.getElementById("f-from");
  const toInput = document.getElementById("f-to");
  const statusSelect = document.getElementById("f-status");
  const collaboratorSelect = document.getElementById("f-collaborator");
  const providerSelect = document.getElementById("f-provider");
  const applyButton = document.getElementById("f-apply");
  const clearButton = document.getElementById("f-clear");
  const alertNode = document.getElementById("metrics360-alert");
  const funnelCardsNode = document.getElementById("funnel-cards");
  const funnelRatiosNode = document.getElementById("funnel-ratios");
  const collaboratorTableBody = document.querySelector("#rank-collaborators-table tbody");
  const providerTableBody = document.querySelector("#rank-providers-table tbody");
  const matrixThead = document.querySelector("#matrix-table thead");
  const matrixTbody = document.querySelector("#matrix-table tbody");
  const leadsMetaNode = document.getElementById("metrics360-leads-meta");
  const leadsTableBody = document.querySelector("#metrics360-leads-table tbody");
  const logoutButton = document.getElementById("logout-btn");

  if (
    !fromInput ||
    !toInput ||
    !statusSelect ||
    !collaboratorSelect ||
    !providerSelect ||
    !applyButton ||
    !clearButton
  ) {
    return;
  }

  const DAY_MS = 24 * 60 * 60 * 1000;
  const initialQuery = new URLSearchParams(window.location.search);

  const state = {
    collaborators: [],
    providers: [],
    collaboratorById: new Map(),
    providerById: new Map(),
    currentFilters: {},
  };

  function showAlert(message, isError) {
    if (!alertNode) return;

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

    let payload;
    try {
      payload = await response.json();
    } catch (_error) {
      throw new Error("Invalid API response");
    }

    if (!response.ok) {
      throw new Error(payload.error || "Request failed");
    }
    return payload;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatCurrency(value) {
    const amount = toNumber(value);
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  function formatPercent(value) {
    const amount = toNumber(value);
    return `${amount.toFixed(1)}%`;
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("es-ES");
  }

  function toInputDateValue(date) {
    const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return shifted.toISOString().slice(0, 10);
  }

  function setDefaultRange() {
    const now = new Date();
    const fromDate = new Date(now.getTime() - 29 * DAY_MS);
    if (!fromInput.value) fromInput.value = toInputDateValue(fromDate);
    if (!toInput.value) toInput.value = toInputDateValue(now);
  }

  function resetRangeLast30Days() {
    const now = new Date();
    const fromDate = new Date(now.getTime() - 29 * DAY_MS);
    fromInput.value = toInputDateValue(fromDate);
    toInput.value = toInputDateValue(now);
  }

  function buildParamsFromFilters() {
    setDefaultRange();

    const params = {};
    const from = String(fromInput.value || "").trim();
    const to = String(toInput.value || "").trim();
    const status = String(statusSelect.value || "").trim();
    const collaboratorId = String(collaboratorSelect.value || "").trim();
    const providerId = String(providerSelect.value || "").trim();

    if (from) params.from = from;
    if (to) params.to = to;
    if (status) params.status = status;
    if (collaboratorId) params.collaborator_id = collaboratorId;
    if (providerId) params.provider_id = providerId;
    return params;
  }

  function queryString(params) {
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      search.set(key, String(value));
    });
    return search.toString();
  }

  function syncUrl(params) {
    const nextUrl = new URL(window.location.href);
    ["from", "to", "status", "collaborator_id", "provider_id"].forEach((key) => {
      if (params[key]) {
        nextUrl.searchParams.set(key, params[key]);
      } else {
        nextUrl.searchParams.delete(key);
      }
    });
    const search = nextUrl.searchParams.toString();
    window.history.replaceState({}, "", search ? `${nextUrl.pathname}?${search}` : nextUrl.pathname);
  }

  function collaboratorName(id) {
    if (!id) return "-";
    return state.collaboratorById.get(id)?.name || id;
  }

  function providerName(id) {
    if (!id) return "-";
    return state.providerById.get(id)?.name || id;
  }

  function renderSelectOptions(selectNode, rows, selectedValue) {
    const options = (Array.isArray(rows) ? rows.slice() : [])
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es"))
      .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name || item.id)}</option>`)
      .join("");

    const firstOption = selectNode.querySelector("option");
    const firstHtml = firstOption
      ? `<option value="">${escapeHtml(firstOption.textContent || "Todos")}</option>`
      : '<option value="">Todos</option>';

    selectNode.innerHTML = firstHtml + options;
    if (selectedValue) {
      selectNode.value = selectedValue;
    }
  }

  function renderStatusOptions(statusValues) {
    const currentValue = String(statusSelect.value || "").trim();
    const existing = Array.from(statusSelect.options)
      .map((option) => String(option.value || "").trim())
      .filter(Boolean);
    const merged = Array.from(
      new Set([
        ...existing,
        ...(Array.isArray(statusValues) ? statusValues.map((value) => String(value || "").trim()).filter(Boolean) : []),
      ])
    ).sort((a, b) => a.localeCompare(b, "es"));

    statusSelect.innerHTML =
      '<option value="">Todos</option>' +
      merged.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");

    if (currentValue && merged.includes(currentValue)) {
      statusSelect.value = currentValue;
    }
  }

  function renderFunnel(funnel) {
    const data = funnel || {};
    const cards = [
      { key: "new", label: "New" },
      { key: "assigned", label: "Assigned" },
      { key: "contacted", label: "Contacted" },
      { key: "won", label: "Won" },
      { key: "lost", label: "Lost" },
      { key: "otp_verified", label: "OTP verified" },
    ];

    funnelCardsNode.innerHTML = cards.map((card) => `
      <div class="card kpi" style="padding:1rem;">
        <span class="muted">${escapeHtml(card.label)}</span>
        <strong>${toNumber(data[card.key])}</strong>
      </div>
    `).join("");

    funnelRatiosNode.innerHTML = `
      <div class="card kpi" style="padding:1rem;">
        <span class="muted">New → Assigned</span>
        <strong>${formatPercent(data.conversion_new_to_assigned)}</strong>
      </div>
      <div class="card kpi" style="padding:1rem;">
        <span class="muted">Assigned → Won</span>
        <strong>${formatPercent(data.conversion_assigned_to_won)}</strong>
      </div>
    `;
  }

  function renderCollaboratorsTable(rows) {
    const collaborators = Array.isArray(rows) ? rows : [];
    if (collaborators.length === 0) {
      collaboratorTableBody.innerHTML = "<tr><td colspan=\"7\">Sin datos para el rango seleccionado.</td></tr>";
      return;
    }

    collaboratorTableBody.innerHTML = collaborators.map((row) => `
      <tr>
        <td>${escapeHtml(row.name || row.collaborator_id || "-")}</td>
        <td>${toNumber(row.leads_total)}</td>
        <td>${formatPercent(row.otp_rate)}</td>
        <td>${formatCurrency(row.commission_total_eur)}</td>
        <td>${formatCurrency(row.avg_ticket_eur)}</td>
        <td>${toNumber(row.avg_risk_score).toFixed(2)}</td>
        <td>
          <button
            type="button"
            class="btn btn-secondary btn-compact"
            data-view-collaborator="${escapeHtml(row.collaborator_id || "")}"
          >
            Ver leads
          </button>
        </td>
      </tr>
    `).join("");
  }

  function renderProvidersTable(rows) {
    const providers = Array.isArray(rows) ? rows : [];
    if (providers.length === 0) {
      providerTableBody.innerHTML = "<tr><td colspan=\"8\">Sin datos para el rango seleccionado.</td></tr>";
      return;
    }

    providerTableBody.innerHTML = providers.map((row) => `
      <tr>
        <td>${escapeHtml(row.name || row.provider_id || "-")}</td>
        <td>${toNumber(row.leads_assigned)}</td>
        <td>${formatPercent(row.win_rate)}</td>
        <td>${toNumber(row.won)}</td>
        <td>${toNumber(row.lost)}</td>
        <td>${formatCurrency(row.avg_ticket_eur)}</td>
        <td>${toNumber(row.avg_risk_score).toFixed(2)}</td>
        <td>
          <button
            type="button"
            class="btn btn-secondary btn-compact"
            data-view-provider="${escapeHtml(row.provider_id || "")}"
          >
            Ver leads
          </button>
        </td>
      </tr>
    `).join("");
  }

  function renderMatrix(matrixPayload) {
    const matrix = matrixPayload && typeof matrixPayload === "object" ? matrixPayload : {};
    const collaboratorIds = Array.isArray(matrix.collaborator_ids) ? matrix.collaborator_ids : [];
    const providerIds = Array.isArray(matrix.provider_ids) ? matrix.provider_ids : [];
    const cells = Array.isArray(matrix.cells) ? matrix.cells : [];

    if (collaboratorIds.length === 0 || providerIds.length === 0) {
      matrixThead.innerHTML = "<tr><th>Colaborador \\ Proveedor</th></tr>";
      matrixTbody.innerHTML = "<tr><td>Sin datos cruzados en el rango seleccionado.</td></tr>";
      return;
    }

    const cellMap = new Map(
      cells.map((cell) => [`${cell.collaborator_id}|${cell.provider_id}`, cell])
    );

    matrixThead.innerHTML = `
      <tr>
        <th>Colaborador \\ Proveedor</th>
        ${providerIds.map((providerId) => `<th>${escapeHtml(providerName(providerId))}</th>`).join("")}
      </tr>
    `;

    matrixTbody.innerHTML = collaboratorIds.map((collaboratorId) => {
      const rowCells = providerIds.map((providerId) => {
        const key = `${collaboratorId}|${providerId}`;
        const cell = cellMap.get(key);
        const leads = toNumber(cell?.leads);
        const otpVerified = toNumber(cell?.otp_verified);
        const commission = toNumber(cell?.commission_eur);

        return `
          <td>
            <button
              type="button"
              class="btn btn-secondary btn-compact"
              style="min-width:3.3rem;"
              data-matrix-collaborator="${escapeHtml(collaboratorId)}"
              data-matrix-provider="${escapeHtml(providerId)}"
              title="Leads: ${leads} · OTP: ${otpVerified} · Comisión: ${formatCurrency(commission)}"
            >
              ${leads}
            </button>
          </td>
        `;
      }).join("");

      return `
        <tr>
          <th>${escapeHtml(collaboratorName(collaboratorId))}</th>
          ${rowCells}
        </tr>
      `;
    }).join("");
  }

  function renderLeadsTable(payload) {
    const leads = Array.isArray(payload?.leads) ? payload.leads : [];
    const total = toNumber(payload?.total);
    const limit = toNumber(payload?.limit);

    if (leadsMetaNode) {
      leadsMetaNode.textContent = `Mostrando ${leads.length} de ${total} lead(s) filtrados. Límite ${limit}.`;
    }

    if (leads.length === 0) {
      leadsTableBody.innerHTML = "<tr><td colspan=\"9\">No hay leads para los filtros seleccionados.</td></tr>";
      return;
    }

    leadsTableBody.innerHTML = leads.map((lead) => {
      const riskText = `${escapeHtml(lead.risk_level || "-")} / ${toNumber(lead.risk_score).toFixed(1)}`;
      const otp = lead.phone_verified === true ? "Sí" : "No";
      const collaboratorTracking = lead.collaborator_tracking_code || "-";
      const providerPrimary = lead.provider_primary_id || "-";
      const providerSecondary = lead.provider_secondary_id || "-";
      const openHref = `/admin/leads?lead=${encodeURIComponent(lead.id)}`;

      return `
        <tr>
          <td>${escapeHtml(formatDateTime(lead.created_at))}</td>
          <td>${escapeHtml(lead.tipo_inmueble || "-")}</td>
          <td>${riskText}</td>
          <td>${escapeHtml(otp)}</td>
          <td><code>${escapeHtml(collaboratorTracking)}</code></td>
          <td>${escapeHtml(providerPrimary)}</td>
          <td>${escapeHtml(providerSecondary)}</td>
          <td>${escapeHtml(lead.status || "-")}</td>
          <td><a href="${openHref}">Abrir lead</a></td>
        </tr>
      `;
    }).join("");
  }

  async function loadFilters() {
    const [collaboratorResponse, providerResponse] = await Promise.all([
      api("/api/admin/collaborators"),
      api("/api/admin/providers"),
    ]);

    state.collaborators = Array.isArray(collaboratorResponse.collaborators)
      ? collaboratorResponse.collaborators
      : [];
    state.providers = Array.isArray(providerResponse.providers)
      ? providerResponse.providers
      : [];
    state.collaboratorById = new Map(state.collaborators.map((item) => [item.id, item]));
    state.providerById = new Map(state.providers.map((item) => [item.id, item]));

    const selectedCollaborator = initialQuery.get("collaborator_id") || collaboratorSelect.value;
    const selectedProvider = initialQuery.get("provider_id") || providerSelect.value;

    renderSelectOptions(collaboratorSelect, state.collaborators, selectedCollaborator);
    renderSelectOptions(providerSelect, state.providers, selectedProvider);
  }

  async function fetch360(params) {
    const query = queryString(params);
    const data = await api(`/api/admin/metrics/360?${query}`);

    renderStatusOptions(data.status_values);
    renderFunnel(data.funnel);
    renderCollaboratorsTable(data.collaborators);
    renderProvidersTable(data.providers);
    renderMatrix(data.matrix);

    return data;
  }

  async function fetchLeads(params) {
    const query = queryString({
      ...params,
      limit: 200,
    });
    const data = await api(`/api/admin/metrics/360/leads?${query}`);
    renderLeadsTable(data);
    return data;
  }

  async function refreshDashboard(options = {}) {
    const { onlyLeads = false } = options;
    const params = buildParamsFromFilters();
    state.currentFilters = params;
    syncUrl(params);
    showAlert("");

    if (onlyLeads) {
      await fetchLeads(params);
      return;
    }

    await Promise.all([
      fetch360(params),
      fetchLeads(params),
    ]);
  }

  function applyInitialFilterState() {
    const queryFrom = initialQuery.get("from");
    const queryTo = initialQuery.get("to");
    const queryStatus = initialQuery.get("status");

    if (queryFrom) fromInput.value = queryFrom;
    if (queryTo) toInput.value = queryTo;
    if (queryStatus) statusSelect.value = queryStatus;
    setDefaultRange();
  }

  function scrollToLeadsSection() {
    const leadCard = leadsTableBody?.closest(".card");
    if (!leadCard) return;
    leadCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  applyButton.addEventListener("click", async () => {
    try {
      await refreshDashboard();
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  clearButton.addEventListener("click", async () => {
    statusSelect.value = "";
    collaboratorSelect.value = "";
    providerSelect.value = "";
    resetRangeLast30Days();

    try {
      await refreshDashboard();
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  collaboratorTableBody.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-view-collaborator]");
    if (!button) return;

    const collaboratorId = String(button.dataset.viewCollaborator || "").trim();
    if (!collaboratorId) return;
    collaboratorSelect.value = collaboratorId;
    providerSelect.value = "";

    try {
      await refreshDashboard({ onlyLeads: true });
      scrollToLeadsSection();
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  providerTableBody.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-view-provider]");
    if (!button) return;

    const providerId = String(button.dataset.viewProvider || "").trim();
    if (!providerId) return;
    providerSelect.value = providerId;
    collaboratorSelect.value = "";

    try {
      await refreshDashboard({ onlyLeads: true });
      scrollToLeadsSection();
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  matrixTbody.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-matrix-collaborator][data-matrix-provider]");
    if (!button) return;

    const collaboratorId = String(button.dataset.matrixCollaborator || "").trim();
    const providerId = String(button.dataset.matrixProvider || "").trim();
    if (!collaboratorId || !providerId) return;

    collaboratorSelect.value = collaboratorId;
    providerSelect.value = providerId;

    try {
      await refreshDashboard({ onlyLeads: true });
      scrollToLeadsSection();
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  logoutButton?.addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  });

  (async function boot() {
    applyInitialFilterState();
    try {
      await loadFilters();
      await refreshDashboard();
    } catch (error) {
      showAlert(error.message, true);
    }
  }());
}());
