(function adminLeads() {
  const tableBody = document.querySelector("#leads-table tbody");
  const detailSection = document.getElementById("lead-detail");
  const detailContent = document.getElementById("lead-detail-content");
  const updateForm = document.getElementById("lead-update-form");
  const alertNode = document.getElementById("lead-alert");
  const metricsNode = document.getElementById("metrics");

  const leadIdInput = document.getElementById("lead-id");
  const statusInput = document.getElementById("lead-status");
  const notesInput = document.getElementById("lead-notes");

  let leadsCache = [];

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
    if (leadsCache.length === 0) {
      tableBody.innerHTML = "<tr><td colspan=\"7\">No hay leads todavía.</td></tr>";
      return;
    }

    tableBody.innerHTML = leadsCache
      .map((lead) => {
        const assigned = Array.isArray(lead.provider_ids) ? lead.provider_ids.length : 0;
        return `
          <tr>
            <td>${new Date(lead.created_at).toLocaleString("es-ES")}</td>
            <td>${lead.name}<br><span class="muted">${lead.email}</span></td>
            <td>${lead.city} (${lead.postal_code})</td>
            <td>${lead.risk_level}</td>
            <td>${lead.status}</td>
            <td>${assigned}/2</td>
            <td><button type="button" class="btn btn-secondary" style="min-height:34px;padding:0.3rem 0.7rem;" data-open="${lead.id}">Ver</button></td>
          </tr>
        `;
      })
      .join("");
  }

  function openLeadDetail(lead) {
    detailSection.style.display = "grid";
    leadIdInput.value = lead.id;
    statusInput.value = lead.status;
    notesInput.value = lead.notes || "";

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
          <p><b>Urgencia:</b> ${lead.urgency}</p>
          <p><b>Presupuesto:</b> ${lead.budget_range}</p>
          <p><b>Consentimiento:</b> ${lead.consent ? "Sí" : "No"}</p>
          <p><b>Fecha consentimiento:</b> ${lead.consent_timestamp || "-"}</p>
          <p><b>IP consentimiento:</b> ${lead.consent_ip || "-"}</p>
          <p><b>Provider IDs:</b> ${(lead.provider_ids || []).join(", ") || "Sin asignación"}</p>
        </div>
      </div>
      <div class="notice">Resumen evaluación: ${lead.evaluation_summary || "No disponible"}</div>
    `;
  }

  async function loadAll() {
    const [leadsData, metricsData] = await Promise.all([
      api("/api/admin/leads"),
      api("/api/admin/metrics"),
    ]);

    leadsCache = leadsData.leads || [];
    renderTable();
    renderMetrics(metricsData);
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
    } catch (error) {
      showAlert(error.message, true);
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
