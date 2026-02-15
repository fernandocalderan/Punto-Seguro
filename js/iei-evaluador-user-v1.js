/* IEI Comercial (usuario v1)
   - Render data-driven desde /Motor-IEI/iei_questions_premium.json
   - Calcula con /Motor-IEI/calculateIEI.js (ESM) via import()
   - Bridge global window.calcularRiesgo() para mantener UX/handlers inline
   - NO toca resultado.js: respeta contrato sessionStorage → /resultado → lead flow
*/

const QUESTIONS_URL = "/Motor-IEI/iei_questions_premium.json";
const MOTOR_URL = "/Motor-IEI/calculateIEI.js";

const MODEL_VERSION = "IEI-user-v1";

const SCORE_KEY_TO_POINTS = { "0": 0, "1": 33, "2": 66, "3": 100 };

const BLOCK_ORDER = ["E", "R", "D", "P", "H", "T", "O"];
const BLOCK_LABEL = {
  E: "Entorno",
  R: "Accesos y resistencia",
  D: "Detección y verificación",
  P: "Respuesta y disuasión",
  H: "Hábitos y operativa",
  T: "Atractivo del objetivo",
  O: "Ocupación y señales",
};

const QID_PRIORITY = {
  // Priorizar triggers para RULES (plan 3 pasos).
  D1: 1000, // alarma
  D2: 950, // camaras
  R2: 900, // ventanas
  D3: 850, // iluminacion
  E2: 800, // puntos ciegos / visibilidad
  H1: 780, // ausencias previsibles
  R1: 760, // puerta o cierre/persiana (comercio)
  T1C: 740, // stock atractivo
  O2V: 720, // abandono aparente vivienda
  O1C: 710, // local cerrado
  R3: 700, // accesos secundarios
  T2C: 680, // efectivo
};

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function riskLevelFromScore(score) {
  const s = Number(score);
  if (s <= 25) return "CONTROLADA";
  if (s <= 50) return "MODERADA";
  if (s <= 75) return "ELEVADA";
  return "CRÍTICA";
}

function normalizeKeyForMotor(rawKey) {
  // Nunca dejar que "U" llegue al motor.
  return rawKey === "U" ? "2" : rawKey;
}

function pointsForKey(key) {
  return SCORE_KEY_TO_POINTS[String(key)] ?? 0;
}

function getActiveType() {
  return String(document.getElementById("tipo-inmueble")?.value || "").trim();
}

function getPanelNode(type) {
  return type === "vivienda"
    ? document.getElementById("formulario-vivienda")
    : document.getElementById("formulario-comercio");
}

function getPanelSelects(type) {
  const panel = getPanelNode(type);
  if (!panel) return [];
  return Array.from(panel.querySelectorAll("select[data-qid]"));
}

function getRootNode(type) {
  return type === "vivienda"
    ? document.getElementById("iei-vivienda-root")
    : document.getElementById("iei-comercio-root");
}

function safeText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function factorTextFor(qid, type, rawKey) {
  // Generar textos compatibles con RULES de /js/resultado.js sin tocarlo.
  // Importante: no disparar triggers cuando rawKey es "U" o respuestas seguras.
  const rk = String(rawKey || "");

  // Entorno
  if (qid === "E1") {
    if (rk === "3") return "Zona con robos frecuentes";
    if (rk === "2") return "Zona con robos habituales";
    if (rk === "1") return "Zona con robos ocasionales";
    if (rk === "0") return "Zona tranquila";
    return "Riesgo en la zona (no lo sé)";
  }

  if (qid === "E2") {
    // Fusión: control + visibilidad. Disparar RULES de "puntos ciegos/visibilidad" en riesgo.
    if (rk === "3" || rk === "2") return "Puntos ciegos / visibilidad baja";
    if (rk === "1") return "Visibilidad parcial";
    if (rk === "0") return "Acceso visible";
    return "Visibilidad/control (no lo sé)";
  }

  // Puerta principal / frente del local
  if (qid === "R1") {
    if (type === "comercio") {
      // Evitar falsos positivos en RULES ("cierre"/"persiana") cuando el frente es seguro.
      if (rk === "3" || rk === "2") return "Cierre/persiana vulnerable";
      if (rk === "1") return "Frente del local mejorable";
      if (rk === "0") return "Frente del local protegido";
      return "Frente del local (no lo sé)";
    }
    if (rk === "3") return "Puerta principal vulnerable";
    if (rk === "2") return "Puerta principal estándar";
    if (rk === "1") return "Puerta principal robusta";
    if (rk === "0") return "Puerta principal muy robusta";
    return "Puerta principal (no lo sé)";
  }

  // Alarma (RULE: "sin alarma" / "sin sistema de alarma" / "no tiene alarma")
  if (qid === "D1") {
    if (rk === "3") return "Sin alarma";
    if (rk === "2") return "Alarma básica";
    if (rk === "1" || rk === "0") return "Alarma presente";
    return "Alarma (no lo sé)";
  }

  // Cámaras (RULE: "sin cámaras" / "sin videovigilancia" / "no hay cámaras")
  if (qid === "D2") {
    if (rk === "3") return "Sin cámaras";
    if (rk === "2") return "Cámaras básicas";
    if (rk === "1" || rk === "0") return "Cámaras presentes";
    return "Cámaras (no lo sé)";
  }

  // Ventanas (RULE vivienda incluye "ventanas", evitar falsos positivos en respuestas seguras)
  if (qid === "R2") {
    if (rk === "3") return "Ventanas sin protección";
    if (rk === "2") return "Ventanas con poca protección";
    if (rk === "1") return "Cerramientos exteriores mejorables";
    if (rk === "0") return "Cerramientos exteriores robustos";
    return "Cerramientos exteriores (no lo sé)";
  }

  // Accesos secundarios vulnerables (texto solicitado; sin RULE directa)
  if (qid === "R3") {
    if (rk === "3") return "Accesos secundarios vulnerables";
    if (rk === "2") return "Accesos secundarios mejorables";
    if (rk === "1" || rk === "0") return "Accesos secundarios controlados";
    return "Accesos secundarios (no lo sé)";
  }

  // Iluminación / puntos ciegos (RULE: iluminacion / puntos ciegos / visibilidad)
  if (qid === "D3") {
    if (rk === "3" || rk === "2") return "Iluminación deficiente / puntos ciegos";
    if (rk === "1") return "Luz exterior mejorable";
    if (rk === "0") return "Luz exterior suficiente";
    return "Luz exterior (no lo sé)";
  }

  // Ausencias previsibles / falta de actividad (RULE: ausencia / previsible)
  if (qid === "H1") {
    if (rk === "3" || rk === "2") return "Ausencias previsibles";
    if (rk === "1") return "Rutina algo predecible";
    if (rk === "0") return "Rutina variable";
    return "Rutinas (no lo sé)";
  }

  // Llaves/códigos
  if (qid === "H2") {
    if (rk === "3") return "Llaves/códigos descontrolados";
    if (rk === "2") return "Llaves/códigos poco controlados";
    if (rk === "1") return "Llaves/códigos bastante controlados";
    if (rk === "0") return "Llaves/códigos muy controlados";
    return "Llaves/códigos (no lo sé)";
  }

  // Tiempo de respuesta
  if (qid === "P1") {
    if (rk === "3") return "Respuesta lenta (>40 min)";
    if (rk === "2") return "Respuesta lenta (20–40 min)";
    if (rk === "1") return "Respuesta media (10–20 min)";
    if (rk === "0") return "Respuesta rápida (<10 min)";
    return "Tiempo de respuesta (no lo sé)";
  }

  // Disuasión visible
  if (qid === "P2") {
    if (rk === "3") return "Sin disuasión visible";
    if (rk === "2") return "Poca disuasión visible";
    if (rk === "1") return "Algo de disuasión visible";
    if (rk === "0") return "Disuasión visible";
    return "Disuasión (no lo sé)";
  }

  // Comercio: stock atractivo (RULE: stock / joyeria / electronica / etc.)
  if (qid === "T1C") {
    if (rk === "3" || rk === "2") return "Stock atractivo";
    if (rk === "1") return "Valor comercial medio";
    if (rk === "0") return "Valor comercial bajo";
    return "Valor comercial (no lo sé)";
  }

  // Comercio: efectivo
  if (qid === "T2C") {
    if (rk === "3") return "Manejo de efectivo alto";
    if (rk === "2") return "Manejo de efectivo frecuente";
    if (rk === "1") return "Manejo de efectivo limitado";
    if (rk === "0") return "Sin efectivo relevante";
    return "Efectivo (no lo sé)";
  }

  // Vivienda: control vecindario
  if (qid === "O1V") {
    if (rk === "3") return "Vecindario sin control";
    if (rk === "2") return "Vecindario poco atento";
    if (rk === "1") return "Vecindario moderadamente atento";
    if (rk === "0") return "Vecindario atento";
    return "Vecindario (no lo sé)";
  }

  // Vivienda: abandono aparente (puede disparar RULES de ausencia)
  if (qid === "O2V") {
    if (rk === "3" || rk === "2") return "Ausencia prolongada / aspecto de abandono";
    if (rk === "1") return "Señales puntuales de ausencia";
    if (rk === "0") return "Señales de presencia";
    return "Actividad (no lo sé)";
  }

  // Vivienda: atractivo objetivo
  if (qid === "T1V") {
    if (rk === "3" || rk === "2") return "Objetivo atractivo";
    if (rk === "1") return "Atractivo medio";
    if (rk === "0") return "Atractivo bajo";
    return "Atractivo (no lo sé)";
  }

  // Comercio: cierres largos (predict_absence puede aplicar)
  if (qid === "O1C") {
    if (rk === "3" || rk === "2") return "Ausencia prolongada (local cerrado)";
    if (rk === "1") return "Cerrado ocasionalmente";
    if (rk === "0") return "Actividad regular";
    return "Local cerrado (no lo sé)";
  }

  // Fallback por tipo para evitar disparos accidentales de RULES en respuestas seguras.
  if (rk === "U") return "Factor (no lo sé)";
  if (rk === "0") return "Factor controlado";
  if (rk === "1") return "Factor mejorable";
  if (rk === "2") return "Factor relevante";
  return "Factor crítico";
}

function buildFactors(type, questionsById) {
  const selects = getPanelSelects(type);
  const factors = selects.map((select, index) => {
    const qid = String(select.dataset.qid || "").trim();
    const rawKey = String(select.value || "");
    const normalizedKey = normalizeKeyForMotor(rawKey);
    const pts = pointsForKey(normalizedKey);
    const text = factorTextFor(qid, type, rawKey);

    // Mantener "texto" como campo principal para lead flow; duplicar "text" por compatibilidad.
    const merged = safeText(text);
    return {
      qid,
      texto: merged,
      text: merged,
      puntos: pts,
      _priority: QID_PRIORITY[qid] ?? 0,
      _index: index,
    };
  });

  // Orden determinista: puntos desc, prioridad desc, orden original asc.
  factors.sort((a, b) => (b.puntos - a.puntos) || (b._priority - a._priority) || (a._index - b._index));

  // No romper UX: entregar top 5 para mejor matching de RULES (resultado.js corta a 3 chips).
  return factors.slice(0, 5).map(({ qid, texto, text, puntos }) => ({ qid, texto, text, puntos }));
}

function countUnknown(type) {
  const selects = getPanelSelects(type);
  return selects.reduce((acc, s) => acc + (String(s.value || "") === "U" ? 1 : 0), 0);
}

function confidenceScore(type) {
  const selects = getPanelSelects(type);
  if (selects.length === 0) return null;
  const unknown = countUnknown(type);
  const score = (1 - (unknown / selects.length)) * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function collectAnswersForMotor(type) {
  const selects = getPanelSelects(type);
  const answers = {};
  for (const select of selects) {
    const qid = String(select.dataset.qid || "").trim();
    const rawKey = String(select.value || "");
    answers[qid] = normalizeKeyForMotor(rawKey);
  }
  return answers;
}

function groupByBlock(questions) {
  const byBlock = new Map();
  for (const q of questions || []) {
    const block = String(q?.block || "").trim();
    if (!byBlock.has(block)) byBlock.set(block, []);
    byBlock.get(block).push(q);
  }
  return byBlock;
}

function renderQuestionsInto(root, type, questions) {
  if (!root) return;
  root.textContent = "";

  const byBlock = groupByBlock(questions);

  for (const block of BLOCK_ORDER) {
    const qs = byBlock.get(block);
    if (!qs || qs.length === 0) continue;

    const fieldset = document.createElement("fieldset");
    fieldset.className = "evaluador-fieldset";
    fieldset.setAttribute("aria-label", BLOCK_LABEL[block] || block);

    const legend = document.createElement("legend");
    legend.textContent = BLOCK_LABEL[block] || block;
    fieldset.appendChild(legend);

    const grid = document.createElement("div");
    grid.className = "evaluador-grid ps-evaluador-grid";

    for (const q of qs) {
      const qid = String(q?.id || "").trim();
      if (!qid) continue;

      const prefixedId = (type === "vivienda" ? "v_" : "c_") + qid;
      const hintId = prefixedId + "_hint";

      const field = document.createElement("div");
      field.className = "evaluador-field ps-evaluador-field";

      const label = document.createElement("label");
      label.setAttribute("for", prefixedId);
      label.textContent = safeText(q?.text);

      const select = document.createElement("select");
      select.id = prefixedId;
      select.name = prefixedId;
      select.required = true;
      select.tabIndex = 0;
      select.dataset.qid = qid;

      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "Selecciona una opción";
      select.appendChild(opt0);

      for (const opt of q?.options || []) {
        const o = document.createElement("option");
        o.value = String(opt?.key || "");
        o.textContent = safeText(opt?.label);
        select.appendChild(o);
      }

      field.appendChild(label);
      field.appendChild(select);

      const helpText = safeText(q?.help);
      if (helpText) {
        select.setAttribute("aria-describedby", hintId);

        const details = document.createElement("details");
        details.className = "ps-qhelp";
        details.id = hintId;

        const summary = document.createElement("summary");
        summary.textContent = "¿Por qué importa?";

        const body = document.createElement("div");
        body.className = "ps-qhelp-body";
        body.textContent = helpText;

        details.appendChild(summary);
        details.appendChild(body);
        field.appendChild(details);
      }
      grid.appendChild(field);
    }

    fieldset.appendChild(grid);
    root.appendChild(fieldset);
  }
}

function renderForms(questionsJson) {
  const viviendaRoot = getRootNode("vivienda");
  const comercioRoot = getRootNode("comercio");

  const common = Array.isArray(questionsJson?.questions_common) ? questionsJson.questions_common : [];
  const viv = Array.isArray(questionsJson?.questions_vivienda) ? questionsJson.questions_vivienda : [];
  const com = Array.isArray(questionsJson?.questions_comercio) ? questionsJson.questions_comercio : [];

  renderQuestionsInto(viviendaRoot, "vivienda", [...common, ...viv]);
  renderQuestionsInto(comercioRoot, "comercio", [...common, ...com]);

  // Reaplicar estado (disabled/display) con la lógica existente.
  const currentType = getActiveType();
  if (typeof window.cambiarFormulario === "function") {
    window.cambiarFormulario(currentType);
  }
  if (typeof window.psUpdateStepbarProgress === "function") {
    window.psUpdateStepbarProgress();
  }
}

function indexQuestionsById(questionsJson) {
  const map = Object.create(null);
  const sections = ["questions_common", "questions_vivienda", "questions_comercio"];
  for (const sec of sections) {
    const arr = questionsJson?.[sec];
    if (!Array.isArray(arr)) continue;
    for (const q of arr) {
      const id = String(q?.id || "").trim();
      if (id) map[id] = q;
    }
  }
  return map;
}

function adaptViviendaCeiling(engineResult) {
  // Renormaliza Vr excluyendo T para vivienda, sin tocar el motor.
  // Basado en subindexes + weights devueltos por calculateIEI().
  const sub = engineResult?.subindexes || {};
  const debug = engineResult?.debug || {};
  const weights = debug?.weights || {};

  const E = Number(sub.E ?? 0);
  const R = Number(sub.R ?? 0);
  const D = Number(sub.D ?? 0);
  const P = Number(sub.P ?? 0);
  const H = Number(sub.H ?? 0);
  const O = Number(sub.O ?? 0);

  const wE = Number(weights.wE ?? 0);
  const wR = Number(weights.wR ?? 0);
  const wH = Number(weights.wH ?? 0);
  const wD = Number(weights.wD ?? 0);
  const wP = Number(weights.wP ?? 0);

  const denomVr = wE + wR + wH;
  const Vr_adj = denomVr > 0 ? clamp01((wE * E + wR * R + wH * H) / denomVr) : 0;

  const denomMr = wD + wP;
  const Mr_protection = denomMr > 0
    ? clamp01((wD * (1 - D) + wP * (1 - P)) / denomMr)
    : 0;

  const ieiR_adj = 100
    * clamp01(0.15 + 0.85 * Vr_adj)
    * clamp01(0.35 + 0.65 * (1 - Mr_protection));

  // Mantener ieiO como lo devuelve el motor (ya aplica su propia formula/pesos).
  const ieiO = Number(engineResult?.ieiO ?? 0);

  const totalR = Number(weights.totalR ?? 0.75);
  const totalO = Number(weights.totalO ?? 0.25);
  const ieiTotal = (totalR * ieiR_adj) + (totalO * ieiO);

  return {
    ieiR_adj: Math.round(ieiR_adj),
    ieiO: Math.round(ieiO),
    ieiTotal: Math.round(Math.max(0, Math.min(100, ieiTotal))),
  };
}

const state = {
  ready: false,
  calculateIEI: null,
  questionsJson: null,
  questionsById: null,
};

// Bridge global: es la única fuente de verdad para calcularRiesgo().
window.calcularRiesgo = () => {
  try {
    const tipo = getActiveType();
    if (!tipo) {
      window.mostrarAlerta?.("Selecciona el tipo de inmueble antes de calcular tu Índice IEI™.");
      document.getElementById("tipo-inmueble")?.focus();
      return;
    }

    if (!state.ready) {
      window.mostrarAlerta?.("Cargando el formulario IEI… espera un momento e inténtalo de nuevo.");
      return;
    }

    // Validación existente (no tocar UX).
    if (typeof window.validarFormularioActivo === "function") {
      if (!window.validarFormularioActivo(tipo)) return;
    }

    const selects = getPanelSelects(tipo);
    const expectedCount = (() => {
      const q = state.questionsJson;
      if (!q) return null;
      const common = Array.isArray(q.questions_common) ? q.questions_common.length : 0;
      const specific = tipo === "vivienda"
        ? (Array.isArray(q.questions_vivienda) ? q.questions_vivienda.length : 0)
        : (Array.isArray(q.questions_comercio) ? q.questions_comercio.length : 0);
      return common + specific;
    })();

    if (Number.isFinite(expectedCount) && expectedCount > 0 && selects.length !== expectedCount) {
      window.mostrarAlerta?.("No se pudo cargar el cuestionario IEI correctamente. Recarga la página e inténtalo de nuevo.");
      return;
    }

    const answers = collectAnswersForMotor(tipo);

    // Hard guarantee: nunca pasar "U" al motor.
    for (const v of Object.values(answers)) {
      if (String(v) === "U") {
        window.mostrarAlerta?.("Error interno: respuesta 'No lo sé' no normalizada. Recarga e inténtalo de nuevo.");
        return;
      }
    }

    const engine = state.calculateIEI;
    if (typeof engine !== "function") {
      window.mostrarAlerta?.("No se pudo cargar el motor IEI. Recarga la página e inténtalo de nuevo.");
      return;
    }

    const engineResult = engine(answers, tipo);

    let riskScore = Number(engineResult?.ieiTotal ?? 0);
    // Solo aplicar el fix de techo cuando el cuestionario NO tiene bloque T para vivienda.
    const shouldAdaptCeiling = (() => {
      if (tipo !== "vivienda") return false;
      const q = state.questionsJson;
      if (!q) return false;
      const common = Array.isArray(q.questions_common) ? q.questions_common : [];
      const viv = Array.isArray(q.questions_vivienda) ? q.questions_vivienda : [];
      const hasT = [...common, ...viv].some((qq) => String(qq?.block || "").trim() === "T");
      return !hasT;
    })();

    if (shouldAdaptCeiling) {
      const adjusted = adaptViviendaCeiling(engineResult);
      riskScore = adjusted.ieiTotal;
    }

    // IMPORTANTÍSIMO: nivel basado en score final.
    const riskLevel = riskLevelFromScore(riskScore);

    const factorsTop = buildFactors(tipo, state.questionsById || {});
    const conf = confidenceScore(tipo);

    const evaluation = {
      model_version: MODEL_VERSION,
      risk_score: riskScore,
      risk_level: riskLevel,
      tipo_inmueble: tipo,
      factores_top: factorsTop.map((f) => ({ texto: f.texto, text: f.text, puntos: f.puntos })),
      confidence_score: conf,
      generated_at: new Date().toISOString(),
    };

    window.sessionStorage.setItem("puntoSeguro.latestEvaluation", JSON.stringify(evaluation));

    window.PuntoSeguroAnalytics?.trackEvent("quiz_completed", {
      risk_level: riskLevel,
      risk_score: riskScore,
      tipo_inmueble: tipo,
      model_version: MODEL_VERSION,
      iei_level: riskLevel,
      iei_score: riskScore,
      confidence_score: conf,
    });

    window.location.href = "/resultado";
  } catch (error) {
    console.error("[IEI] calcularRiesgo error", error);
    window.mostrarAlerta?.("No se pudo calcular tu Índice IEI™. Revisa tus respuestas e inténtalo de nuevo.");
  }
};

async function loadJson(url) {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
  return res.json();
}

async function init() {
  try {
    const [{ calculateIEI }, questionsJson] = await Promise.all([
      import(MOTOR_URL),
      loadJson(QUESTIONS_URL),
    ]);

    state.calculateIEI = calculateIEI;
    state.questionsJson = questionsJson;
    state.questionsById = indexQuestionsById(questionsJson);

    renderForms(questionsJson);

    state.ready = true;
  } catch (error) {
    console.error("[IEI] init error", error);
    window.mostrarAlerta?.("No se pudo cargar el cuestionario IEI. Recarga la página e inténtalo de nuevo.");
    state.ready = false;
  }
}

init();
