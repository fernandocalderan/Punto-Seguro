(function resultadoPage() {
  function readEvaluation() {
    const raw = window.sessionStorage.getItem("puntoSeguro.latestEvaluation");
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }

  function badgeClass(level) {
    if (level === "CONTROLADA") return "badge badge-low";
    if (level === "MODERADA") return "badge badge-medium";
    if (level === "ELEVADA") return "badge badge-high";
    if (level === "CRÍTICA") return "badge badge-high";
    return "badge";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function axisLabel(axis) {
    const m = { V: "vulnerabilidad estructural", O: "oportunidad operativa", A: "atractivo objetivo" };
    return m[axis] || "";
  }

  function normalizeText(s) {
    return String(s || "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  }

  function clamp01(x){ return Math.max(0, Math.min(1, x)); }

  function computeActivationFactor(meta){
    const p = Number(meta?.probabilityIndex || 0) / 100;
    const i = Number(meta?.impactIndex || 0) / 100;
    const s = Number(meta?.synergyPoints || 0) / 10; // escala moderada
    const c = Number(meta?.confidenceScore || 70) / 100;

    const exposure = clamp01(0.5*p + 0.3*i + 0.2*s);
    const adjusted = clamp01(exposure * (0.85 + 0.15*c));

    return adjusted;
  }

  function computeUrgencyScore(baseScore, FA){
    const boost = baseScore * (1 + 0.30*FA);
    return Math.round(Math.max(0, Math.min(100, boost)));
  }

  function urgencyLabel(score){
    if(score >= 75) return "MUY ALTA";
    if(score >= 55) return "ALTA";
    if(score >= 35) return "MEDIA";
    return "BAJA";
  }

  function urgencyText(label){
    const map = {
      "MUY ALTA": "La exposición operativa es elevada en escenarios habituales. Recomendable priorizar actuación inmediata.",
      "ALTA": "La exposición operativa es relevante. Actuar en el corto plazo reduce probabilidad acumulada.",
      "MEDIA": "Exposición operativa moderada. Ajustes técnicos por fases suelen reducir riesgo.",
      "BAJA": "Exposición operativa contenida. Mantener revisión periódica."
    };
    return map[label] || "";
  }

  function getTopFactors(evaluation, limit = 5) {
    const factors = evaluation?.factores_top || evaluation?.factors_top || [];
    if (!Array.isArray(factors)) return [];
    return factors
      .slice()
      .sort((a, b) => (Number(b?.puntos || 0) - Number(a?.puntos || 0)))
      .slice(0, limit);
  }

  function shortFactorText(txt) {
    const s = String(txt || "").trim();
    if (!s) return "";
    return s.length > 60 ? s.slice(0, 57) + "..." : s;
  }

  function closingRecommendation(level, axis, topFactorText) {
    const ax = axisLabel(axis);
    const f = shortFactorText(topFactorText);

    const base =
      ax || f
        ? `En este resultado, el punto más sensible está ligado a ${ax || "tu perfil"}${f ? ` (factor: ${f})` : ""}.`
        : `En este resultado, conviene abordar la mejora por fases según tu perfil.`;

    const byLevel = {
      CONTROLADA:
        "Con pequeños ajustes y mantenimiento, el nivel suele mantenerse estable sin sobredimensionar medidas.",
      MODERADA:
        "Un ajuste preventivo y progresivo suele ser suficiente para reducir exposición sin cambios drásticos.",
      ELEVADA:
        "Un enfoque por capas (accesos + detección + respuesta) suele reducir exposición de forma clara y ordenada.",
      CRÍTICA:
        "Suele abordarse con prioridad técnica por capas (accesos, detección y respuesta) para reducir exposición cuanto antes."
    };

    const tail = byLevel[String(level || "").toUpperCase()] || "Un enfoque por fases suele ser el camino más eficiente.";
    return `${base} ${tail}`;
  }

  function pickMeaningfulTopFactor(topFactors) {
    for (const f of topFactors || []) {
      const t = normalizeText(f?.texto || f?.text || "");
      if (t && !t.startsWith("tipo de")) return (f?.texto || f?.text || "").trim();
    }
    return (topFactors?.[0]?.texto || topFactors?.[0]?.text || "").trim();
  }

  // Reglas deterministas: 1 factor => 1 paso candidato (frase autónoma neutra)
  const RULES = [
    {
      id: "no_alarm",
      priority: 100,
      appliesTo: "any",
      match: ["sin sistema de alarma", "sin alarma", "no tiene alarma"],
      step: () =>
        "La ausencia de detección temprana y verificación incrementa la oportunidad operativa en escenarios de intrusión."
    },
    {
      id: "no_cameras",
      priority: 80,
      appliesTo: "any",
      match: ["sin camaras", "sin cámaras", "sin videovigilancia", "no hay camaras", "no hay cámaras"],
      step: () =>
        "La verificación visual en accesos y puntos ciegos mejora la capacidad de confirmar eventos y reduce incertidumbre operativa."
    },
    {
      id: "windows_unprotected",
      priority: 90,
      appliesTo: "vivienda",
      match: ["ventanas sin proteccion", "ventanas sin protección", "ventanas expuestas", "ventanas"],
      step: () =>
        "Las ventanas expuestas suelen concentrar vulnerabilidad estructural; reforzarlas reduce el punto de entrada más frecuente."
    },
    {
      id: "ground_floor",
      priority: 70,
      appliesTo: "vivienda",
      match: ["piso bajo", "planta baja", "bajo"],
      step: () =>
        "Los inmuebles a ras de calle suelen requerir especial atención en accesos y perímetro por facilidad de aproximación."
    },
    {
      id: "street_level_shop",
      priority: 90,
      appliesTo: "comercio",
      match: ["local a pie de calle", "pie de calle", "fachada expuesta"],
      step: () =>
        "La exposición directa a vía pública aumenta observación y oportunidad; disuasión visible y control de accesos suelen aportar mejora."
    },
    {
      id: "shutter",
      priority: 85,
      appliesTo: "comercio",
      match: ["persiana microperforada", "persiana", "cierre enrollable", "cierre"],
      step: () =>
        "Determinados tipos de cierre pueden generar puntos de palanca si no se combinan con detección y refuerzo en guías/bloqueo."
    },
    {
      id: "attractive_stock",
      priority: 80,
      appliesTo: "comercio",
      match: ["stock atractivo", "stock", "alimentación", "electronica", "electrónica", "joyeria", "joyería"],
      step: () =>
        "La visibilidad de stock o valor incrementa el atractivo objetivo; reducir exposición y reforzar rutinas de cierre suele disminuir riesgo percibido."
    },
    {
      id: "blind_spots_lighting",
      priority: 65,
      appliesTo: "any",
      match: ["iluminacion", "iluminación", "puntos ciegos", "punto ciego", "visibilidad"],
      step: () =>
        "Eliminar puntos ciegos (iluminación y líneas de visión) mejora vigilancia natural y reduce oportunidades de aproximación."
    },
    {
      id: "predictable_absence",
      priority: 75,
      appliesTo: "any",
      match: ["ausencia", "muchas horas vacio", "muchas horas vacío", "rutina previsible", "previsible"],
      step: () =>
        "La previsibilidad operativa incrementa la oportunidad en franjas sin presencia; romper patrones suele reducir exposición."
    }
  ];

  function buildPlanFromFactors(evaluation) {
    const level = evaluation?.risk_level || "";
    const axis = evaluation?.dominant_axis || "";
    const tipo = normalizeText(evaluation?.tipo_inmueble || evaluation?.business_type || "");

    const topFactors = getTopFactors(evaluation, 5);
    const top1Text = pickMeaningfulTopFactor(topFactors);

    // generar candidatos: por cada factor, intentar casar reglas
    const candidates = [];
    for (const f of topFactors) {
      const t = normalizeText(f?.texto || f?.text || "");
      const pts = Number(f?.puntos || 0);

      for (const r of RULES) {
        if (r.appliesTo !== "any") {
          if (r.appliesTo === "comercio" && !tipo.includes("comercio")) continue;
          if (r.appliesTo === "vivienda" && !tipo.includes("vivienda")) continue;
        }
        if (r.match.some(k => t.includes(normalizeText(k)))) {
          candidates.push({
            text: r.step(tipo),
            priority: r.priority,
            puntos: pts
          });
        }
      }
    }

    // dedupe por texto
    const deduped = [];
    const seen = new Set();
    for (const c of candidates.sort((a, b) => (b.priority - a.priority) || (b.puntos - a.puntos))) {
      const key = normalizeText(c.text);
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(c);
      }
    }

    // fallback si faltan pasos
    const lvl = String(level || "").toUpperCase();

    const fallbackByLevel = {
      CONTROLADA: [
        "Revisar accesos y cerramientos puede eliminar puntos ciegos habituales.",
        "Mejorar protocolo de aviso aporta estabilidad operativa.",
        "Disuasión visible ayuda a mantener el nivel actual."
      ],
      MODERADA: [
        "Revisar accesos y cerramientos reduce vulnerabilidad estructural detectada.",
        "Mejorar detección temprana incrementa capacidad de respuesta.",
        "Reducir puntos ciegos disminuye oportunidad operativa."
      ],
      ELEVADA: [
        "Reforzar accesos expuestos reduce el punto de entrada más probable según el perfil detectado.",
        "Incorporar detección con verificación mejora reacción ante evento.",
        "Reducir exposición visible y puntos ciegos limita oportunidad en franjas sin presencia."
      ],
      CRÍTICA: [
        "Reforzar accesos expuestos es clave para reducir el punto de entrada más probable en este perfil.",
        "Incorporar detección con verificación y protocolo claro es determinante en este nivel.",
        "Reducir puntos ciegos y aumentar disuasión visible limita aproximación en escenarios sin presencia."
      ]
    };

    const fallback = fallbackByLevel[lvl] || fallbackByLevel.MODERADA;

    const steps = deduped.slice(0, 3).map(x => x.text);
    while (steps.length < 3) steps.push(fallback[steps.length]);

    return {
      title: "Qué hacer ahora (plan en 3 pasos)",
      steps,
      closing: closingRecommendation(level, axis, top1Text)
    };
  }

  function explanation(level, meta) {
    const {
      probabilityIndex,
      impactIndex,
      synergyPoints,
      modelVersion,
      axisMix,
      dominantAxisCode,
      tier,
      confidenceScore,
      ieiBase,
      ieiRaw,
    } = meta || {};

    let base = "";
    if (level === "CRÍTICA") {
      base = "Exposición crítica: conviene contrastar con prioridad capas de detección, tiempos de respuesta y puntos de acceso.";
    } else if (level === "ELEVADA") {
      base = "Exposición elevada: hay varios puntos de mejora y conviene priorizar medidas por fases para reducir exposición.";
    } else if (level === "MODERADA") {
      base = "Exposición moderada: hay puntos mejorables para reducir previsibilidad y oportunidad de intrusión.";
    } else {
      base = "Exposición controlada: mantener revisión periódica ayuda a conservar este nivel.";
    }

    const parts = [
      base,
      modelVersion ? "Modelo: IEI™" : null,
      Number.isFinite(Number(probabilityIndex)) ? `Probabilidad: ${Number(probabilityIndex)}/100` : null,
      Number.isFinite(Number(impactIndex)) ? `Impacto: ${Number(impactIndex)}/100` : null,
      Number.isFinite(Number(synergyPoints)) && Number(synergyPoints) > 0 ? `Sinergia: +${Number(synergyPoints)}` : null,
      modelVersion === "IEI-3.0" && Number.isFinite(Number(ieiBase)) ? `Base: ${Number(ieiBase)}` : null,
      modelVersion === "IEI-3.0" && Number.isFinite(Number(ieiRaw)) ? `Raw: ${Number(ieiRaw)}` : null,
      modelVersion === "IEI-3.0" && axisMix && Number.isFinite(Number(axisMix.Vn)) && Number.isFinite(Number(axisMix.On)) && Number.isFinite(Number(axisMix.An))
        ? `Mix V/O/A: ${Number(axisMix.Vn)}/${Number(axisMix.On)}/${Number(axisMix.An)}`
        : null,
      modelVersion === "IEI-3.0" && axisLabel(dominantAxisCode) ? `Eje: ${axisLabel(dominantAxisCode)}` : null,
      modelVersion === "IEI-3.0" && tier ? `Tier: ${tier}` : null,
      modelVersion === "IEI-3.0" && Number.isFinite(Number(confidenceScore)) ? `Confianza: ${Number(confidenceScore)}/100` : null,
    ].filter(Boolean);

    return parts.join(" · ");
  }

  function humanTranslation(level, meta) {
    const { probabilityIndex, impactIndex, synergyPoints, dominantAxisCode, tier } = meta || {};

    let base = "";
    if (level === "CRÍTICA") {
      base = "El patrón se acerca a escenarios típicos de intrusión cuando el inmueble queda sin presencia.";
    } else if (level === "ELEVADA") {
      base = "Hay varios puntos de exposición que conviene revisar con criterio técnico para reducir exposición.";
    } else if (level === "MODERADA") {
      base = "Se aprecian puntos mejorables habituales. Revisarlos suele reducir oportunidad sin grandes cambios.";
    } else {
      base = "No se detecta exposición relevante actualmente, aunque conviene mantener revisión periódica.";
    }

    const details = [];
    if (Number.isFinite(Number(probabilityIndex))) details.push(`probabilidad ${Number(probabilityIndex)}/100`);
    if (Number.isFinite(Number(impactIndex))) details.push(`impacto ${Number(impactIndex)}/100`);
    if (Number.isFinite(Number(synergyPoints)) && Number(synergyPoints) > 0) details.push(`sinergia +${Number(synergyPoints)}`);

    const axis = axisLabel(dominantAxisCode);
    const summary = details.length ? `${base} (${details.join(", ")}).` : base;
    const axisLine = axis ? ` Eje dominante: ${axis}.` : "";
    const tierLine = tier ? ` Tier: ${tier}.` : "";

    return `${summary}${axisLine}${tierLine}`;
  }

  const evaluation = readEvaluation();
  if (!evaluation) {
    // Keep default empty state copy rendered by the HTML.
    window.PuntoSeguroAnalytics?.trackEvent("result_viewed", { has_result: false });
    return;
  }

  const score = Number(evaluation.risk_score || 0);
  const level = String(evaluation.risk_level || "MODERADA").toUpperCase();
  const tipoInmueble = String(evaluation.tipo_inmueble || "").trim();
  const probabilityIndex = Number(evaluation.probability_index);
  const impactIndex = Number(evaluation.impact_index);
  const synergyPoints = Number(evaluation.synergy_points || 0);
  const modelVersion = String(evaluation.model_version || "").trim();
  const dominantAxisCode = String(evaluation.dominant_axis || "").trim().toUpperCase();
  const tier = String(evaluation.tier || "").trim();
  const confidence = Number(evaluation.confidence_score);
  const ieiBase = Number(evaluation.iei_base);
  const ieiRaw = Number(evaluation.iei_raw);
  const FA = computeActivationFactor({
    probabilityIndex,
    impactIndex,
    synergyPoints,
    confidenceScore: confidence
  });

  const urgencyScore = computeUrgencyScore(score, FA);
  const urgencyLvl = urgencyLabel(urgencyScore);

  const axisMix = evaluation.axis_mix && typeof evaluation.axis_mix === "object"
    ? {
        Vn: Number(evaluation.axis_mix.Vn),
        On: Number(evaluation.axis_mix.On),
        An: Number(evaluation.axis_mix.An),
      }
    : null;

  const scoreNode = document.getElementById("risk-score");
  const levelNode = document.getElementById("risk-level-badge");
  const explanationNode = document.getElementById("risk-explanation");
  const recommendationsNode = document.getElementById("recommendations-list");
  const topFactorsNode = document.getElementById("top-factors-list");
  const humanTextNode = document.getElementById("risk-human-text");
  const ctaRequestNode = document.getElementById("cta-request");
  const ctaKeepNode = document.getElementById("cta-keep");
  const decisionFeedbackNode = document.getElementById("decision-feedback");
  const barFillNode = document.getElementById("iei-bar-fill");

  scoreNode.textContent = `${score} / 100`;
  levelNode.textContent = level;
  levelNode.className = badgeClass(level);
  explanationNode.textContent = explanation(level, {
    probabilityIndex,
    impactIndex,
    synergyPoints,
    modelVersion,
    axisMix,
    dominantAxisCode,
    tier,
    confidenceScore: confidence,
    ieiBase,
    ieiRaw,
  });
  humanTextNode.textContent = humanTranslation(level, {
    probabilityIndex,
    impactIndex,
    synergyPoints,
    dominantAxisCode,
    tier,
  });

  let urgencyContainer = document.getElementById("operational-exposure");

  if(!urgencyContainer){
    urgencyContainer = document.createElement("div");
    urgencyContainer.id = "operational-exposure";
    urgencyContainer.className = "operational-exposure-block";
    humanTextNode.parentNode.insertBefore(urgencyContainer, humanTextNode.nextSibling);
  }

  urgencyContainer.innerHTML = `
    <div class="urgency-title">Exposición operativa</div>
    <div class="urgency-score">${urgencyScore} / 100</div>
    <div class="urgency-label urgency-${urgencyLvl.toLowerCase()}">${urgencyLvl}</div>
    <div class="urgency-text">${urgencyText(urgencyLvl)}</div>
  `;

  if (barFillNode) {
    const pct = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
    // Allow CSS transition from 0% to value.
    barFillNode.style.width = "0%";
    window.requestAnimationFrame(() => {
      barFillNode.style.width = `${pct}%`;
    });
  }

  const factorsTop = getTopFactors(evaluation, 3);

  const plan = buildPlanFromFactors(evaluation);
  recommendationsNode.innerHTML = `
    ${(plan.steps || []).map((step, i) => `
      <div class="step-card">
        <div class="step-n">${i + 1}</div>
        <div class="step-txt">${escapeHtml(step)}</div>
      </div>
    `).join("")}
    <div class="plan-closing">${escapeHtml(plan.closing)}</div>
  `.trim();

  topFactorsNode.innerHTML = factorsTop.length > 0
    ? factorsTop.map((factor) => `<span class="chip">${factor.texto || factor.text || "Factor de exposición detectado"}</span>`).join("")
    : "<span class=\"chip\">Sin factores destacados en esta simulación.</span>";

  const resumen = factorsTop
    .map((factor) => factor?.texto || factor?.text)
    .filter(Boolean)
    .slice(0, 3)
    .join(" | ");

  window.sessionStorage.setItem(
    "puntoSeguro.evaluationSummary",
    JSON.stringify({
      risk_level: level,
      risk_score: score,
      model_version: modelVersion || null,
      probability_index: Number.isFinite(probabilityIndex) ? probabilityIndex : null,
      impact_index: Number.isFinite(impactIndex) ? impactIndex : null,
      synergy_points: Number.isFinite(synergyPoints) ? synergyPoints : null,
      axis_mix: axisMix && Number.isFinite(axisMix.Vn) && Number.isFinite(axisMix.On) && Number.isFinite(axisMix.An)
        ? axisMix
        : null,
      dominant_axis: dominantAxisCode || null,
      tier: tier || null,
      confidence_score: Number.isFinite(confidence) ? confidence : null,
      iei_base: Number.isFinite(ieiBase) ? ieiBase : null,
      iei_raw: Number.isFinite(ieiRaw) ? ieiRaw : null,
      summary: resumen,
      tipo_inmueble: tipoInmueble || null,
      factores_top: factorsTop,
      generated_at: evaluation.generated_at || new Date().toISOString(),
    })
  );

  window.PuntoSeguroAnalytics?.trackEvent("result_viewed", {
    has_result: true,
    risk_level: level,
    risk_score: score,
    iei_level: level,
    iei_score: score,
    model_version: modelVersion || null,
    tier: tier || null,
    dominant_axis: dominantAxisCode || null,
  });

  ctaRequestNode?.addEventListener("click", () => {
    const inferredPlazo =
      urgencyLvl === "MUY ALTA" ? "esta_semana" :
      urgencyLvl === "ALTA" ? "15_dias" :
      urgencyLvl === "MEDIA" ? "1_3_meses" :
      "informativo";

    window.sessionStorage.setItem(
      "puntoSeguro.intent",
      JSON.stringify({
        plazo: inferredPlazo,
        source: "inferred",
        selected_at: new Date().toISOString(),
      })
    );

    window.PuntoSeguroAnalytics?.trackEvent("cta_proposals_click", {
      plazo: inferredPlazo,
      risk_level: level,
      risk_score: score,
      iei_level: level,
      iei_score: score,
      model_version: modelVersion || null,
      tier: tier || null,
      dominant_axis: dominantAxisCode || null,
    });

    window.location.href = "/solicitar-propuesta";
  });

  ctaKeepNode?.addEventListener("click", () => {
    if (decisionFeedbackNode) {
      decisionFeedbackNode.style.display = "block";
      decisionFeedbackNode.textContent = "Puedes mantener solo el resultado. Si más adelante cambias de idea, podrás pedir propuestas desde esta misma pantalla.";
    }
    window.PuntoSeguroAnalytics?.trackEvent("lead_declined", {
      risk_level: level,
      risk_score: score,
      iei_level: level,
      iei_score: score,
      model_version: modelVersion || null,
      tier: tier || null,
      dominant_axis: dominantAxisCode || null,
    });
  });
})();
