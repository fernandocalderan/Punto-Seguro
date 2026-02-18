(function adminProviders() {
  const tableBody = document.querySelector("#providers-table tbody");
  const form = document.getElementById("provider-form");
  const alertNode = document.getElementById("provider-alert");
  const relatedSection = document.getElementById("provider-related-section");
  const relatedTitle = document.getElementById("provider-related-title");
  const relatedMeta = document.getElementById("provider-related-meta");
  const relatedTableBody = document.querySelector("#provider-related-table tbody");
  const newButton = document.getElementById("provider-new-btn");
  const modal = document.getElementById("provider-modal");
  const modalTitle = document.getElementById("provider-modal-title");
  const modalCloseButton = document.getElementById("provider-modal-close");
  const modalBackdrop = modal?.querySelector("[data-close-provider-modal]");

  const fields = {
    id: document.getElementById("provider-id"),
    name: document.getElementById("provider-name"),
    email: document.getElementById("provider-email"),
    phone: document.getElementById("provider-phone"),
    zones: document.getElementById("provider-zones"),
    types: document.getElementById("provider-types"),
    priority: document.getElementById("provider-priority"),
    dailyCap: document.getElementById("provider-daily-cap"),
    active: document.getElementById("provider-active"),
  };

  let providersCache = [];
  const deepLinkProviderId = new URLSearchParams(window.location.search).get("id");
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

  function clearForm() {
    form.reset();
    fields.id.value = "";
    fields.priority.value = "50";
    fields.dailyCap.value = "999";
    fields.active.checked = true;
  }

  function openModal(title) {
    if (modalTitle) modalTitle.textContent = title;
    if (modal) modal.hidden = false;
  }

  function closeModal() {
    if (modal) modal.hidden = true;
  }

  function fillForm(provider) {
    fields.id.value = provider.id;
    fields.name.value = provider.name || "";
    fields.email.value = provider.email || "";
    fields.phone.value = provider.phone || "";
    fields.zones.value = (provider.zones || []).join(", ");
    fields.types.value = (provider.business_types || []).join(", ");
    fields.priority.value = String(provider.priority ?? 50);
    fields.dailyCap.value = String(provider.daily_cap ?? 999);
    fields.active.checked = Boolean(provider.active);
  }

  function providerRoleInLead(providerId, lead) {
    const providerIds = Array.isArray(lead?.provider_ids)
      ? lead.provider_ids.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    const assigned = String(lead?.assigned_provider_id || "").trim();
    const explicitPrimary = String(lead?.provider_primary_id || "").trim();
    const explicitSecondary = String(lead?.provider_secondary_id || "").trim();
    const primary = providerIds[0] || assigned || explicitPrimary || null;
    const secondary = providerIds[1] || explicitSecondary || null;
    if (providerId === primary) return "Principal";
    if (providerId === secondary) return "Secundario";
    return "Relacionado";
  }

  function renderTable() {
    if (!Array.isArray(providersCache) || providersCache.length === 0) {
      tableBody.innerHTML = "<tr><td colspan=\"8\">No hay proveedores cargados.</td></tr>";
      return;
    }

    tableBody.innerHTML = providersCache
      .map((provider) => {
        const status = provider.active ? "Activo" : "Inactivo";
        const lastAssigned = provider.last_assigned_at
          ? new Date(provider.last_assigned_at).toLocaleString("es-ES")
          : "Nunca";
        const nextActive = provider.active ? "false" : "true";

        return `
          <tr>
            <td>${escapeHtml(provider.name)}<br><span class="muted">${escapeHtml(provider.email || "-")}</span></td>
            <td>${escapeHtml((provider.zones || []).join(", ") || "Todas")}</td>
            <td>${escapeHtml((provider.business_types || []).join(", ") || "Todos")}</td>
            <td>${escapeHtml(String(provider.priority ?? "-"))}</td>
            <td>${escapeHtml(String(provider.daily_cap ?? "-"))}</td>
            <td>${escapeHtml(lastAssigned)}</td>
            <td>${escapeHtml(status)}</td>
            <td>
              <button type="button" class="btn btn-secondary btn-compact" data-edit="${escapeHtml(provider.id)}">Editar</button>
              <button type="button" class="btn btn-secondary btn-compact" data-toggle="${escapeHtml(provider.id)}" data-next-active="${nextActive}">
                ${provider.active ? "Desactivar" : "Activar"}
              </button>
              <button type="button" class="btn btn-secondary btn-compact" data-leads="${escapeHtml(provider.id)}">Leads</button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  async function loadProviders() {
    const data = await api("/api/admin/providers");
    providersCache = Array.isArray(data.providers) ? data.providers : [];
    renderTable();

    if (deepLinkProviderId && !deepLinkHandled) {
      deepLinkHandled = true;
      await openProviderDetail(deepLinkProviderId);
    }
  }

  async function loadLeadsForProvider(providerId) {
    const data = await api(`/api/admin/providers/${encodeURIComponent(providerId)}/leads`);
    const provider = data.provider;
    const leads = Array.isArray(data.leads) ? data.leads : [];

    relatedSection.style.display = "grid";
    relatedTitle.textContent = `Leads asociados · ${provider.name || provider.id}`;
    relatedMeta.textContent = `Total asociados: ${leads.length}`;

    if (leads.length === 0) {
      relatedTableBody.innerHTML = "<tr><td colspan=\"7\">No hay leads asociados.</td></tr>";
      return;
    }

    relatedTableBody.innerHTML = leads.slice(0, 50).map((lead) => `
      <tr>
        <td>${lead.created_at ? new Date(lead.created_at).toLocaleString("es-ES") : "-"}</td>
        <td>${escapeHtml(lead.name || "-")}</td>
        <td>${escapeHtml(lead.status || "-")}</td>
        <td>${escapeHtml(lead.risk_level || "-")}</td>
        <td>${escapeHtml(String(lead.ticket_estimated_eur ?? "-"))}</td>
        <td>${providerRoleInLead(providerId, lead)}</td>
        <td><a href="/admin/leads?lead=${encodeURIComponent(lead.id)}">Ver lead</a></td>
      </tr>
    `).join("");
  }

  async function openProviderDetail(providerId) {
    const provider = providersCache.find((item) => item.id === providerId);
    if (!provider) {
      showAlert("Proveedor no encontrado.", true);
      return;
    }

    fillForm(provider);
    openModal("Editar proveedor");
    await loadLeadsForProvider(providerId);
  }

  function buildPayload() {
    return {
      name: fields.name.value.trim(),
      email: fields.email.value.trim(),
      phone: fields.phone.value.trim(),
      zones: fields.zones.value,
      business_types: fields.types.value,
      active: fields.active.checked,
      priority: Number(fields.priority.value),
      daily_cap: Number(fields.dailyCap.value),
    };
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showAlert("");

    const payload = buildPayload();
    try {
      if (fields.id.value) {
        await api(`/api/admin/providers/${encodeURIComponent(fields.id.value)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/admin/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      showAlert("Proveedor guardado.");
      closeModal();
      clearForm();
      await loadProviders();
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  tableBody.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit]");
    if (editButton) {
      const providerId = String(editButton.dataset.edit || "").trim();
      if (!providerId) return;
      try {
        await openProviderDetail(providerId);
      } catch (error) {
        showAlert(error.message, true);
      }
      return;
    }

    const toggleButton = event.target.closest("[data-toggle]");
    if (toggleButton) {
      const providerId = String(toggleButton.dataset.toggle || "").trim();
      const nextActive = String(toggleButton.dataset.nextActive || "").trim() === "true";
      if (!providerId) return;

      try {
        await api(`/api/admin/providers/${encodeURIComponent(providerId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: nextActive }),
        });
        await loadProviders();
      } catch (error) {
        showAlert(error.message, true);
      }
      return;
    }

    const leadsButton = event.target.closest("[data-leads]");
    if (leadsButton) {
      const providerId = String(leadsButton.dataset.leads || "").trim();
      if (!providerId) return;

      try {
        await loadLeadsForProvider(providerId);
      } catch (error) {
        showAlert(error.message, true);
      }
    }
  });

  newButton?.addEventListener("click", () => {
    clearForm();
    openModal("Nuevo proveedor");
  });

  document.getElementById("provider-reset")?.addEventListener("click", () => {
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

  loadProviders().catch((error) => {
    showAlert(error.message, true);
  });
}());
