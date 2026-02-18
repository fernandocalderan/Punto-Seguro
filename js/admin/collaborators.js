(function adminCollaborators() {
  const tableBody = document.querySelector("#collaborators-table tbody");
  const form = document.getElementById("collaborator-form");
  const metricsNode = document.getElementById("collaborators-metrics");
  const detailSection = document.getElementById("collaborator-detail");
  const detailContent = document.getElementById("collaborator-detail-content");
  const alertNode = document.getElementById("collaborator-alert");

  const fields = {
    id: document.getElementById("collaborator-id"),
    name: document.getElementById("collaborator-name"),
    type: document.getElementById("collaborator-type"),
    trackingCode: document.getElementById("collaborator-tracking-code"),
    commissionType: document.getElementById("collaborator-commission-type"),
    commissionValue: document.getElementById("collaborator-commission-value"),
    status: document.getElementById("collaborator-status"),
  };

  let collaboratorsCache = [];
  const leadsCountByCollaborator = new Map();

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

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function toCurrency(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "-";
    return `${amount} EUR`;
  }

  function statusBadge(status) {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "active") {
      return '<span class="ps-badge ps-badge--ok">active</span>';
    }
    if (normalized === "paused") {
      return '<span class="ps-badge ps-badge--warn">paused</span>';
    }
    if (normalized === "banned") {
      return '<span class="ps-badge ps-badge--danger">banned</span>';
    }
    return `<span class="ps-badge">${escapeHtml(normalized || "-")}</span>`;
  }

  function clearForm() {
    form.reset();
    fields.id.value = "";
    fields.commissionType.value = "percent";
    fields.commissionValue.value = "10";
    fields.status.value = "active";
  }

  function fillForm(collaborator) {
    fields.id.value = collaborator.id;
    fields.name.value = collaborator.name || "";
    fields.type.value = collaborator.type || "";
    fields.trackingCode.value = collaborator.tracking_code || "";
    fields.commissionType.value = collaborator.commission_type || "percent";
    fields.commissionValue.value = String(collaborator.commission_value ?? 0);
    fields.status.value = collaborator.status || "active";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderMetrics() {
    const total = collaboratorsCache.length;
    const active = collaboratorsCache.filter((item) => item.status === "active").length;
    const paused = collaboratorsCache.filter((item) => item.status === "paused").length;

    metricsNode.innerHTML = `
      <div class="card kpi" style="padding:1rem;">
        <span class="muted">Total</span>
        <strong>${total}</strong>
      </div>
      <div class="card kpi" style="padding:1rem;">
        <span class="muted">Activos</span>
        <strong>${active}</strong>
      </div>
      <div class="card kpi" style="padding:1rem;">
        <span class="muted">Paused</span>
        <strong>${paused}</strong>
      </div>
    `;
  }

  function renderTable() {
    if (collaboratorsCache.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="8">No hay colaboradores cargados.</td></tr>';
      return;
    }

    tableBody.innerHTML = collaboratorsCache
      .map((collaborator) => {
        const commission = collaborator.commission_type === "percent"
          ? `${collaborator.commission_value}%`
          : toCurrency(collaborator.commission_value);
        const leadsCount = leadsCountByCollaborator.get(collaborator.id);
        const nextStatus = collaborator.status === "active" ? "paused" : "active";

        return `
          <tr>
            <td>${escapeHtml(collaborator.name)}</td>
            <td>${escapeHtml(collaborator.type || "-")}</td>
            <td><code>${escapeHtml(collaborator.tracking_code || "-")}</code></td>
            <td>${escapeHtml(commission)}</td>
            <td>${statusBadge(collaborator.status)}</td>
            <td>${collaborator.created_at ? new Date(collaborator.created_at).toLocaleString("es-ES") : "-"}</td>
            <td>
              <button type="button" class="btn btn-secondary btn-compact" data-leads="${escapeHtml(collaborator.id)}">
                ${Number.isFinite(leadsCount) ? `Ver (${leadsCount})` : "Ver"}
              </button>
            </td>
            <td>
              <button type="button" class="btn btn-secondary btn-compact" data-edit="${escapeHtml(collaborator.id)}">Editar</button>
              <button type="button" class="btn btn-secondary btn-compact" data-toggle="${escapeHtml(collaborator.id)}" data-next-status="${escapeHtml(nextStatus)}">
                ${nextStatus === "paused" ? "Pausar" : "Activar"}
              </button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  async function loadCollaborators() {
    const data = await api("/api/admin/collaborators");
    collaboratorsCache = Array.isArray(data.collaborators) ? data.collaborators : [];
    renderMetrics();
    renderTable();
  }

  async function loadCollaboratorLeads(collaboratorId) {
    const data = await api(`/api/admin/collaborators/${encodeURIComponent(collaboratorId)}/leads`);
    const collaborator = data.collaborator;
    const leads = Array.isArray(data.leads) ? data.leads : [];

    leadsCountByCollaborator.set(collaboratorId, leads.length);
    renderTable();

    const leadsHtml = leads.length === 0
      ? "<p class=\"muted\">No hay leads asociados.</p>"
      : `
        <ul class="list">
          ${leads.slice(0, 20).map((lead) => `
            <li>
              <strong>${escapeHtml(lead.name || "-")}</strong>
              (${lead.created_at ? new Date(lead.created_at).toLocaleDateString("es-ES") : "-"})
              · ${escapeHtml(lead.status || "-")}
              · Comisión est.: ${toCurrency(lead.commission_estimated_eur)}
            </li>
          `).join("")}
        </ul>
      `;

    detailSection.style.display = "grid";
    detailContent.innerHTML = `
      <p><strong>${escapeHtml(collaborator.name || "-")}</strong> · <code>${escapeHtml(collaborator.tracking_code || "-")}</code></p>
      <p class="muted">Tipo: ${escapeHtml(collaborator.type || "-")} · Estado: ${escapeHtml(collaborator.status || "-")} · Comisión: ${escapeHtml(collaborator.commission_type || "-")} (${escapeHtml(String(collaborator.commission_value ?? 0))})</p>
      <p><strong>Leads asociados:</strong> ${leads.length}</p>
      ${leadsHtml}
    `;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showAlert("");

    const payload = {
      name: fields.name.value.trim(),
      type: fields.type.value.trim(),
      tracking_code: fields.trackingCode.value.trim().toUpperCase(),
      commission_type: fields.commissionType.value,
      commission_value: Number(fields.commissionValue.value),
      status: fields.status.value,
    };

    try {
      if (fields.id.value) {
        await api(`/api/admin/collaborators/${encodeURIComponent(fields.id.value)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/admin/collaborators", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      }

      showAlert("Colaborador guardado.");
      clearForm();
      await loadCollaborators();
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  tableBody.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit]");
    if (editButton) {
      const collaborator = collaboratorsCache.find((item) => item.id === editButton.dataset.edit);
      if (collaborator) fillForm(collaborator);
      return;
    }

    const toggleButton = event.target.closest("[data-toggle]");
    if (toggleButton) {
      const collaboratorId = toggleButton.dataset.toggle;
      const nextStatus = String(toggleButton.dataset.nextStatus || "").trim();
      if (!collaboratorId || !nextStatus) return;

      try {
        await api(`/api/admin/collaborators/${encodeURIComponent(collaboratorId)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: nextStatus }),
        });

        await loadCollaborators();
      } catch (error) {
        showAlert(error.message, true);
      }
      return;
    }

    const leadsButton = event.target.closest("[data-leads]");
    if (leadsButton) {
      const collaboratorId = leadsButton.dataset.leads;
      if (!collaboratorId) return;

      try {
        await loadCollaboratorLeads(collaboratorId);
      } catch (error) {
        showAlert(error.message, true);
      }
    }
  });

  document.getElementById("collaborator-reset").addEventListener("click", clearForm);

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  });

  loadCollaborators().catch((error) => {
    showAlert(error.message, true);
  });
})();
