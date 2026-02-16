#!/usr/bin/env node

const URGENCY_CAL = {
  weights: {
    A: { p: 0.50, i: 0.35, s: 0.15 },
    B: { p: 0.55, i: 0.30, s: 0.15 },
  },
  synergyDiv: { A: 14, B: 10 },
  boostK: { A: 0.22, B: 0.35 },
  gamma: { A: 1.05, B: 1.20 },
  confidenceFloor: { A: 0.80, B: 0.78 },
};

const N = 50000;

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function randomTriangular(min, mode, max) {
  const u = Math.random();
  const f = (mode - min) / (max - min);
  if (u < f) {
    return min + Math.sqrt(u * (max - min) * (mode - min));
  }
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

function randomNormal(mean, std) {
  // Box-Muller transform
  const u1 = Math.max(Number.EPSILON, Math.random());
  const u2 = Math.random();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * std;
}

function samplePoisson(lambda) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

function computeActivationFactor(meta, variant) {
  const v = variant in URGENCY_CAL.weights ? variant : "B";
  const w = URGENCY_CAL.weights[v];
  const div = URGENCY_CAL.synergyDiv[v];

  const p = clamp01(Number(meta?.probabilityIndex || 0) / 100);
  const i = clamp01(Number(meta?.impactIndex || 0) / 100);
  const s = clamp01(Number(meta?.synergyPoints || 0) / div);
  const c = clamp01(Number(meta?.confidenceScore || 70) / 100);

  let exposure = clamp01(w.p * p + w.i * i + w.s * s);

  const g = URGENCY_CAL.gamma[v];
  exposure = clamp01(Math.pow(exposure, 1 / g));

  const floor = URGENCY_CAL.confidenceFloor[v];
  const confMult = clamp01(floor + (1 - floor) * c);

  return clamp01(exposure * confMult);
}

function computeUrgencyScore(baseScore, FA, variant) {
  const v = variant in URGENCY_CAL.boostK ? variant : "B";
  const k = URGENCY_CAL.boostK[v];
  const boosted = Number(baseScore || 0) * (1 + k * FA);
  return Math.round(Math.max(0, Math.min(100, boosted)));
}

function urgencyBand(score) {
  if (score >= 78) return "MUY ALTA";
  if (score >= 58) return "ALTA";
  if (score >= 38) return "MEDIA";
  return "BAJA";
}

function percentile(sortedArr, p) {
  if (!sortedArr.length) return 0;
  const idx = (sortedArr.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  const w = idx - lo;
  return sortedArr[lo] * (1 - w) + sortedArr[hi] * w;
}

function summarize(scores) {
  const sorted = scores.slice().sort((a, b) => a - b);
  const mean = sorted.reduce((acc, v) => acc + v, 0) / sorted.length;
  return {
    mean,
    p50: percentile(sorted, 0.50),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.90),
  };
}

function histogram(scores) {
  const bins = { BAJA: 0, MEDIA: 0, ALTA: 0, "MUY ALTA": 0 };
  for (const s of scores) bins[urgencyBand(s)] += 1;
  return bins;
}

function printReport(variant, scores) {
  const bins = histogram(scores);
  const stats = summarize(scores);
  const total = scores.length || 1;

  function row(label) {
    const n = bins[label] || 0;
    const pct = (100 * n) / total;
    return `${label.padEnd(8)}: ${String(n).padStart(6)} (${pct.toFixed(2)}%)`;
  }

  console.log(`\n=== Variante ${variant} ===`);
  console.log("Histograma:");
  console.log(`- ${row("BAJA")}`);
  console.log(`- ${row("MEDIA")}`);
  console.log(`- ${row("ALTA")}`);
  console.log(`- ${row("MUY ALTA")}`);
  console.log("Estadísticos:");
  console.log(`- media: ${stats.mean.toFixed(2)}`);
  console.log(`- p50:   ${stats.p50.toFixed(2)}`);
  console.log(`- p75:   ${stats.p75.toFixed(2)}`);
  console.log(`- p90:   ${stats.p90.toFixed(2)}`);
}

function runSimulation() {
  const scoresA = [];
  const scoresB = [];

  for (let i = 0; i < N; i += 1) {
    const probabilityIndex = clamp(randomTriangular(20, 55, 90), 0, 100);
    const impactIndex = clamp(randomTriangular(15, 50, 95), 0, 100);
    const synergyPoints = clamp(samplePoisson(2.4), 0, 8); // poisson-like, más masa en 0..3
    const confidenceScore = clamp(randomNormal(78, 8), 60, 95);
    const baseScore = clamp(randomNormal(40, 8), 25, 55);

    const meta = {
      probabilityIndex,
      impactIndex,
      synergyPoints,
      confidenceScore,
    };

    const faA = computeActivationFactor(meta, "A");
    const faB = computeActivationFactor(meta, "B");

    scoresA.push(computeUrgencyScore(baseScore, faA, "A"));
    scoresB.push(computeUrgencyScore(baseScore, faB, "B"));
  }

  console.log(`Simulación de urgencia operativa - muestras: ${N}`);
  printReport("A", scoresA);
  printReport("B", scoresB);
}

runSimulation();

