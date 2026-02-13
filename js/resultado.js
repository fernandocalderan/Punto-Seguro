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

  function recommendations({ level, tipoInmueble, factorsTop, dominantAxisCode }) {
    const safeFactors = Array.isArray(factorsTop) ? factorsTop : [];
    const recs = [];
    const seen = new Set();

    function add(text) {
      const key = String(text || "").trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      recs.push(text);
    }

    if (dominantAxisCode === "V") {
      add("Priorizar refuerzo físico de accesos y cerramientos para reducir vulnerabilidad estructural.");
    } else if (dominantAxisCode === "O") {
      add("Priorizar detección, alarma y capacidad de respuesta para reducir la oportunidad operativa.");
    } else if (dominantAxisCode === "A") {
      add("Priorizar disuasión visible y control de stock/valor para reducir atractivo objetivo.");
    }

    if (level === "CRÍTICA") {
      add("Contrastar de forma prioritaria puntos de acceso, detección y protocolo de respuesta en franjas críticas.");
      add("Pedir una validación técnica para priorizar medidas por fases sin sobredimensionar inversión.");
    } else if (level === "ELEVADA") {
      add("Priorizar los accesos con mayor exposición y alinear medidas físicas con detección y respuesta.");
      add("Comparar dos propuestas técnicas para equilibrar cobertura, coste y tiempos de atención.");
    } else if (level === "MODERADA") {
      add("Verificar qué accesos o rutinas generan mayor previsibilidad y priorizar su ajuste.");
      add("Alinear hábitos y medidas preventivas para evitar puntos ciegos frecuentes.");
    } else {
      add("Mantener revisión periódica de cerramientos y puntos sensibles de acceso.");
      add("Solicitar una validación externa anual para detectar desajustes progresivos.");
    }

    const text = safeFactors
      .map((factor) => String(factor?.texto || factor?.text || "").toLowerCase())
      .join(" | ");

    if (tipoInmueble === "vivienda") {
      if (text.includes("sin sistema de alarma") || text.includes("sin alarma")) {
        add("Contrastar opciones de detección y aviso/respuesta para reducir la ventana de oportunidad.");
      }
      if (text.includes("sin cámaras")) {
        add("Revisar visibilidad y puntos ciegos (interior/exterior) con enfoque disuasorio y de verificación.");
      }
      if (text.includes("ventanas") && (text.includes("sin protección") || text.includes("sin proteccion"))) {
        add("Revisar refuerzo y detección en ventanas (sensores, lámina o elementos físicos) según contexto.");
      }
      if (text.includes("puerta principal") && (text.includes("poco resistente") || text.includes("chapa simple") || text.includes("aluminio"))) {
        add("Validar resistencia y tipo de cerradura de la puerta principal con criterio técnico.");
      }
      if (text.includes("vivienda vacía") || text.includes("vivienda vacia")) {
        add("Reducir previsibilidad en franjas sin presencia y ajustar medidas en los periodos más expuestos.");
      }
      if (text.includes("historial de robos")) {
        add("En contextos con histórico, priorizar confirmación técnica para decidir medidas con criterio.");
      }
    } else if (tipoInmueble === "comercio") {
      if (text.includes("sin sistema de alarma") || text.includes("sin alarma")) {
        add("Contrastar opciones de detección y respuesta para reducir el tiempo de exposición en el local.");
      }
      if (text.includes("persiana") && text.includes("simple")) {
        add("Evaluar resistencia del cierre principal y su vulnerabilidad típica, integrándolo con detección.");
      }
      if (text.includes("lunas") && (text.includes("sin film") || text.includes("sin protección") || text.includes("sin proteccion"))) {
        add("Revisar protección del escaparate/lunas y su integración con detección para reducir intrusión oportunista.");
      }
      if (text.includes("actividad de alto valor")) {
        add("Ajustar el nivel de protección a la exposición de la actividad y a franjas críticas habituales.");
      }
      if (text.includes("sin cierre interior")) {
        add("Revisar capas complementarias de cierre interior para reducir vulnerabilidad en accesos principales.");
      }
    }

    while (recs.length < 3) {
      if (tipoInmueble === "comercio") add("Revisar procedimientos de cierre y aperturas para reducir oportunidad sin fricción operativa.");
      else add("Comprobar que hábitos diarios no incrementen la observabilidad del inmueble.");
    }

    return recs.slice(0, 3);
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
  const intentBlockNode = document.getElementById("intent-block");
  const intentSelectNode = document.getElementById("intent-plazo");
  const intentConfirmNode = document.getElementById("intent-confirm");
  const ctaRequestNode = document.getElementById("cta-request");
  const ctaKeepNode = document.getElementById("cta-keep");
  const decisionFeedbackNode = document.getElementById("decision-feedback");

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

  const factorsTop = Array.isArray(evaluation.factores_top) ? evaluation.factores_top.slice(0, 3) : [];

  recommendationsNode.innerHTML = recommendations({
    level,
    tipoInmueble,
    factorsTop,
    dominantAxisCode,
  })
    .map((item) => `<li>${item}</li>`)
    .join("");

  topFactorsNode.innerHTML = factorsTop.length > 0
    ? factorsTop.map((factor) => `<li>${factor.texto || "Factor de exposición detectado"}</li>`).join("")
    : "<li>No se detectaron factores destacados en esta simulación.</li>";

  const resumen = (evaluation.factores_top || [])
    .map((factor) => factor.texto)
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

  try {
    const rawIntent = window.sessionStorage.getItem("puntoSeguro.intent");
    if (rawIntent) {
      const parsedIntent = JSON.parse(rawIntent);
      if (parsedIntent?.plazo && intentSelectNode) {
        intentSelectNode.value = parsedIntent.plazo;
      }
    }
  } catch (_error) {
    // Ignore stale/invalid intent state in sessionStorage.
  }

  if (intentBlockNode) {
    // Ensure the intent UI is hidden by default and only shown after request CTA.
    intentBlockNode.classList.add("ps-hidden");
  }

  function showIntentBlock() {
    if (!intentBlockNode) return;
    intentBlockNode.classList.remove("ps-hidden");
    intentBlockNode.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => {
      intentSelectNode && intentSelectNode.focus();
    }, 250);
  }

  ctaRequestNode?.addEventListener("click", () => {
    showIntentBlock();
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

  intentConfirmNode?.addEventListener("click", () => {
    const plazo = String(intentSelectNode?.value || "").trim();
    if (!plazo) return;

    window.sessionStorage.setItem(
      "puntoSeguro.intent",
      JSON.stringify({
        plazo,
        selected_at: new Date().toISOString(),
      })
    );

    window.PuntoSeguroAnalytics?.trackEvent("lead_intent_selected", {
      plazo,
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
})();
