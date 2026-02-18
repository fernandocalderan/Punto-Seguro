(function adminCollaborators() {
  const tableBody = document.querySelector("#collaborators-table tbody");
  const form = document.getElementById("collaborator-form");
  const metricsNode = document.getElementById("collaborators-metrics");
  const detailSection = document.getElementById("collaborator-detail");
  const detailContent = document.getElementById("collaborator-detail-content");
  const alertNode = document.getElementById("collaborator-alert");
  const newButton = document.getElementById("collaborator-new-btn");
  const modal = document.getElementById("collaborator-modal");
  const modalTitle = document.getElementById("collaborator-modal-title");
  const modalCloseButton = document.getElementById("collaborator-modal-close");
  const modalBackdrop = modal?.querySelector("[data-close-collaborator-modal]");

  const fields = {
    id: document.getElementById("collaborator-id"),
    name: document.getElementById("collaborator-name"),
    type: document.getElementById("collaborator-type"),
    trackingCode: document.getElementById("collaborator-tracking-code"),
    commissionType: document.getElementById("collaborator-commission-type"),
    commissionValue: document.getElementById("collaborator-commission-value"),
    status: document.getElementById("collaborator-status"),
    email: document.getElementById("collaborator-email"),
    phone: document.getElementById("collaborator-phone"),
  };

  let collaboratorsCache = [];
  const leadsCountByCollaborator = new Map();
  const deepLinkCollaboratorId = new URLSearchParams(window.location.search).get("id");
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
    if (normalized === "active") return '<span class="ps-badge ps-badge--ok">active</span>';
    if (normalized === "paused") return '<span class="ps-badge ps-badge--warn">paused</span>';
    if (normalized === "banned") return '<span class="ps-badge ps-badge--danger">banned</span>';
    return `<span class="ps-badge">${escapeHtml(normalized || "-")}</span>`;
  }

  function clearForm() {
    form.reset();
    fields.id.value = "";
    fields.commissionType.value = "percent";
    fields.commissionValue.value = "10";
    fields.status.value = "active";
  }

  function openModal(title) {
    if (modalTitle) modalTitle.textContent = title;
    if (modal) modal.hidden = false;
  }

  function closeModal() {
    if (modal) modal.hidden = true;
  }

  function fillForm(collaborator) {
    fields.id.value = collaborator.id;
    fields.name.value = collaborator.name || "";
    fields.type.value = collaborator.type || "";
    fields.trackingCode.value = collaborator.tracking_code || "";
    fields.commissionType.value = collaborator.commission_type || "percent";
    fields.commissionValue.value = String(collaborator.commission_value ?? 0);
    fields.status.value = collaborator.status || "active";
    fields.email.value = collaborator.email || "";
    fields.phone.value = collaborator.phone || "";
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
    if (!Array.isArray(collaboratorsCache) || collaboratorsCache.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="9">No hay colaboradores cargados.</td></tr>';
      return;
    }

    tableBody.innerHTML = collaboratorsCache
      .map((collaborator) => {
        const commission = collaborator.commission_type === "percent"
          ? `${collaborator.commission_value}%`
          : toCurrency(collaborator.commission_value);
        const leadsCount = leadsCountByCollaborator.get(collaborator.id);
        const nextStatus = collaborator.status === "active" ? "paused" : "active";
        const contact = [
          collaborator.email || "",
          collaborator.phone || "",
        ].filter(Boolean).join(" · ") || "-";

        return `
          <tr>
            <td>${escapeHtml(collaborator.name)}</td>
            <td>${escapeHtml(collaborator.type || "-")}</td>
            <td><code>${escapeHtml(collaborator.tracking_code || "-")}</code></td>
            <td>${escapeHtml(commission)}</td>
            <td>${statusBadge(collaborator.status)}</td>
            <td>${escapeHtml(contact)}</td>
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
              <button type="button" class="btn btn-secondary btn-compact" data-ban="${escapeHtml(collaborator.id)}">Banear</button>
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

    if (deepLinkCollaboratorId && !deepLinkHandled) {
      deepLinkHandled = true;
      await openCollaboratorDetail(deepLinkCollaboratorId);
    }
  }

  async function loadLeadsForCollaborator(collaboratorId) {
    const data = await api(`/api/admin/collaborators/${encodeURIComponent(collaboratorId)}/leads`);
    const collaborator = data.collaborator;
    const leads = Array.isArray(data.leads) ? data.leads : [];

    leadsCountByCollaborator.set(collaboratorId, leads.length);
    renderTable();

    const leadsHtml = leads.length === 0
      ? "<p class=\"muted\">No hay leads asociados.</p>"
      : `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Lead</th>
                <th>Estado</th>
                <th>IEI</th>
                <th>Comision est.</th>
                <th>Accion</th>
              </tr>
            </thead>
            <tbody>
              ${leads.slice(0, 20).map((lead) => `
                <tr>
                  <td>${lead.created_at ? new Date(lead.created_at).toLocaleDateString("es-ES") : "-"}</td>
                  <td>${escapeHtml(lead.name || "-")}</td>
                  <td>${escapeHtml(lead.status || "-")}</td>
                  <td>${escapeHtml(lead.risk_level || "-")}</td>
                  <td>${toCurrency(lead.commission_estimated_eur)}</td>
                  <td><a href="/admin/leads?lead=${encodeURIComponent(lead.id)}">Ver lead</a></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;

    detailSection.style.display = "grid";
    detailContent.innerHTML = `
      <p><strong>${escapeHtml(collaborator.name || "-")}</strong> · <code>${escapeHtml(collaborator.tracking_code || "-")}</code></p>
      <p class="muted">Tipo: ${escapeHtml(collaborator.type || "-")} · Estado: ${escapeHtml(collaborator.status || "-")} · Comision: ${escapeHtml(collaborator.commission_type || "-")} (${escapeHtml(String(collaborator.commission_value ?? 0))})</p>
      <p class="muted">Contacto: ${escapeHtml(collaborator.email || "-")} · ${escapeHtml(collaborator.phone || "-")}</p>
      <p><strong>Leads asociados:</strong> ${leads.length}</p>
      ${leadsHtml}
    `;
  }

  async function openCollaboratorDetail(collaboratorId) {
    const collaborator = collaboratorsCache.find((item) => item.id === collaboratorId);
    if (!collaborator) {
      showAlert("Colaborador no encontrado.", true);
      return;
    }

    fillForm(collaborator);
    openModal("Editar colaborador");
    await loadLeadsForCollaborator(collaboratorId);
  }

  function buildPayload() {
    return {
      name: fields.name.value.trim(),
      type: fields.type.value.trim(),
      tracking_code: fields.trackingCode.value.trim().toUpperCase(),
      commission_type: fields.commissionType.value,
      commission_value: Number(fields.commissionValue.value),
      status: fields.status.value,
      email: fields.email.value.trim(),
      phone: fields.phone.value.trim(),
    };
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showAlert("");

    const payload = buildPayload();
    try {
      if (fields.id.value) {
        await api(`/api/admin/collaborators/${encodeURIComponent(fields.id.value)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/admin/collaborators", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      showAlert("Colaborador guardado.");
      closeModal();
      clearForm();
      await loadCollaborators();
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  tableBody.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit]");
    if (editButton) {
      const collaboratorId = String(editButton.dataset.edit || "").trim();
      if (!collaboratorId) return;
      try {
        await openCollaboratorDetail(collaboratorId);
      } catch (error) {
        showAlert(error.message, true);
      }
      return;
    }

    const toggleButton = event.target.closest("[data-toggle]");
    if (toggleButton) {
      const collaboratorId = String(toggleButton.dataset.toggle || "").trim();
      const nextStatus = String(toggleButton.dataset.nextStatus || "").trim();
      if (!collaboratorId || !nextStatus) return;

      try {
        await api(`/api/admin/collaborators/${encodeURIComponent(collaboratorId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });
        await loadCollaborators();
      } catch (error) {
        showAlert(error.message, true);
      }
      return;
    }

    const banButton = event.target.closest("[data-ban]");
    if (banButton) {
      const collaboratorId = String(banButton.dataset.ban || "").trim();
      if (!collaboratorId) return;

      try {
        await api(`/api/admin/collaborators/${encodeURIComponent(collaboratorId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "banned" }),
        });
        await loadCollaborators();
      } catch (error) {
        showAlert(error.message, true);
      }
      return;
    }

    const leadsButton = event.target.closest("[data-leads]");
    if (leadsButton) {
      const collaboratorId = String(leadsButton.dataset.leads || "").trim();
      if (!collaboratorId) return;

      try {
        await loadLeadsForCollaborator(collaboratorId);
      } catch (error) {
        showAlert(error.message, true);
      }
    }
  });

  newButton?.addEventListener("click", () => {
    clearForm();
    openModal("Nuevo colaborador");
  });

  document.getElementById("collaborator-reset")?.addEventListener("click", () => {
    clearForm();
    closeModal();
  });

  modalCloseButton?.addEventListener("click", () => {
    clearForm();
    closeModal();
  });

  modalBackdrop?.addEventListener("click", () => {
    clearForm();
    closeModal();
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  });

  loadCollaborators().catch((error) => {
    showAlert(error.message, true);
  });
}());
