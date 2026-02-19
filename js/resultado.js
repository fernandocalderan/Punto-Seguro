(async function resultadoPage() {
  function readEvaluation() {
    const raw = window.sessionStorage.getItem("puntoSeguro.latestEvaluation");
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }

  const URGENCY_CAL = {
    // Variante: "A" conservadora, "B" más negocio
    variant: (window.localStorage.getItem("ps_urgency_variant") || "B").toUpperCase(),

    // Pesos base (se aplican a p,i,s)
    // A: más prudente, B: más “urgencia”
    weights: {
      A: { p: 0.50, i: 0.35, s: 0.15 },
      B: { p: 0.55, i: 0.30, s: 0.15 }
    },

    // Escala sinergia (puntos -> 0..1 aprox)
    synergyDiv: { A: 14, B: 10 },

    // Boost máximo aplicado al risk_score según FA (0..1)
    boostK: { A: 0.22, B: 0.35 },

    // “Curva” para polarizar ( >1 empuja medios hacia arriba si FA>~0.5 )
    // A: suave, B: más agresiva pero defendible
    gamma: { A: 1.05, B: 1.20 },

    // Ajuste por confianza (reduce urgencia si confianza baja)
    confidenceFloor: { A: 0.80, B: 0.78 } // mínimo multiplicador
  };

  function badgeClass(level) {
    if (level === "CONTROLADA") return "badge badge-low";
    if (level === "MODERADA") return "badge badge-medium";
    if (level === "ELEVADA") return "badge badge-high";
    if (level === "CRÍTICA") return "badge badge-high";
    return "badge";
  }

  function levelToFloorIdx(level){
    const l = String(level || "").toUpperCase();
    if (l === "CRÍTICA" || l === "CRITICA") return 3;
    if (l === "ELEVADA") return 2;
    if (l === "MODERADA") return 1;
    return 0; // CONTROLADA
  }

  function idxToPriority(idx){
    if (idx >= 3) return { label: "Muy alta", plazo: "Esta semana", intent: "esta_semana" };
    if (idx >= 2) return { label: "Alta", plazo: "7–14 días", intent: "15_dias" };
    if (idx >= 1) return { label: "Media", plazo: "30 días", intent: "30_dias" };
    return { label: "Baja", plazo: "Revisión periódica", intent: "informativo" };
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

  function normalize(s) {
    return String(s || "").toLowerCase();
  }

  function clamp01(x){ return Math.max(0, Math.min(1, x)); }

  function computeActivationFactor(meta){
    const v = URGENCY_CAL.variant in URGENCY_CAL.weights ? URGENCY_CAL.variant : "B";
    const w = URGENCY_CAL.weights[v];
    const div = URGENCY_CAL.synergyDiv[v];

    const p = clamp01(Number(meta?.probabilityIndex || 0) / 100);
    const i = clamp01(Number(meta?.impactIndex || 0) / 100);
    const s = clamp01(Number(meta?.synergyPoints || 0) / div);
    const c = clamp01(Number(meta?.confidenceScore || 70) / 100);

    // exposición lineal (0..1)
    let exposure = clamp01(w.p*p + w.i*i + w.s*s);

    // curva para polarizar (gamma)
    const g = URGENCY_CAL.gamma[v];
    exposure = clamp01(Math.pow(exposure, 1/g)); // 1/g sube medios sin “romper” altos

    // penalización suave por baja confianza (no regales urgencia con datos flojos)
    const floor = URGENCY_CAL.confidenceFloor[v];
    const confMult = clamp01(floor + (1 - floor) * c);

    return clamp01(exposure * confMult);
  }

  function computeUrgencyScore(baseScore, FA){
    const v = URGENCY_CAL.variant in URGENCY_CAL.boostK ? URGENCY_CAL.variant : "B";
    const k = URGENCY_CAL.boostK[v];

    // boost: 0..k (hasta +35% en variante B)
    const boosted = Number(baseScore || 0) * (1 + k * FA);
    return Math.round(Math.max(0, Math.min(100, boosted)));
  }

  function classifySignals(factorsTop){
    const txt = normalize((factorsTop || []).map((f) => f?.texto || f?.text || "").join(" | "));

    const signals = {
      detection: txt.includes("sin detección") || txt.includes("sin deteccion") || txt.includes("sin alarma"),
      verification: txt.includes("sin verificación") || txt.includes("sin verificacion") || txt.includes("verificación limitada"),
      response: txt.includes("respuesta lenta") || txt.includes("20–40") || txt.includes("20-40") || txt.includes(">40"),
      access: txt.includes("persiana") || txt.includes("cierre/persiana") || txt.includes("puerta") || txt.includes("ventanas"),
      visibility: txt.includes("puntos ciegos") || txt.includes("iluminación") || txt.includes("iluminacion") || txt.includes("visibilidad"),
      attractiveness: txt.includes("objetivo atractivo") || txt.includes("stock atractivo") || txt.includes("valor visible")
    };

    const drivers = [];
    if (signals.detection) drivers.push({ key: "detection", title: "Detección temprana insuficiente", detail: "Si no se detecta en <60s, aumenta la ventana operativa y la probabilidad acumulada." });
    if (signals.verification) drivers.push({ key: "verification", title: "Sin verificación fiable", detail: "Sin verificación, la respuesta suele ser menos efectiva y aumenta el tiempo hasta intervención real." });
    if (signals.response) drivers.push({ key: "response", title: "Tiempo de respuesta mejorable", detail: "Un margen de 20–40 min deja una ventana operativa amplia incluso con medidas físicas." });
    if (signals.access) drivers.push({ key: "access", title: "Accesos/cierres vulnerables", detail: "Cierres, persiana o cerramientos mejorables son vectores típicos de ataque por palanca o guía." });
    if (signals.visibility) drivers.push({ key: "visibility", title: "Entorno favorable al intruso", detail: "Puntos ciegos/iluminación baja reducen fricción y aumentan oportunidad." });
    if (signals.attractiveness) drivers.push({ key: "attractiveness", title: "Atractivo del objetivo", detail: "Valor visible o stock revendible incrementa motivación y selección del objetivo." });

    return { signals, drivers: drivers.slice(0, 3) };
  }

  function computePriority(riskLevel, signals){
    const floor = levelToFloorIdx(riskLevel);

    // bump “comercial defendible”: detección o respuesta o acceso => +1
    const bump = (signals.detection || signals.response || signals.access) ? 1 : 0;
    const idx = Math.min(3, floor + bump);
    const p = idxToPriority(idx);

    const why =
      idx >= 2
        ? "Se detectan señales operativas (detección/respuesta/accesos) que justifican intervención prioritaria."
        : idx === 1
          ? "Hay puntos mejorables habituales; intervenir por fases reduce exposición sin sobredimensionar."
          : "Exposición contenida; mantener control preventivo y optimización coste/beneficio.";

    return { ...p, idx, why };
  }

  function exposureInterpretation({signals, priorityIdx, baseScore}){
    void signals;
    void baseScore;
    // No devuelve niveles tipo BAJA/MEDIA… devuelve una frase consistente con prioridad
    if (priorityIdx >= 3) return "Interpretación: ventana operativa alta si no se corrige esta semana.";
    if (priorityIdx >= 2) return "Interpretación: ventana operativa relevante; recortar detección/respuesta reduce riesgo a corto plazo.";
    if (priorityIdx >= 1) return "Interpretación: margen de mejora por fases; ajustar puntos críticos reduce oportunidad.";
    return "Interpretación: exposición contenida; optimizar coste/beneficio y revisar periódicamente.";
  }

  function meaningForLevel(level){
    const lvl = String(level || "").toUpperCase();
    if (lvl === "CRÍTICA") {
      return "El patrón actual concentra señales de exposición alta y ventana operativa amplia. La reducción de riesgo requiere priorizar medidas esta semana.";
    }
    if (lvl === "ELEVADA") {
      return "El perfil combina vulnerabilidades y oportunidad operativa. Actuar por capas suele reducir exposición de forma tangible en el corto plazo.";
    }
    if (lvl === "MODERADA") {
      return "Hay margen claro de mejora técnica. Un ajuste por fases bien priorizado reduce previsibilidad y oportunidad sin sobredimensionar.";
    }
    return "La exposición está contenida, pero mantener revisión periódica evita que pequeñas brechas evolucionen a riesgo operativo.";
  }

  function salesStep1FromSignals(signals){
    if (signals.detection) {
      return "DIFERENCIAL: prioriza detección + verificación (sensores en accesos y validación de eventos) para recortar la ventana operativa inicial.";
    }
    if (signals.access) {
      return "DIFERENCIAL: refuerza cierre/persiana/accesos expuestos para elevar resistencia real frente a ataque de oportunidad.";
    }
    if (signals.response) {
      return "DIFERENCIAL: define protocolo de respuesta y tiempos objetivo para reducir el margen operativo tras una intrusión.";
    }
    return "DIFERENCIAL: realiza una revisión técnica de capas (acceso, detección y respuesta) para priorizar inversiones de mayor impacto.";
  }

  function factorSignalTag(factorText){
    const txt = normalize(factorText);
    if (txt.includes("sin detección") || txt.includes("sin deteccion") || txt.includes("sin alarma")) return "detection";
    if (txt.includes("respuesta lenta") || txt.includes("20–40") || txt.includes("20-40") || txt.includes(">40")) return "response";
    if (txt.includes("cierre/persiana") || txt.includes("persiana vulnerable") || txt.includes("persiana")) return "access";
    return "";
  }

  function insertAfter(node, newNode){
    if (!node || !node.parentNode) return;
    node.parentNode.insertBefore(newNode, node.nextSibling);
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

  let evaluation = readEvaluation();

  if (!evaluation) {
    const attempted = window.sessionStorage.getItem("ps_eval_restore_attempted");
    if (!attempted) {
      try {
        const response = await fetch("/api/eval-snapshot/me", { credentials: "same-origin" });
        if (response.ok) {
          const data = await response.json();
          if (data && data.ok && data.evaluation) {
            window.sessionStorage.setItem("puntoSeguro.latestEvaluation", JSON.stringify(data.evaluation));
            window.location.reload();
            return;
          }
        }
        window.sessionStorage.setItem("ps_eval_restore_attempted", "1");
      } catch (_error) {
        // Silent fallback: keep legacy empty-state behavior.
      }
    }

    window.PuntoSeguroAnalytics?.trackEvent("result_viewed", { has_result: false });
    return;
  }

  const saved = window.sessionStorage.getItem("ps_eval_snapshot_saved");
  if (!saved) {
    fetch("/api/eval-snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      keepalive: true,
      body: JSON.stringify({ evaluation }),
    })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json().catch(() => null);
        if (data && data.ok) {
          window.sessionStorage.setItem("ps_eval_snapshot_saved", "1");
        }
      })
      .catch(() => {});
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
  const factorsTop = getTopFactors(evaluation, 5);
  const factorsTopForView = factorsTop.slice(0, 3);
  const { signals, drivers: detectedDrivers } = classifySignals(factorsTop);
  const drivers = detectedDrivers.length > 0
    ? detectedDrivers
    : [{ key: "baseline", title: "Perfil con exposición contenida", detail: "No aparecen señales operativas críticas en el top de factores; mantener revisión periódica preserva este nivel." }];
  const priority = computePriority(level, signals);

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
  const heroNode = document.querySelector("header.iei-hero");
  const factorsSectionNode = document.querySelector('section[aria-label="Factores principales"]');
  const planSectionNode = document.querySelector('section[aria-label="Plan de acción"]');

  scoreNode.textContent = `${score} / 100`;
  levelNode.textContent = level;
  levelNode.className = badgeClass(level);
  if (explanationNode) {
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
  }
  humanTextNode.textContent = humanTranslation(level, {
    probabilityIndex,
    impactIndex,
    synergyPoints,
    dominantAxisCode,
    tier,
  });

  let meaningNode = document.getElementById("ps-premium-meaning");
  if (!meaningNode) {
    meaningNode = document.createElement("section");
    meaningNode.id = "ps-premium-meaning";
    meaningNode.className = "ps-premium-block";
  }
  meaningNode.innerHTML = `
    <div class="ps-premium-kicker">Lectura rápida</div>
    <div class="ps-premium-title">Qué significa este resultado</div>
    <p class="ps-premium-text">${escapeHtml(meaningForLevel(level))}</p>
  `.trim();
  insertAfter(heroNode, meaningNode);

  const priorityMicroCta = priority.idx >= 2
    ? "Recomendado: recibir propuestas esta semana para reducir exposición operativa."
    : priority.idx === 1
      ? "Recomendado: comparar propuestas en 30 días para optimizar medidas."
      : "Opcional: comparar propuestas para mejorar coste/beneficio.";

  let priorityNode = document.getElementById("ps-premium-priority");
  if (!priorityNode) {
    priorityNode = document.createElement("section");
    priorityNode.id = "ps-premium-priority";
    priorityNode.className = "ps-premium-block ps-premium-priority";
  }
  priorityNode.innerHTML = `
    <div class="ps-premium-kicker">Prioridad de actuación</div>
    <div class="ps-premium-row">
      <div class="ps-premium-pill">${escapeHtml(priority.label)}</div>
      <div class="ps-premium-deadline">Plazo recomendado: <b>${escapeHtml(priority.plazo)}</b></div>
    </div>
    <p class="ps-premium-text">${escapeHtml(priority.why)}</p>
    <p class="ps-premium-microcta">${escapeHtml(priorityMicroCta)}</p>
    <p class="ps-premium-coherence">Resumen: IEI describe el estado estructural; Prioridad define el plazo recomendado según señales operativas detectadas.</p>
  `.trim();
  if (factorsSectionNode?.parentNode) {
    factorsSectionNode.parentNode.insertBefore(priorityNode, factorsSectionNode);
  }

  let driversNode = document.getElementById("ps-premium-drivers");
  if (!driversNode) {
    driversNode = document.createElement("section");
    driversNode.id = "ps-premium-drivers";
    driversNode.className = "ps-premium-block";
  }
  driversNode.innerHTML = `
    <div class="ps-premium-kicker">Motivos principales</div>
    <div class="ps-premium-title">Lo que más eleva tu exposición</div>
    <div class="ps-driver-list">
      ${drivers.map((d) => `
        <div class="ps-driver">
          <div class="ps-driver-title">${escapeHtml(d.title)}</div>
          <div class="ps-driver-detail">${escapeHtml(d.detail)}</div>
        </div>
      `).join("")}
    </div>
  `.trim();
  if (planSectionNode?.parentNode) {
    planSectionNode.parentNode.insertBefore(driversNode, planSectionNode);
  }

  let urgencyContainer = document.getElementById("operational-exposure");

  if(!urgencyContainer){
    urgencyContainer = document.createElement("div");
    urgencyContainer.id = "operational-exposure";
    urgencyContainer.className = "operational-exposure-block";
    const insertionRef = humanTextNode.nextSibling;
    humanTextNode.parentNode.insertBefore(urgencyContainer, insertionRef);
  }

  urgencyContainer.innerHTML = `
    <div class="urgency-title">Exposición operativa</div>
    <div class="urgency-score">${urgencyScore} / 100</div>
    <div class="urgency-text">${escapeHtml(exposureInterpretation({ signals, priorityIdx: priority.idx, baseScore: urgencyScore }))}</div>
    <div class="urgency-note">Nota: el IEI es estructural; la prioridad traduce señales operativas (detección/respuesta/accesos) a un plazo recomendado.</div>
  `.trim();

  if (barFillNode) {
    const pct = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
    // Allow CSS transition from 0% to value.
    barFillNode.style.width = "0%";
    window.requestAnimationFrame(() => {
      barFillNode.style.width = `${pct}%`;
    });
  }

  const plan = buildPlanFromFactors(evaluation);
  const planSteps = Array.isArray(plan.steps) ? plan.steps.slice(0, 3) : [];
  if (planSteps.length === 0) {
    planSteps.push(
      "DIFERENCIAL: realiza una revisión técnica de capas (acceso, detección y respuesta) para priorizar inversiones de mayor impacto.",
      "Refuerza los puntos estructurales más expuestos según el perfil detectado para reducir el vector de entrada probable.",
      "Formaliza protocolo operativo y rutina de revisión periódica para mantener el nivel bajo control."
    );
  } else {
    planSteps[0] = salesStep1FromSignals(signals);
  }

  recommendationsNode.innerHTML = `
    ${planSteps.map((step, i) => `
      <div class="step-card">
        <div class="step-n">${i + 1}</div>
        <div class="step-txt">${escapeHtml(step)}</div>
      </div>
    `).join("")}
    <div class="plan-closing">${escapeHtml(plan.closing)}</div>
  `.trim();

  topFactorsNode.innerHTML = factorsTopForView.length > 0
    ? factorsTopForView.map((factor) => {
      const text = factor.texto || factor.text || "Factor de exposición detectado";
      const tag = factorSignalTag(text);
      const dataSignal = tag ? ` data-signal="${escapeHtml(tag)}"` : "";
      const classes = tag ? "chip ps-chip-key" : "chip";
      return `<span class="${classes}"${dataSignal}>${escapeHtml(text)}</span>`;
    }).join("")
    : "<span class=\"chip\">Sin factores destacados en esta simulación.</span>";

  const resumen = factorsTopForView
    .map((factor) => factor?.texto || factor?.text)
    .filter(Boolean)
    .join(" | ");

  const evaluationSummaryPayload = {
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
    factores_top: factorsTopForView,
    top_factors: factorsTopForView,
    priority: {
      label: priority.label,
      plazo: priority.plazo,
      intent: priority.intent,
      idx: priority.idx,
      why: priority.why,
    },
    drivers,
    generated_at: evaluation.generated_at || new Date().toISOString(),
  };

  window.sessionStorage.setItem(
    "puntoSeguro.evaluationSummary",
    JSON.stringify(evaluationSummaryPayload)
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
    const inferredPlazo = priority.intent;

    window.sessionStorage.setItem(
      "puntoSeguro.intent",
      JSON.stringify({
        inferredPlazo,
        plazo: inferredPlazo,
        priority_label: priority.label,
        source: "inferred",
        selected_at: new Date().toISOString(),
      })
    );

    window.sessionStorage.setItem(
      "puntoSeguro.evaluationSummary",
      JSON.stringify(evaluationSummaryPayload)
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
      decisionFeedbackNode.textContent = "Informe guardado. Puedes volver cuando quieras para comparar propuestas.";
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

    if (typeof window.print === "function") {
      window.print();
    }
  });
})();
