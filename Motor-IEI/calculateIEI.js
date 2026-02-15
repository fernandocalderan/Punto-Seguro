/* IEI – Evaluación Integral de Inmuebles (v1.1-p)
   Adaptado para: iei_questions_premium.json
   - Entrada: answers = { "E1":"2", "R1":"1", ... } (keys "0".."3" o "U")
   - propertyType: "vivienda" | "comercio"
   - Salida: { ieiR, ieiO, ieiTotal, level, levelLabel, subindexes, confidence, debug }
*/

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function levelFromScore(score) {
  if (score <= 25) return "Bajo";
  if (score <= 50) return "Medio";
  if (score <= 75) return "Alto";
  return "Critico"; // compatibilidad
}

function levelLabel(level) {
  if (level === "Critico") return "Crítico";
  return level;
}

export function calculateIEI(answers, propertyType) {
  if (propertyType !== "vivienda" && propertyType !== "comercio") {
    throw new Error("propertyType invalido. Usa 'vivienda' o 'comercio'.");
  }

  const safeAnswers = answers && typeof answers === "object" ? answers : {};

  // Mapeo premium: key "0".."3" (y "U") -> s en [0,1]
  const scoreMap = { "0": 0.0, "1": 0.33, "2": 0.66, "3": 1.0, "U": 0.66 };
  const UNKNOWN_KEY = "U";

  // Asignación de bloques por ID (DEBE coincidir con iei_questions_premium.json)
  const blockById = {
    // Common
    E1: "E",
    R1: "R", R2: "R",
    D1: "D", D2: "D",
    P1: "P",

    // Vivienda
    H1V: "H", H2V: "H",
    O1V: "O",
    T1V: "T",

    // Comercio
    H1C: "H",
    O1C: "O",
    T1C: "T", T2C: "T", T3C: "T"
  };

  // Preguntas esperadas (para no “regalar seguridad” con respuestas incompletas)
  const expectedCommon = ["E1","R1","R2","D1","D2","P1"];
  const expectedSpecific = (propertyType === "vivienda")
    ? ["H1V","H2V","O1V","T1V"]
    : ["H1C","O1C","T1C","T2C","T3C"];

  const expectedAll = [...expectedCommon, ...expectedSpecific];

  // Captura scores por bloque
  const byBlock = { E: [], R: [], D: [], P: [], H: [], T: [], O: [] };

  // Métricas de calidad de datos
  let missingCount = 0;
  let unknownCount = 0;
  let invalidCount = 0;

  for (const qid of expectedAll) {
    const block = blockById[qid];
    if (!block) continue;

    let optKey = safeAnswers[qid];

    // Normalización
    optKey = (optKey === null || optKey === undefined) ? null : String(optKey);

    // Si falta respuesta: tratar como "U" (riesgo medio-alto) + baja confianza
    if (optKey === null) {
      missingCount += 1;
      optKey = UNKNOWN_KEY;
    }

    // Si key no es válida: tratar como "U"
    if (!(optKey in scoreMap)) {
      invalidCount += 1;
      optKey = UNKNOWN_KEY;
    }

    if (optKey === UNKNOWN_KEY) unknownCount += 1;

    const s = scoreMap[optKey];
    byBlock[block].push(s);
  }

  // Subíndices (0..1): media por bloque
  const E = clamp01(mean(byBlock.E));
  const R = clamp01(mean(byBlock.R));
  const D = clamp01(mean(byBlock.D));
  const P = clamp01(mean(byBlock.P));
  const H = clamp01(mean(byBlock.H));
  const T = clamp01(mean(byBlock.T));
  const O = clamp01(mean(byBlock.O));

  // Pesos por tipo de inmueble (premium v1)
  // Nota: D y P en este modelo son “inseguridad” (0 = mejor, 1 = peor),
  // y se invierten en mitigación con (1 - D) y (1 - P).
  const weights = (propertyType === "vivienda")
    ? {
        // IEI-R (Robo/Intrusión)
        wE: 0.18, wR: 0.34, wH: 0.18, wT: 0.30,
        wD: 0.55, wP: 0.45,
        // IEI-O (Ocupación/Usurpación)
        vE: 0.25, vO: 0.45, vH: 0.30,
        uD: 0.40, uP: 0.60,
        // Total
        totalR: 0.75, totalO: 0.25
      }
    : {
        // IEI-R
        wE: 0.15, wR: 0.30, wH: 0.20, wT: 0.35,
        wD: 0.50, wP: 0.50,
        // IEI-O
        vE: 0.20, vO: 0.35, vH: 0.45,
        uD: 0.35, uP: 0.65,
        // Total
        totalR: 0.90, totalO: 0.10
      };

  // Normalización defensiva
  const sumVrW = weights.wE + weights.wR + weights.wH + weights.wT;
  const sumMrW = weights.wD + weights.wP;
  const sumVoW = weights.vE + weights.vO + weights.vH;
  const sumMoW = weights.uD + weights.uP;

  // Vulnerabilidad robo/intrusión
  const Vr = clamp01((weights.wE * E + weights.wR * R + weights.wH * H + weights.wT * T) / sumVrW);

  // Mitigación (protección) robo/intrusión: invertimos D y P porque en inputs 0=mejor
  const Mr_protection = clamp01((weights.wD * (1 - D) + weights.wP * (1 - P)) / sumMrW);

  // Vulnerabilidad ocupación/usurpación
  const Vo = clamp01((weights.vE * E + weights.vO * O + weights.vH * H) / sumVoW);

  // Mitigación (protección) ocupación/usurpación
  const Mo_protection = clamp01((weights.uD * (1 - D) + weights.uP * (1 - P)) / sumMoW);

  // Fórmulas IEI (0..100)
  const ieiR = 100
    * clamp01(0.15 + 0.85 * Vr)
    * clamp01(0.35 + 0.65 * (1 - Mr_protection));

  const ieiO = 100
    * clamp01(0.10 + 0.90 * Vo)
    * clamp01(0.40 + 0.60 * (1 - Mo_protection));

  const ieiTotal = (weights.totalR * ieiR) + (weights.totalO * ieiO);

  // Confianza (0..100): penaliza faltantes, "U" e inválidos.
  // - faltante: penaliza más que "U" explícito
  // - inválido: penaliza parecido a faltante (dato sucio)
  const totalQ = expectedAll.length;
  const completion = clamp01((totalQ - missingCount) / totalQ);

  // Penalizaciones calibradas para UX real:
  // - U indica incertidumbre: reduce, pero no mata
  // - faltante/invalid: reduce más (por consistencia de evaluación)
  const unknownRate = clamp01(unknownCount / totalQ);
  const dirtyRate = clamp01((missingCount + invalidCount) / totalQ);

  const confidence01 = clamp01(
    0.95 * completion
    - 0.35 * unknownRate
    - 0.55 * dirtyRate
  );

  const confidence = Math.round(100 * confidence01);

  const lvl = levelFromScore(ieiTotal);

  return {
    ieiR: Math.round(ieiR),
    ieiO: Math.round(ieiO),
    ieiTotal: Math.round(ieiTotal),
    level: lvl,
    levelLabel: levelLabel(lvl),
    subindexes: {
      E: Number(E.toFixed(2)),
      R: Number(R.toFixed(2)),
      D: Number(D.toFixed(2)),
      P: Number(P.toFixed(2)),
      H: Number(H.toFixed(2)),
      T: Number(T.toFixed(2)),
      O: Number(O.toFixed(2))
    },
    confidence,
    debug: {
      expectedQuestions: expectedAll,
      counts: {
        totalQ,
        missingCount,
        unknownCount,
        invalidCount
      },
      rates: {
        completion: Number(completion.toFixed(3)),
        unknownRate: Number(unknownRate.toFixed(3)),
        dirtyRate: Number(dirtyRate.toFixed(3))
      },
      core: {
        Vr: Number(Vr.toFixed(3)),
        Mr_protection: Number(Mr_protection.toFixed(3)),
        Vo: Number(Vo.toFixed(3)),
        Mo_protection: Number(Mo_protection.toFixed(3))
      },
      weights
    }
  };
}
