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

  function axisLabel(axis) {
    if (axis === "V") return "Vulnerabilidad";
    if (axis === "O") return "Oportunidad";
    if (axis === "A") return "Atractivo";
    return "";
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function getFactorPoints(factor) {
    const points = Number(factor?.puntos ?? factor?.points ?? 0);
    return Number.isFinite(points) ? points : 0;
  }

  function getTopFactors(evaluation, limit = 3) {
    const raw = Array.isArray(evaluation?.factores_top)
      ? evaluation.factores_top
      : Array.isArray(evaluation?.factors_top)
        ? evaluation.factors_top
        : [];

    return raw
      .slice()
      .sort((a, b) => getFactorPoints(b) - getFactorPoints(a))
      .slice(0, Math.max(0, Number(limit) || 0));
  }

  function tonePrefix(level) {
    if (level === "CONTROLADA") return "Optimiza";
    if (level === "MODERADA") return "Ajusta";
    if (level === "ELEVADA") return "Prioriza";
    if (level === "CRÍTICA") return "Actúa hoy";
    return "Ajusta";
  }

  const RULES = [
    {
      id: "no_alarm",
      match: [/sin\s+(sistema\s+de\s+)?alarma/, /\balarma\b.*\bninguna\b/],
      priority: 90,
      step(_tipo, tone) {
        return `${tone}: instala detección con verificación (sensores + protocolo de aviso) para reducir oportunidad operativa.`;
      },
    },
    {
      id: "windows",
      match: [/ventanas?/, /sin\s+proteccion.*ventan/, /ventan.*sin\s+proteccion/],
      priority: 70,
      step(tipo, tone) {
        const t = normalizeText(tipo);
        if (t.includes("vivienda")) {
          return `${tone}: refuerza ventanas expuestas (cierres, sensor perimetral y elemento disuasorio visible).`;
        }
        return `${tone}: refuerza puntos acristalados expuestos (sensor, lámina/film y disuasión visible).`;
      },
    },
    {
      id: "ground_floor",
      match: [/piso\s*bajo/, /planta\s*baja/, /a\s*ras\s*de\s*calle/],
      priority: 65,
      step(tipo, tone) {
        const t = normalizeText(tipo);
        if (!t.includes("vivienda")) return "";
        return `${tone}: prioriza puntos a ras de calle (ventanas/puertas) y reduce accesos fáciles desde exterior.`;
      },
    },
    {
      id: "street_level_shop",
      match: [/local\s+a\s+pie\s+de\s+calle/, /pie\s+de\s+calle/, /local\s+de\s+calle/],
      priority: 75,
      step(tipo, tone) {
        const t = normalizeText(tipo);
        if (!t.includes("comercio")) return "";
        return `${tone}: mejora disuasión visible (iluminación, señalización y cámara orientada a fachada/accesos).`;
      },
    },
    {
      id: "shutter",
      match: [/persiana/, /microperforada/],
      priority: 72,
      step(tipo, tone) {
        const t = normalizeText(tipo);
        if (!t.includes("comercio")) return "";
        return `${tone}: revisa cierre/persiana (puntos de palanca, guías y bloqueo) y combina con detección en acceso.`;
      },
    },
    {
      id: "high_value_stock",
      match: [/stock\s+atractivo/, /alimentacion/, /joyeria/, /electronica/],
      priority: 68,
      step(tipo, tone) {
        const t = normalizeText(tipo);
        if (!t.includes("comercio")) return "";
        return `${tone}: reduce atractivo (stock fuera de vista, rutinas de exposición y control de cierre en horas críticas).`;
      },
    },
    {
      id: "no_cameras",
      match: [/sin\s+camara/, /sin\s+camaras/, /sin\s+videovigilancia/],
      priority: 60,
      step(_tipo, tone) {
        return `${tone}: añade verificación visual (cámara en acceso principal y zona de punto ciego).`;
      },
    },
    {
      id: "lighting_blind_spots",
      match: [/iluminacion/, /puntos?\s+ciegos?/, /punto\s+ciego/],
      priority: 58,
      step(_tipo, tone) {
        return `${tone}: elimina puntos ciegos (iluminación exterior + limpieza de líneas de visión).`;
      },
    },
    {
      id: "absence_routine",
      match: [/ausencia/, /muchas\s+horas\s+vaci/, /rutina\s+previsible/, /horas?\s+vaci/],
      priority: 62,
      step(_tipo, tone) {
        return `${tone}: rompe la previsibilidad (rutinas, temporizadores y protocolo cuando queda vacío).`;
      },
    },
  ];

  function buildPlanFromFactors(evaluation) {
    const level = String(evaluation?.risk_level || "MODERADA").toUpperCase();
    const tone = tonePrefix(level);
    const tipo = evaluation?.tipo_inmueble || evaluation?.business_type || "";

    const topFactors = getTopFactors(evaluation, 5);

    const candidates = [];
    for (const factor of topFactors) {
      const rawText = factor?.texto || factor?.text || "";
      const normalized = normalizeText(rawText);
      const factorPts = getFactorPoints(factor);

      for (const rule of RULES) {
        const matches = (rule.match || []).some((m) => (m instanceof RegExp ? m.test(normalized) : normalized.includes(normalizeText(m))));
        if (!matches) continue;

        const text = rule.step(tipo, tone);
        if (!text) continue;

        candidates.push({
          text,
          priority: Number(rule.priority) || 0,
          factorPoints: factorPts,
        });
      }
    }

    candidates.sort((a, b) => (b.priority - a.priority) || (b.factorPoints - a.factorPoints));

    const steps = [];
    const seen = new Set();
    for (const candidate of candidates) {
      const key = normalizeText(candidate.text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      steps.push(candidate.text);
      if (steps.length >= 3) break;
    }

    const t = normalizeText(tipo);
    const fallbacks = t.includes("comercio")
      ? [
          `${tone}: revisa accesos y cierre principal (puerta, persiana/cierre, cristal) y puntos secundarios.`,
          `${tone}: mejora detección + verificación + protocolo de respuesta para reducir la ventana operativa.`,
          `${tone}: refuerza disuasión visible y elimina puntos ciegos (iluminación y líneas de visión).`,
        ]
      : t.includes("vivienda")
        ? [
            `${tone}: revisa accesos principales y secundarios (puerta, ventanas, balcones) y su resistencia real.`,
            `${tone}: añade detección temprana (sensores perimetrales/interiores) y un protocolo claro de aviso/respuesta.`,
            `${tone}: mejora disuasión y elimina puntos ciegos (iluminación exterior, visibilidad, orden).`,
          ]
        : [
            `${tone}: revisa accesos/cerramientos y puntos secundarios para reducir vulnerabilidad estructural.`,
            `${tone}: mejora detección y respuesta para reducir oportunidad operativa.`,
            `${tone}: refuerza disuasión y elimina puntos ciegos (iluminación y visibilidad).`,
          ];

    for (const fallback of fallbacks) {
      if (steps.length >= 3) break;
      const key = normalizeText(fallback);
      if (seen.has(key)) continue;
      seen.add(key);
      steps.push(fallback);
    }

    return {
      title: "Plan en 3 pasos (según tus puntos débiles)",
      steps: steps.slice(0, 3),
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
      base = "Se aprecian puntos mejorables habituales. Ajustarlos suele reducir oportunidad sin grandes cambios.";
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
  recommendationsNode.innerHTML = (plan.steps || [])
    .map((item, index) => `
      <div class="step-card">
        <div class="step-n">${index + 1}</div>
        <div class="step-txt">${item}</div>
      </div>
    `.trim())
    .join("");

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
    const inferredPlazo = (level === "CRÍTICA" || level === "ELEVADA")
      ? "esta_semana"
      : level === "MODERADA"
        ? "1_3_meses"
        : "informativo";

    window.sessionStorage.setItem(
      "puntoSeguro.intent",
      JSON.stringify({
        plazo: inferredPlazo,
        inferred: true,
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
