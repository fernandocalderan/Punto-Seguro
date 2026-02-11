(function leadFormPage() {
  const form = document.getElementById("lead-form");
  const alertNode = document.getElementById("form-alert");
  const summaryNode = document.getElementById("lead-summary");

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

  function readSummary() {
    try {
      const raw = window.sessionStorage.getItem("puntoSeguro.evaluationSummary");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }

  const summary = readSummary();
  if (summary) {
    summaryNode.textContent = `Riesgo orientativo: ${summary.risk_level} (${summary.risk_score}/100). Este dato se adjuntará a la solicitud.`;
    const typeSelect = document.getElementById("business_type");
    if (summary.tipo_inmueble && ["vivienda", "comercio", "oficina"].includes(summary.tipo_inmueble)) {
      typeSelect.value = summary.tipo_inmueble;
    }
  } else {
    summaryNode.textContent = "No se encontró un resultado previo. Puedes enviar la solicitud igualmente con nivel de riesgo orientativo medio.";
  }

  window.PuntoSeguroAnalytics?.trackEvent("lead_form_viewed", {
    has_result: Boolean(summary),
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showAlert("");

    if (!form.reportValidity()) return;

    const consent = document.getElementById("consent").checked;
    if (!consent) {
      showAlert("Debes aceptar el consentimiento para continuar.", true);
      return;
    }

    const payload = {
      name: document.getElementById("name").value.trim(),
      email: document.getElementById("email").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      city: document.getElementById("city").value.trim(),
      postal_code: document.getElementById("postal_code").value.trim(),
      business_type: document.getElementById("business_type").value,
      urgency: document.getElementById("urgency").value,
      budget_range: document.getElementById("budget_range").value,
      notes: document.getElementById("notes").value.trim(),
      risk_level: summary?.risk_level || "MEDIO",
      consent: true,
      consent_timestamp: new Date().toISOString(),
      evaluation_summary: summary?.summary || "Sin resumen específico",
    };

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "No se pudo enviar la solicitud");
      }

      window.sessionStorage.setItem(
        "puntoSeguro.lastLead",
        JSON.stringify({
          lead_id: data.lead_id,
          provider_count: data.provider_count,
          city: payload.city,
          risk_level: payload.risk_level,
        })
      );

      window.PuntoSeguroAnalytics?.trackEvent("lead_submitted", {
        lead_id: data.lead_id,
        provider_count: data.provider_count,
      });

      window.location.href = `/confirmacion?lead=${encodeURIComponent(data.lead_id)}`;
    } catch (error) {
      showAlert(error.message, true);
    }
  });
})();
