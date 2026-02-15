/* IEI – Evaluación Integral de Inmuebles (v1.0.0-premium-15x2)
   Adaptado para: Motor-IEI/iei_questions_premium.json (15 Vivienda + 15 Comercio, sin comunes)
   - Entrada: answers = { "V01":"2", "V02":"1", ... } (keys "0".."3" o "U")
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

function normalizeWeights(obj) {
  const keys = Object.keys(obj);
  const sum = keys.reduce((acc, k) => acc + (obj[k] || 0), 0);
  if (sum <= 0) return obj;
  const out = {};
  for (const k of keys) out[k] = (obj[k] || 0) / sum;
  return out;
}

/**
 * Modelo IEI (seguridad integral):
 * - Bloques de "riesgo/atractivo": S, E, R, H, T   (más alto = peor)
 * - Bloques de "capacidad defensiva": D, P         (más alto = peor)
 *
 * Fórmula base (0..100):
 *  IEI_R = 100 * (baseV + (1-baseV)*Vuln) * (baseM + (1-baseM)*(1-Protection))
 *
 * Donde:
 *  Vuln ∈ [0,1] = riesgo/atractivo agregado
 *  Protection ∈ [0,1] = "protección efectiva" agregada (a partir de D y P)
 *
 * Nota: D y P vienen como "inseguridad" (0=mejor, 1=peor). Por eso:
 *  Protection = 1 - mean(D,P)
 */
export function calculateIEI(answers, propertyType, context = {}) {
  if (propertyType !== "vivienda" && propertyType !== "comercio") {
    throw new Error("propertyType invalido. Usa 'vivienda' o 'comercio'.");
  }

  const safeAnswers = answers && typeof answers === "object" ? answers : {};

  // Mapeo: key "0".."3" (y "U") -> s en [0,1]
  // (U) se trata como riesgo medio-alto para evitar "regalar" seguridad sin datos.
  const scoreMap = { "0": 0.0, "1": 0.33, "2": 0.66, "3": 1.0, "U": 0.66 };
  const UNKNOWN_KEY = "U";

  // Bloques por ID (DEBE coincidir con el JSON)
  const blockById = {
    // Vivienda V01..V15
    V01: "S",
    V02: "E", V03: "E",
    V04: "R", V05: "R", V06: "R",
    V07: "D", V08: "D", V09: "D",
    V10: "P", V11: "P", V12: "P",
    V13: "H", V14: "H",
    V15: "T",

    // Comercio C01..C15
    C01: "S",
    C02: "T", C03: "T",
    C04: "E", C05: "E", C06: "E",
    C07: "R", C08: "R", C09: "R",
    C10: "H", C11: "H", C12: "H",
    C13: "D", C14: "D",
    C15: "P"
  };

  // Preguntas esperadas (15 exactas por tipo)
  const expectedAll = (propertyType === "vivienda")
    ? ["V01","V02","V03","V04","V05","V06","V07","V08","V09","V10","V11","V12","V13","V14","V15"]
    : ["C01","C02","C03","C04","C05","C06","C07","C08","C09","C10","C11","C12","C13","C14","C15"];

  // Captura scores por bloque
  const byBlock = { S: [], E: [], R: [], D: [], P: [], H: [], T: [] };

  // Métricas de calidad de datos
  let missingCount = 0;
  let unknownCount = 0;
  let invalidCount = 0;

  for (const qid of expectedAll) {
    const block = blockById[qid];
    if (!block) continue;

    let optKey = safeAnswers[qid];
    optKey = (optKey === null || optKey === undefined) ? null : String(optKey);

    // Si falta respuesta: tratar como U (riesgo medio-alto) + baja confianza
    if (optKey === null) {
      missingCount += 1;
      optKey = UNKNOWN_KEY;
    }

    // Si key no es válida: tratar como U (dato sucio)
    if (!(optKey in scoreMap)) {
      invalidCount += 1;
      optKey = UNKNOWN_KEY;
    }

    if (optKey === UNKNOWN_KEY) unknownCount += 1;

    const s = scoreMap[optKey];
    byBlock[block].push(s);
  }

  // Subíndices (0..1): media por bloque
  const S = clamp01(mean(byBlock.S));
  const E = clamp01(mean(byBlock.E));
  const R = clamp01(mean(byBlock.R));
  const D = clamp01(mean(byBlock.D));
  const P = clamp01(mean(byBlock.P));
  const H = clamp01(mean(byBlock.H));
  const T = clamp01(mean(byBlock.T));

  // Protección efectiva (0..1): cuanto más cerca de 1, mejor protegido
  // D y P son "inseguridad" (0 mejor, 1 peor).
  const protection = clamp01(1 - mean([D, P]));

  // FACTOR TERRITORIAL (opcional, no rompe nada)
  // - Si mañana metes CCAA/ciudad en el flujo, puedes pasar:
  //   context.territorialRisk01 ∈ [0,1]
  // - 0 = zona tranquila, 1 = zona caliente
  const territorialRisk01 = (typeof context.territorialRisk01 === "number")
    ? clamp01(context.territorialRisk01)
    : null;

  // -------------------------
  // PESOS POR TIPO (expertise)
  // -------------------------
  // Robo/Intrusión:
  // - Vivienda: manda R (cerramientos) + E (exposición) + H (hábitos) + T (atractivo) + S (tipología)
  // - Comercio: manda T (atractivo/sector/stock) + R (barrera física) + E (exposición) + H (operativa)
  const weightsR = (propertyType === "vivienda")
    ? normalizeWeights({ S: 0.10, E: 0.20, R: 0.30, H: 0.20, T: 0.20 })
    : normalizeWeights({ S: 0.08, E: 0.18, R: 0.24, H: 0.18, T: 0.32 });

  // Ocupación/Usurpación:
  // - Vivienda: pesa más H (rutinas/control/llaves) + E (baja vigilancia) + S (tipología)
  // - Comercio: existe, pero menos relevante; aún así, cierres prolongados y control importan.
  const weightsO = (propertyType === "vivienda")
    ? normalizeWeights({ S: 0.20, E: 0.30, H: 0.40, R: 0.10 })
    : normalizeWeights({ S: 0.15, E: 0.20, H: 0.50, R: 0.15 });

  // Vulnerabilidad robo/intrusión (0..1)
  let vulnR = clamp01(
    weightsR.S * S +
    weightsR.E * E +
    weightsR.R * R +
    weightsR.H * H +
    weightsR.T * T
  );

  // Vulnerabilidad ocupación/usurpación (0..1)
  let vulnO = clamp01(
    weightsO.S * S +
    weightsO.E * E +
    weightsO.H * H +
    (weightsO.R ? weightsO.R * R : 0)
  );

  // Ajuste territorial (si se proporciona)
  // Subimos vulnerabilidad (no protección) porque el entorno aumenta probabilidad.
  // Impacto moderado para no “matar” el modelo sin datos: +0..+0.12
  if (territorialRisk01 !== null) {
    const bump = 0.12 * territorialRisk01;
    vulnR = clamp01(vulnR + bump);
    vulnO = clamp01(vulnO + (0.08 * territorialRisk01));
  }

  // -------------------------
  // Fórmulas IEI (0..100)
  // -------------------------
  // baseV: evita 0 absoluto (siempre hay riesgo residual)
  // baseM: evita que una casa “muy protegida” marque 0 (riesgo residual existe)
  const baseV_R = 0.18;
  const baseM_R = 0.28;

  const baseV_O = 0.12;
  const baseM_O = 0.35;

  // Robo/Intrusión: vulnerabilidad * (1 - protección)
  const ieiR = 100
    * clamp01(baseV_R + (1 - baseV_R) * vulnR)
    * clamp01(baseM_R + (1 - baseM_R) * (1 - protection));

  // Ocupación/Usurpación: más dependiente de hábitos/entorno, pero también de protección
  const ieiO = 100
    * clamp01(baseV_O + (1 - baseV_O) * vulnO)
    * clamp01(baseM_O + (1 - baseM_O) * (1 - protection));

  // Total ponderado (según tipo)
  // - Vivienda: ocupación pesa más que en comercio.
  // - Comercio: foco principal = robo/intrusión.
  const totalWeights = (propertyType === "vivienda")
    ? { R: 0.78, O: 0.22 }
    : { R: 0.92, O: 0.08 };

  const ieiTotal = (totalWeights.R * ieiR) + (totalWeights.O * ieiO);

  // -------------------------
  // Confianza (0..100)
  // -------------------------
  const totalQ = expectedAll.length; // 15
  const completion = clamp01((totalQ - missingCount) / totalQ);

  const unknownRate = clamp01(unknownCount / totalQ);
  const dirtyRate = clamp01((missingCount + invalidCount) / totalQ);

  // Penalización (más dura con missing/invalid que con U)
  const confidence01 = clamp01(
    0.98 * completion
    - 0.28 * unknownRate
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
      S: Number(S.toFixed(2)),
      E: Number(E.toFixed(2)),
      R: Number(R.toFixed(2)),
      D: Number(D.toFixed(2)),
      P: Number(P.toFixed(2)),
      H: Number(H.toFixed(2)),
      T: Number(T.toFixed(2)),
      protection: Number(protection.toFixed(2))
    },
    confidence,
    debug: {
      expectedQuestions: expectedAll,
      counts: { totalQ, missingCount, unknownCount, invalidCount },
      rates: {
        completion: Number(completion.toFixed(3)),
        unknownRate: Number(unknownRate.toFixed(3)),
        dirtyRate: Number(dirtyRate.toFixed(3))
      },
      core: {
        vulnR: Number(vulnR.toFixed(3)),
        vulnO: Number(vulnO.toFixed(3)),
        protection: Number(protection.toFixed(3)),
        territorialRisk01: territorialRisk01
      },
      weights: {
        weightsR,
        weightsO,
        totalWeights
      }
    }
  };
}
