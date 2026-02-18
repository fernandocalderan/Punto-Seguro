(function leadFormPage() {
  const form = document.getElementById("lead-form");
  const alertNode = document.getElementById("form-alert");
  const summaryNode = document.getElementById("lead-summary");
  const submitButton = form?.querySelector('button[type="submit"]');
  const otpOverlay = document.getElementById("ps-otp-overlay");
  const otpCodeInput = document.getElementById("ps-otp-code");
  const otpConfirmBtn = document.getElementById("ps-otp-confirm");
  const otpResendBtn = document.getElementById("ps-otp-resend");
  const otpCloseBtn = document.getElementById("ps-otp-close");
  const otpErrorNode = document.getElementById("ps-otp-error");
  const otpStatusNode = document.getElementById("ps-otp-status");

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
  let pendingLeadPayload = null;
  let pendingPhoneE164 = "";
  let resendCooldownRemaining = 0;
  let resendCooldownTimer = null;
  let otpBusy = false;

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

  function normalizePhoneE164(value) {
    let phone = String(value || "").trim();
    if (!phone) return "";

    phone = phone.replace(/[\s()-]/g, "");
    if (phone.startsWith("00")) {
      phone = `+${phone.slice(2)}`;
    }

    if (phone.startsWith("+")) {
      const normalized = `+${phone.slice(1).replace(/\D/g, "")}`;
      return /^\+\d{8,15}$/.test(normalized) ? normalized : "";
    }

    const digits = phone.replace(/\D/g, "");
    if (/^\d{9}$/.test(digits)) {
      return `+34${digits}`;
    }
    return /^\d{8,15}$/.test(digits) ? `+${digits}` : "";
  }

  function setSubmitDisabled(disabled) {
    if (!submitButton) return;
    submitButton.disabled = Boolean(disabled);
  }

  function setOtpStatus(message) {
    if (!otpStatusNode) return;
    otpStatusNode.textContent = String(message || "");
  }

  function setOtpError(message) {
    if (!otpErrorNode) return;
    if (!message) {
      otpErrorNode.style.display = "none";
      otpErrorNode.textContent = "";
      return;
    }
    otpErrorNode.style.display = "block";
    otpErrorNode.textContent = String(message);
  }

  function openOtpModal() {
    if (!otpOverlay) return;
    otpOverlay.setAttribute("aria-hidden", "false");
    setOtpError("");
    setOtpStatus("");
    if (otpCodeInput) {
      otpCodeInput.value = "";
      window.setTimeout(() => otpCodeInput.focus(), 0);
    }
  }

  function closeOtpModal() {
    if (!otpOverlay) return;
    otpOverlay.setAttribute("aria-hidden", "true");
    setOtpError("");
    setOtpStatus("");
    if (otpCodeInput) otpCodeInput.value = "";
  }

  function setOtpBusy(isBusy) {
    otpBusy = Boolean(isBusy);
    if (otpConfirmBtn) otpConfirmBtn.disabled = otpBusy;
    if (otpResendBtn) otpResendBtn.disabled = otpBusy || resendCooldownRemaining > 0;
    if (otpCloseBtn) otpCloseBtn.disabled = otpBusy;
    if (otpCodeInput) otpCodeInput.disabled = otpBusy;
  }

  function updateResendButtonLabel() {
    if (!otpResendBtn) return;
    if (resendCooldownRemaining > 0) {
      otpResendBtn.textContent = `Reenviar (${resendCooldownRemaining}s)`;
      otpResendBtn.disabled = true;
      return;
    }
    otpResendBtn.textContent = "Reenviar";
    otpResendBtn.disabled = otpBusy;
  }

  function startResendCooldown(seconds) {
    resendCooldownRemaining = Math.max(0, Number(seconds) || 45);
    window.clearInterval(resendCooldownTimer);
    updateResendButtonLabel();
    resendCooldownTimer = window.setInterval(() => {
      resendCooldownRemaining -= 1;
      if (resendCooldownRemaining <= 0) {
        resendCooldownRemaining = 0;
        window.clearInterval(resendCooldownTimer);
      }
      updateResendButtonLabel();
    }, 1000);
  }

  async function requestOtpStart(phoneE164) {
    const response = await fetch("/api/otp/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phoneE164 }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo enviar el código OTP");
    }
    return data;
  }

  async function requestOtpCheck(phoneE164, code) {
    const response = await fetch("/api/otp/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phoneE164, code }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo validar el código OTP");
    }
    return data;
  }

  async function requestOtpToken(phoneE164) {
    const response = await fetch("/api/otp/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phoneE164 }),
    });
    const data = await response.json();
    if (!response.ok || !data.token) {
      throw new Error(data.error || "No se pudo emitir el token de verificación");
    }
    return data.token;
  }

  async function submitLead(payload) {
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
      return true;
    } catch (error) {
      submitError("request_failed", error.message || "No se pudo enviar la solicitud");
      setSubmitDisabled(false);
      return false;
    }
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

  function cancelOtpFlow() {
    pendingLeadPayload = null;
    pendingPhoneE164 = "";
    closeOtpModal();
    setSubmitDisabled(false);
    setOtpBusy(false);
  }

  otpCodeInput?.addEventListener("input", () => {
    otpCodeInput.value = String(otpCodeInput.value || "").replace(/\D/g, "").slice(0, 6);
    setOtpError("");
  });

  otpCloseBtn?.addEventListener("click", () => {
    cancelOtpFlow();
  });

  otpOverlay?.addEventListener("click", (event) => {
    if (event.target === otpOverlay && !otpBusy) {
      cancelOtpFlow();
    }
  });

  otpResendBtn?.addEventListener("click", async () => {
    if (otpBusy || resendCooldownRemaining > 0 || !pendingPhoneE164) return;
    setOtpBusy(true);
    setOtpError("");
    setOtpStatus("Reenviando código...");
    try {
      await requestOtpStart(pendingPhoneE164);
      setOtpStatus("Código reenviado.");
      startResendCooldown(45);
    } catch (error) {
      setOtpError(error.message || "No se pudo reenviar el código.");
      setOtpStatus("");
    } finally {
      setOtpBusy(false);
      updateResendButtonLabel();
    }
  });

  otpConfirmBtn?.addEventListener("click", async () => {
    if (otpBusy || !pendingLeadPayload || !pendingPhoneE164) return;

    const code = String(otpCodeInput?.value || "").replace(/\D/g, "");
    if (code.length !== 6) {
      setOtpError("Introduce un código válido de 6 dígitos.");
      otpCodeInput?.focus();
      return;
    }

    setOtpBusy(true);
    setOtpError("");
    setOtpStatus("Verificando código...");

    try {
      const check = await requestOtpCheck(pendingPhoneE164, code);
      if (!check.verified) {
        setOtpError("Código incorrecto. Revisa e inténtalo.");
        setOtpStatus("");
        return;
      }

      setOtpStatus("Generando validación segura...");
      const verificationToken = await requestOtpToken(pendingPhoneE164);
      const payloadToSend = {
        ...pendingLeadPayload,
        verificationToken,
      };

      pendingLeadPayload = null;
      pendingPhoneE164 = "";
      closeOtpModal();
      await submitLead(payloadToSend);
    } catch (error) {
      setOtpError(error.message || "No se pudo validar el código.");
      setOtpStatus("");
    } finally {
      setOtpBusy(false);
      updateResendButtonLabel();
    }
  });

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
    const phoneE164 = normalizePhoneE164(phone);
    if (!phoneE164) {
      submitError("invalid_phone", "Indica un teléfono válido con prefijo internacional o móvil español.", "phone");
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
      phone: phoneE164,
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
      setSubmitDisabled(true);
      setOtpBusy(true);
      setOtpStatus("Enviando código...");
      setOtpError("");

      await requestOtpStart(phoneE164);

      pendingLeadPayload = payload;
      pendingPhoneE164 = phoneE164;
      openOtpModal();
      setOtpStatus("Código enviado. Revísalo en tu SMS.");
      startResendCooldown(45);
    } catch (error) {
      submitError("otp_start_failed", error.message || "No se pudo enviar el código OTP");
      pendingLeadPayload = null;
      pendingPhoneE164 = "";
      closeOtpModal();
      setSubmitDisabled(false);
    } finally {
      setOtpBusy(false);
      updateResendButtonLabel();
    }
  });
})();
