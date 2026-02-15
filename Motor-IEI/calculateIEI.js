/* IEI – Evaluación Integral de Inmuebles (v1)
   - Entrada: answers = { "E1":"2", "R4":"1", ... } (keys de opción "0".."3")
   - propertyType: "vivienda" | "comercio"
   - Salida: { ieiR, ieiO, ieiTotal, level, subindexes, debug }
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
  return "Critico";
}

export function calculateIEI(answers, propertyType) {
  if (propertyType !== "vivienda" && propertyType !== "comercio") {
    throw new Error("propertyType invalido. Usa 'vivienda' o 'comercio'.");
  }

  // Mapeo simple: key "0".."3" -> s en [0,1]
  const scoreMap = { "0": 0.0, "1": 0.33, "2": 0.66, "3": 1.0 };

  // Asignación de bloques por ID (debe coincidir con el JSON)
  const blockById = {
    E1: "E", E2: "E", E3: "E",
    R4: "R", R5: "R", R6: "R",
    D7: "D", D8: "D", D9: "D",
    P10: "P", P11: "P",
    H12: "H", H13: "H",

    // Vivienda
    O14V: "O", O15V: "O", O16V: "O",
    R17V: "R",
    H18V: "H",

    // Comercio
    T14C: "T", T15C: "T",
    R16C: "R",
    D17C: "D",
    O18C: "O"
  };

  // Captura scores por bloque
  const byBlock = { E: [], R: [], D: [], P: [], H: [], T: [], O: [] };

  for (const [qid, optKey] of Object.entries(answers || {})) {
    if (!(qid in blockById)) continue;
    const s = scoreMap[String(optKey)];
    if (typeof s !== "number") continue;
    byBlock[blockById[qid]].push(s);
  }

  // Subíndices (0..1): media por bloque (simple y robusto)
  // Si un bloque no aplica (ej. T en vivienda), quedará 0.
  const E = clamp01(mean(byBlock.E));
  const R = clamp01(mean(byBlock.R));
  const D = clamp01(mean(byBlock.D));
  const P = clamp01(mean(byBlock.P));
  const H = clamp01(mean(byBlock.H));
  const T = clamp01(mean(byBlock.T));
  const O = clamp01(mean(byBlock.O));

  // Pesos por tipo de inmueble
  const weights = (propertyType === "vivienda")
    ? {
        // IEI-R
        wE: 0.18, wR: 0.34, wH: 0.18, wT: 0.30,
        wD: 0.55, wP: 0.45,
        // IEI-O
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

  // Normalización defensiva (por si alguien edita pesos a mano)
  const sumVrW = weights.wE + weights.wR + weights.wH + weights.wT;
  const sumMrW = weights.wD + weights.wP;
  const sumVoW = weights.vE + weights.vO + weights.vH;
  const sumMoW = weights.uD + weights.uP;

  const Vr = clamp01(
    (weights.wE * E + weights.wR * R + weights.wH * H + weights.wT * T) / sumVrW
  );
  const Mr = clamp01(
    (weights.wD * (1 - D) + weights.wP * (1 - P)) / sumMrW
  );
  // Nota: D y P son "inseguridad" en inputs (0 seguro, 1 inseguro).
  // Por eso (1-D) y (1-P) representan "protección".
  // Luego Mr aquí lo guardamos como "protección"; abajo lo convertimos a (1 - protección).

  const Vo = clamp01(
    (weights.vE * E + weights.vO * O + weights.vH * H) / sumVoW
  );
  const Mo = clamp01(
    (weights.uD * (1 - D) + weights.uP * (1 - P)) / sumMoW
  );

  // Fórmulas IEI (0..100)
  // Robo/Intrusión: base + vulnerabilidad y penalización por falta de mitigación
  const ieiR = 100
    * clamp01(0.15 + 0.85 * Vr)
    * clamp01(0.35 + 0.65 * (1 - Mr));

  // Ocupación/Usurpación
  const ieiO = 100
    * clamp01(0.10 + 0.90 * Vo)
    * clamp01(0.40 + 0.60 * (1 - Mo));

  const ieiTotal = (weights.totalR * ieiR) + (weights.totalO * ieiO);

  const result = {
    ieiR: Math.round(ieiR),
    ieiO: Math.round(ieiO),
    ieiTotal: Math.round(ieiTotal),
    level: levelFromScore(ieiTotal),
    subindexes: {
      E: Number(E.toFixed(2)),
      R: Number(R.toFixed(2)),
      D: Number(D.toFixed(2)),
      P: Number(P.toFixed(2)),
      H: Number(H.toFixed(2)),
      T: Number(T.toFixed(2)),
      O: Number(O.toFixed(2))
    },
    debug: {
      Vr: Number(Vr.toFixed(3)),
      Mr_protection: Number(Mr.toFixed(3)),
      Vo: Number(Vo.toFixed(3)),
      Mo_protection: Number(Mo.toFixed(3)),
      weights
    }
  };

  return result;
}
