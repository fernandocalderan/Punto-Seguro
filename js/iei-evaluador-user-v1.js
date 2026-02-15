/* IEI (usuario v1) – Premium 15x2
   - Render data-driven desde /Motor-IEI/iei_questions_premium.json
   - Calcula con /Motor-IEI/calculateIEI.js (ESM)
   - Bridge global window.calcularRiesgo() para mantener UX/handlers inline
   - NO toca resultado.js: respeta contrato sessionStorage → /resultado → lead flow

   ACTUALIZADO a:
   - questions_vivienda (V01..V15)
   - questions_comercio (C01..C15)
   - bloques: S,E,R,D,P,H,T
*/

const QUESTIONS_URL = "/Motor-IEI/iei_questions_premium.json";
const MOTOR_URL = "/Motor-IEI/calculateIEI.js";

const MODEL_VERSION = "IEI-user-v1-premium-15x2";

// Para chips/factores (resultado.js): 0..100
const SCORE_KEY_TO_POINTS = { "0": 0, "1": 33, "2": 66, "3": 100, "U": 66 };

// Orden y nombres de bloques (alineado con JSON nuevo)
const BLOCK_ORDER = ["S", "E", "R", "D", "P", "H", "T"];
const BLOCK_LABEL = {
  S: "Segmento",
  E: "Exposición y entorno",
  R: "Resistencia física",
  D: "Detección y cobertura",
  P: "Respuesta y disuasión",
  H: "Hábitos / operativa",
  T: "Atractivo del objetivo",
};

// Prioridades para top-factors (para que resultado.js “pille” lo importante)
const QID_PRIORITY = {
  // Vivienda
  V11: 1000, // alarma / CRA
  V12: 950,  // verificación
  V04: 920,  // puerta
  V05: 900,  // ventanas
  V03: 860,  // iluminación
  V02: 840,  // puntos ciegos / exposición
  V13: 820,  // rutinas/ausencias
  V14: 780,  // llaves/códigos
  V10: 740,  // tiempo respuesta
  V09: 720,  // disuasión visible
  V06: 700,  // accesos secundarios
  V15: 680,  // atractivo percibido

  // Comercio
  C13: 1000, // detección rápida
  C15: 960,  // tiempo respuesta
  C06: 930,  // persiana/cierre exterior
  C07: 900,  // puerta/frente
  C08: 880,  // cristal/escaparate
  C02: 860,  // stock revendible
  C01: 840,  // sector
  C03: 820,  // valor visible
  C12: 780,  // cierres prolongados (ausencia)
  C11: 740,  // protocolo cierre
  C10: 720,  // control accesos
  C14: 700,  // cobertura CCTV/zonas
  C09: 680,  // acceso trasero
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

/**
 * Textos compatibles con RULES de /js/resultado.js (sin tocarlo).
 * IMPORTANTE:
 * - Mantener frases “gatillo” conocidas (Sin alarma, Sin cámaras, Ventanas sin protección, etc.)
 * - Evitar falsos positivos cuando respuesta es segura ("0"/"1") o "U".
 */
function factorTextFor(qid, type, rawKey) {
  const rk = String(rawKey || "");

  // Helpers
  const isUnknown = rk === "U";
  const isHigh = rk === "3" || rk === "2";
  const isMed = rk === "1";
  const isLow = rk === "0";

  // ---- VIVIENDA ----
  if (qid === "V03") { // iluminación
    if (isHigh) return "Iluminación deficiente / puntos ciegos";
    if (isMed) return "Luz exterior mejorable";
    if (isLow) return "Luz exterior suficiente";
    return "Luz exterior (no lo sé)";
  }

  if (qid === "V02") { // exposición / puntos ciegos
    if (isHigh) return "Puntos ciegos / visibilidad baja";
    if (isMed) return "Visibilidad parcial";
    if (isLow) return "Acceso visible";
    return "Visibilidad/control (no lo sé)";
  }

  if (qid === "V04") { // puerta
    if (rk === "3") return "Puerta principal vulnerable";
    if (rk === "2") return "Puerta principal estándar";
    if (rk === "1") return "Puerta principal robusta";
    if (rk === "0") return "Puerta principal muy robusta";
    return "Puerta principal (no lo sé)";
  }

  if (qid === "V05") { // ventanas
    if (rk === "3") return "Ventanas sin protección";
    if (rk === "2") return "Ventanas con poca protección";
    if (rk === "1") return "Cerramientos exteriores mejorables";
    if (rk === "0") return "Cerramientos exteriores robustos";
    return "Cerramientos exteriores (no lo sé)";
  }

  if (qid === "V06") { // accesos secundarios
    if (rk === "3") return "Accesos secundarios vulnerables";
    if (rk === "2") return "Accesos secundarios mejorables";
    if (rk === "1" || rk === "0") return "Accesos secundarios controlados";
    return "Accesos secundarios (no lo sé)";
  }

  if (qid === "V11") { // alarma/conectividad (gatillo clave)
    if (rk === "3") return "Sin alarma";
    if (rk === "2") return "Alarma básica";
    if (rk === "1" || rk === "0") return "Alarma presente";
    return "Alarma (no lo sé)";
  }

  if (qid === "V12") { // verificación
    if (isHigh) return "Sin verificación";
    if (isMed) return "Verificación limitada";
    if (isLow) return "Verificación presente";
    return "Verificación (no lo sé)";
  }

  if (qid === "V07") { // detección rápida (si falla, disparar estilo “sin detección”)
    if (isHigh) return "Sin detección rápida";
    if (isMed) return "Detección mejorable";
    if (isLow) return "Detección rápida";
    return "Detección (no lo sé)";
  }

  if (qid === "V08") { // cobertura
    if (isHigh) return "Cobertura deficiente / puntos ciegos";
    if (isMed) return "Cobertura mejorable";
    if (isLow) return "Cobertura adecuada";
    return "Cobertura (no lo sé)";
  }

  if (qid === "V09") { // disuasión visible
    if (rk === "3") return "Sin disuasión visible";
    if (rk === "2") return "Poca disuasión visible";
    if (rk === "1") return "Algo de disuasión visible";
    if (rk === "0") return "Disuasión visible";
    return "Disuasión (no lo sé)";
  }

  if (qid === "V10") { // respuesta
    if (rk === "3") return "Respuesta lenta (>40 min)";
    if (rk === "2") return "Respuesta lenta (20–40 min)";
    if (rk === "1") return "Respuesta media (10–20 min)";
    if (rk === "0") return "Respuesta rápida (<10 min)";
    return "Tiempo de respuesta (no lo sé)";
  }

  if (qid === "V13") { // rutinas/ausencias
    if (isHigh) return "Ausencias previsibles";
    if (isMed) return "Rutina algo predecible";
    if (isLow) return "Rutina variable";
    return "Rutinas (no lo sé)";
  }

  if (qid === "V14") { // llaves/códigos
    if (rk === "3") return "Llaves/códigos descontrolados";
    if (rk === "2") return "Llaves/códigos poco controlados";
    if (rk === "1") return "Llaves/códigos bastante controlados";
    if (rk === "0") return "Llaves/códigos muy controlados";
    return "Llaves/códigos (no lo sé)";
  }

  if (qid === "V15") { // atractivo
    if (isHigh) return "Objetivo atractivo";
    if (isMed) return "Atractivo medio";
    if (isLow) return "Atractivo bajo";
    return "Atractivo (no lo sé)";
  }

  // ---- COMERCIO ----
  if (qid === "C06") { // persiana/cierre
    if (isHigh) return "Cierre/persiana vulnerable";
    if (isMed) return "Frente del local mejorable";
    if (isLow) return "Frente del local protegido";
    return "Frente del local (no lo sé)";
  }

  if (qid === "C07") { // puerta principal (frente)
    if (isHigh) return "Frente del local mejorable";
    if (isLow || isMed) return "Frente del local protegido";
    return "Frente del local (no lo sé)";
  }

  if (qid === "C08") { // cristal
    if (isHigh) return "Cristal vulnerable";
    if (isMed) return "Cristal mejorable";
    if (isLow) return "Cristal resistente";
    return "Cristal (no lo sé)";
  }

  if (qid === "C13") { // detección rápida
    if (isHigh) return "Sin detección rápida";
    if (isMed) return "Detección mejorable";
    if (isLow) return "Detección rápida";
    return "Detección (no lo sé)";
  }

  if (qid === "C14") { // cobertura
    if (isHigh) return "Cobertura deficiente / puntos ciegos";
    if (isMed) return "Cobertura mejorable";
    if (isLow) return "Cobertura adecuada";
    return "Cobertura (no lo sé)";
  }

  if (qid === "C15") { // respuesta
    if (rk === "3") return "Respuesta lenta (>40 min)";
    if (rk === "2") return "Respuesta lenta (20–40 min)";
    if (rk === "1") return "Respuesta media (10–20 min)";
    if (rk === "0") return "Respuesta rápida (<10 min)";
    return "Tiempo de respuesta (no lo sé)";
  }

  if (qid === "C02") { // stock
    if (isHigh) return "Stock atractivo";
    if (isMed) return "Valor comercial medio";
    if (isLow) return "Valor comercial bajo";
    return "Valor comercial (no lo sé)";
  }

  if (qid === "C03") { // valor visible
    if (isHigh) return "Valor visible alto";
    if (isMed) return "Valor visible medio";
    if (isLow) return "Valor visible bajo";
    return "Valor visible (no lo sé)";
  }

  if (qid === "C12") { // cierres prolongados (ausencia)
    if (isHigh) return "Ausencia prolongada (local cerrado)";
    if (isMed) return "Cerrado ocasionalmente";
    if (isLow) return "Actividad regular";
    return "Local cerrado (no lo sé)";
  }

  // Fallback neutro (evita activar RULES por accidente)
  if (isUnknown) return "Factor (no lo sé)";
  if (rk === "0") return "Factor controlado";
  if (rk === "1") return "Factor mejorable";
  if (rk === "2") return "Factor relevante";
  return "Factor crítico";
}

function buildFactors(type) {
  const selects = getPanelSelects(type);

  const factors = selects.map((select, index) => {
    const qid = String(select.dataset.qid || "").trim();
    const rawKey = String(select.value || "");

    const pts = pointsForKey(rawKey);
    const text = factorTextFor(qid, type, rawKey);

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

  // Orden: puntos desc, prioridad desc, orden original asc
  factors.sort((a, b) => (b.puntos - a.puntos) || (b._priority - a._priority) || (a._index - b._index));

  // Entregar top 5 (resultado.js suele recortar a 3 chips)
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
    // El motor ya soporta "U". No lo forzamos.
    answers[qid] = rawKey;
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

  const viv = Array.isArray(questionsJson?.questions_vivienda) ? questionsJson.questions_vivienda : [];
  const com = Array.isArray(questionsJson?.questions_comercio) ? questionsJson.questions_comercio : [];

  renderQuestionsInto(viviendaRoot, "vivienda", viv);
  renderQuestionsInto(comercioRoot, "comercio", com);

  // Reaplicar estado (disabled/display) con la lógica existente.
  const currentType = getActiveType();
  if (typeof window.cambiarFormulario === "function") {
    window.cambiarFormulario(currentType);
  }
  if (typeof window.psUpdateStepbarProgress === "function") {
    window.psUpdateStepbarProgress();
  }
}

const state = {
  ready: false,
  calculateIEI: null,
  questionsJson: null,
};

// Bridge global: única fuente de verdad para calcular.
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

    // Garantía de integridad: 15 selects por tipo
    const selects = getPanelSelects(tipo);
    const expectedCount = 15;

    if (selects.length !== expectedCount) {
      window.mostrarAlerta?.("No se pudo cargar el cuestionario IEI correctamente. Recarga la página e inténtalo de nuevo.");
      return;
    }

    const answers = collectAnswersForMotor(tipo);

    const engine = state.calculateIEI;
    if (typeof engine !== "function") {
      window.mostrarAlerta?.("No se pudo cargar el motor IEI. Recarga la página e inténtalo de nuevo.");
      return;
    }

    const engineResult = engine(answers, tipo);

    const riskScore = Number(engineResult?.ieiTotal ?? 0);
    const riskLevel = riskLevelFromScore(riskScore);

    const factorsTop = buildFactors(tipo);
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

    renderForms(questionsJson);

    state.ready = true;
  } catch (error) {
    console.error("[IEI] init error", error);
    window.mostrarAlerta?.("No se pudo cargar el cuestionario IEI. Recarga la página e inténtalo de nuevo.");
    state.ready = false;
  }
}

init();
