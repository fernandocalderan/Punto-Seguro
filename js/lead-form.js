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

  function readEvaluationSummary() {
    try {
      const raw = window.sessionStorage.getItem("puntoSeguro.evaluationSummary");
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
  const storedSummary = readEvaluationSummary() || {};
  const intentPlazo = intent?.inferredPlazo || intent?.plazo || null;

  const intentLabelMap = {
    esta_semana: "Esta semana",
    "15_dias": "7–14 días",
    "30_dias": "30 días",
    "1_3_meses": "1–3 meses",
    informativo: "Solo informativo",
  };
  const humanizePlazo = (plazo) => intentLabelMap[plazo] || plazo;

  const priorityLabel = String(
    storedSummary?.priority?.label || intent?.priority_label || ""
  ).trim();
  const priorityPlazo = String(
    storedSummary?.priority?.plazo || (intentPlazo ? humanizePlazo(intentPlazo) : "")
  ).trim();

  const summaryDrivers = Array.isArray(storedSummary?.drivers) ? storedSummary.drivers.slice(0, 2) : [];
  const summaryFactors = Array.isArray(storedSummary?.top_factors)
    ? storedSummary.top_factors.slice(0, 2)
    : Array.isArray(storedSummary?.factores_top)
      ? storedSummary.factores_top.slice(0, 2)
      : Array.isArray(evaluation?.factores_top)
        ? evaluation.factores_top.slice(0, 2)
        : [];

  const driverText = summaryDrivers
    .map((d) => d?.title || d?.detail)
    .filter(Boolean)
    .join(" · ");
  const factorText = summaryFactors
    .map((f) => f?.texto || f?.text)
    .filter(Boolean)
    .join(" · ");
  const motivos = driverText || factorText || "Sin factores críticos destacados";

  let hasTrackedStarted = false;
  function trackStartedOnce() {
    if (hasTrackedStarted) return;
    hasTrackedStarted = true;

    window.PuntoSeguroAnalytics?.trackEvent("lead_form_started", {
      risk_level: riskLevel,
      iei_level: riskLevel,
      iei_score: riskScore,
      model_version: evaluation.model_version || null,
      tier: evaluation.tier || null,
      dominant_axis: evaluation.dominant_axis || null,
      intent_plazo: intentPlazo,
    });
  }

  const typeSelect = document.getElementById("business_type");
  if (evaluation.tipo_inmueble && ["vivienda", "comercio", "oficina"].includes(evaluation.tipo_inmueble)) {
    typeSelect.value = evaluation.tipo_inmueble;
  }

  const urgencySelect = document.getElementById("urgency");
  if (priorityLabel === "Muy alta" || priorityLabel === "Alta") urgencySelect.value = "alta";
  else if (priorityLabel === "Media") urgencySelect.value = "media";
  else if (priorityLabel === "Baja") urgencySelect.value = "baja";
  else if (riskLevel === "CRÍTICA" || riskLevel === "ELEVADA") urgencySelect.value = "alta";
  else if (riskLevel === "CONTROLADA") urgencySelect.value = "baja";

  const priorityLabelForText = priorityLabel || (riskLevel === "CRÍTICA" ? "Muy alta" : riskLevel === "ELEVADA" ? "Alta" : riskLevel === "MODERADA" ? "Media" : "Baja");
  const plazoForText = priorityPlazo || humanizePlazo(intentPlazo || "informativo");
  summaryNode.textContent = `Prioridad: ${priorityLabelForText} — Plazo recomendado: ${plazoForText}. Motivos principales: ${motivos}. Resultado IEI™: ${riskLevel} (${riskScore}/100).`;

  const evaluationSummary = {
    ...storedSummary,
    model_version: evaluation.model_version || storedSummary.model_version || null,
    risk_score: riskScore,
    risk_level: riskLevel,
    tipo_inmueble: evaluation.tipo_inmueble || storedSummary.tipo_inmueble || null,
    tier: evaluation.tier || storedSummary.tier || null,
    dominant_axis: evaluation.dominant_axis || storedSummary.dominant_axis || null,
    axis_mix: evaluation.axis_mix || storedSummary.axis_mix || null,
    confidence_score: evaluation.confidence_score ?? storedSummary.confidence_score ?? null,
    iei_base: evaluation.iei_base ?? storedSummary.iei_base ?? null,
    iei_raw: evaluation.iei_raw ?? storedSummary.iei_raw ?? null,
    probability_index: evaluation.probability_index ?? storedSummary.probability_index ?? null,
    impact_index: evaluation.impact_index ?? storedSummary.impact_index ?? null,
    synergy_points: evaluation.synergy_points ?? storedSummary.synergy_points ?? null,
    factores_top: Array.isArray(storedSummary.factores_top)
      ? storedSummary.factores_top.slice(0, 3)
      : Array.isArray(evaluation.factores_top)
        ? evaluation.factores_top.slice(0, 3)
        : [],
    top_factors: Array.isArray(storedSummary.top_factors)
      ? storedSummary.top_factors.slice(0, 3)
      : Array.isArray(storedSummary.factores_top)
        ? storedSummary.factores_top.slice(0, 3)
        : Array.isArray(evaluation.factores_top)
          ? evaluation.factores_top.slice(0, 3)
          : [],
    priority: storedSummary.priority || (priorityLabelForText ? { label: priorityLabelForText, plazo: plazoForText, intent: intentPlazo || null } : null),
    drivers: Array.isArray(storedSummary.drivers) ? storedSummary.drivers.slice(0, 3) : [],
    generated_at: evaluation.generated_at || storedSummary.generated_at || null,
  };

  window.sessionStorage.setItem(
    "puntoSeguro.evaluationSummary",
    JSON.stringify({
      ...evaluationSummary,
      summary: summaryNode.textContent,
    })
  );

  window.PuntoSeguroAnalytics?.trackEvent("lead_form_viewed", {
    has_result: true,
    risk_level: riskLevel,
    iei_level: riskLevel,
    iei_score: riskScore,
    model_version: evaluation.model_version || null,
    intent_plazo: intentPlazo,
    tier: evaluation.tier || null,
    dominant_axis: evaluation.dominant_axis || null,
  });

  ["name", "phone", "email", "postal_code"].forEach((id) => {
    const node = document.getElementById(id);
    node?.addEventListener("focus", trackStartedOnce, { once: true });
    node?.addEventListener("input", trackStartedOnce, { once: true });
  });

  function normalizePostalCode(value) {
    return String(value || "").replace(/\D/g, "").trim();
  }

  function submitError(reason, message, focusId) {
    window.PuntoSeguroAnalytics?.trackEvent("lead_submit_error", {
      reason,
      risk_level: riskLevel,
      iei_level: riskLevel,
      iei_score: riskScore,
      model_version: evaluation.model_version || null,
      tier: evaluation.tier || null,
      dominant_axis: evaluation.dominant_axis || null,
      intent_plazo: intentPlazo,
    });

    showAlert(message || "No se pudo enviar la solicitud.", true);
    if (focusId) {
      document.getElementById(focusId)?.focus();
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showAlert("");

    trackStartedOnce();

    const name = document.getElementById("name").value.trim();
    if (!name) {
      submitError("missing_name", "Indica tu nombre y apellidos.", "name");
      return;
    }

    const consent = document.getElementById("consent").checked;
    if (!consent) {
      submitError("missing_consent", "Debes aceptar el consentimiento para continuar.", "consent");
      return;
    }

    const phone = document.getElementById("phone").value.trim();
    if (!phone) {
      submitError("missing_phone", "Indica un teléfono de contacto.", "phone");
      return;
    }

    const postalCode = normalizePostalCode(document.getElementById("postal_code").value);
    if (!postalCode) {
      submitError("missing_postal_code", "Indica tu código postal.", "postal_code");
      return;
    }
    if (!/^\d{5}$/.test(postalCode)) {
      submitError("invalid_postal_code", "El código postal debe tener 5 dígitos.", "postal_code");
      return;
    }

    const emailNode = document.getElementById("email");
    const email = emailNode.value.trim();
    if (!email) {
      submitError("missing_email", "Indica un email de contacto.", "email");
      return;
    }
    if (!emailNode.checkValidity()) {
      submitError("invalid_email", "Revisa el email (formato no válido).", "email");
      return;
    }

    const payload = {
      name,
      email,
      phone,
      city: document.getElementById("city").value.trim(),
      postal_code: postalCode,
      business_type: document.getElementById("business_type").value || "",
      urgency: document.getElementById("urgency").value || "",
      budget_range: document.getElementById("budget_range").value || "",
      notes: document.getElementById("notes").value.trim(),
      risk_level: riskLevel,
      consent: true,
      consent_timestamp: new Date().toISOString(),
      evaluation_summary: evaluationSummary,
      intent_plazo: intentPlazo,
      iei_score: riskScore,
      tier: evaluation.tier || null,
      dominant_axis: evaluation.dominant_axis || null,
      axis_mix: evaluation.axis_mix || null,
      model_version: evaluation.model_version || null,
    };

    window.PuntoSeguroAnalytics?.trackEvent("lead_submit_clicked", {
      risk_level: payload.risk_level,
      iei_level: payload.risk_level,
      iei_score: riskScore,
      model_version: evaluation.model_version || null,
      tier: evaluation.tier || null,
      dominant_axis: evaluation.dominant_axis || null,
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

      window.PuntoSeguroAnalytics?.trackEvent("lead_submit_success", {
        lead_id: data.lead_id,
        risk_level: payload.risk_level,
        iei_level: payload.risk_level,
        iei_score: riskScore,
        model_version: evaluation.model_version || null,
        tier: evaluation.tier || null,
        dominant_axis: evaluation.dominant_axis || null,
        tipo_inmueble: evaluation.tipo_inmueble || payload.business_type || null,
        intent_plazo: payload.intent_plazo,
      });

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
      submitError("request_failed", error.message || "No se pudo enviar la solicitud");
    }
  });
})();
