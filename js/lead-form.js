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

  function readEvaluation() {
    try {
      const raw = window.sessionStorage.getItem("puntoSeguro.latestEvaluation");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }

  function readIntent() {
    try {
      const raw = window.sessionStorage.getItem("puntoSeguro.intent");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }

  const evaluation = readEvaluation();
  if (!evaluation) {
    window.location.href = "/resultado";
    return;
  }

  const riskLevel = String(evaluation.risk_level || "MODERADA").toUpperCase();
  const riskScore = Number(evaluation.risk_score || 0);
  const intent = readIntent();

  const typeSelect = document.getElementById("business_type");
  if (evaluation.tipo_inmueble && ["vivienda", "comercio", "oficina"].includes(evaluation.tipo_inmueble)) {
    typeSelect.value = evaluation.tipo_inmueble;
  }

  const urgencySelect = document.getElementById("urgency");
  if (riskLevel === "CRÍTICA" || riskLevel === "ELEVADA") urgencySelect.value = "alta";
  if (riskLevel === "CONTROLADA") urgencySelect.value = "baja";

  const intentLabelMap = {
    esta_semana: "Esta semana",
    "1_3_meses": "1–3 meses",
    informativo: "Solo informativo",
  };
  const intentLabel = intent?.plazo ? intentLabelMap[intent.plazo] || intent.plazo : "No indicado";

  summaryNode.textContent = `Exposición orientativa (IEI™): ${riskLevel} (${riskScore}/100). Plazo declarado: ${intentLabel}. Este resumen se adjuntará a la solicitud.`;

  const evaluationSummary = {
    risk_score: riskScore,
    risk_level: riskLevel,
    tipo_inmueble: evaluation.tipo_inmueble || null,
    factores_top: Array.isArray(evaluation.factores_top) ? evaluation.factores_top.slice(0, 3) : [],
    generated_at: evaluation.generated_at || null,
  };

  window.sessionStorage.setItem(
    "puntoSeguro.evaluationSummary",
    JSON.stringify({
      ...evaluationSummary,
      summary: evaluationSummary.factores_top.map((factor) => factor.texto).join(" | "),
    })
  );

  window.PuntoSeguroAnalytics?.trackEvent("lead_form_viewed", {
    has_result: true,
    risk_level: riskLevel,
    iei_level: riskLevel,
    iei_score: riskScore,
    model_version: evaluation.model_version || null,
    intent_plazo: intent?.plazo || null,
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
      risk_level: riskLevel,
      consent: true,
      consent_timestamp: new Date().toISOString(),
      evaluation_summary: evaluationSummary,
      intent_plazo: intent?.plazo || null,
    };

    window.PuntoSeguroAnalytics?.trackEvent("lead_submit_clicked", {
      risk_level: payload.risk_level,
      iei_level: payload.risk_level,
      iei_score: riskScore,
      model_version: evaluation.model_version || null,
      intent_plazo: payload.intent_plazo,
    });

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
          intent_plazo: payload.intent_plazo,
        })
      );

      window.location.href = `/confirmacion?lead=${encodeURIComponent(data.lead_id)}`;
    } catch (error) {
      showAlert(error.message, true);
    }
  });
})();
