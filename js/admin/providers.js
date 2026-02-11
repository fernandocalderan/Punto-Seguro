(function adminProviders() {
  const tableBody = document.querySelector("#providers-table tbody");
  const form = document.getElementById("provider-form");
  const alertNode = document.getElementById("provider-alert");

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

  function clearForm() {
    form.reset();
    fields.id.value = "";
    fields.priority.value = "100";
    fields.dailyCap.value = "10";
    fields.active.checked = true;
  }

  function fillForm(provider) {
    fields.id.value = provider.id;
    fields.name.value = provider.name;
    fields.email.value = provider.email;
    fields.phone.value = provider.phone || "";
    fields.zones.value = (provider.zones || []).join(", ");
    fields.types.value = (provider.business_types || []).join(", ");
    fields.priority.value = provider.priority;
    fields.dailyCap.value = provider.daily_cap;
    fields.active.checked = Boolean(provider.active);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderTable() {
    if (providersCache.length === 0) {
      tableBody.innerHTML = "<tr><td colspan=\"7\">No hay proveedores cargados.</td></tr>";
      return;
    }

    tableBody.innerHTML = providersCache
      .map((provider) => {
        const status = provider.active ? "Activo" : "Inactivo";
        const lastAssigned = provider.last_assigned_at
          ? new Date(provider.last_assigned_at).toLocaleString("es-ES")
          : "Nunca";

        return `
          <tr>
            <td>${provider.name}<br><span class="muted">${provider.email}</span></td>
            <td>${(provider.zones || []).join(", ") || "Todas"}</td>
            <td>${(provider.business_types || []).join(", ") || "Todos"}</td>
            <td>${provider.daily_cap}</td>
            <td>${lastAssigned}</td>
            <td>${status}</td>
            <td><button type="button" class="btn btn-secondary" data-edit="${provider.id}" style="min-height:34px;padding:0.3rem 0.7rem;">Editar</button></td>
          </tr>
        `;
      })
      .join("");
  }

  async function loadProviders() {
    const data = await api("/api/admin/providers");
    providersCache = data.providers || [];
    renderTable();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showAlert("");

    const payload = {
      name: fields.name.value.trim(),
      email: fields.email.value.trim(),
      phone: fields.phone.value.trim(),
      zones: fields.zones.value,
      business_types: fields.types.value,
      active: fields.active.checked,
      priority: Number(fields.priority.value),
      daily_cap: Number(fields.dailyCap.value),
    };

    try {
      if (fields.id.value) {
        await api(`/api/admin/providers/${fields.id.value}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/admin/providers", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      }

      showAlert("Proveedor guardado.");
      clearForm();
      await loadProviders();
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  tableBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit]");
    if (!button) return;

    const provider = providersCache.find((item) => item.id === button.dataset.edit);
    if (!provider) return;
    fillForm(provider);
  });

  document.getElementById("provider-reset").addEventListener("click", clearForm);

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  });

  loadProviders().catch((error) => {
    showAlert(error.message, true);
  });
})();
