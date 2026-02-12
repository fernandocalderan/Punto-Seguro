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
    if (level === "BAJO") return "badge badge-low";
    if (level === "MEDIO") return "badge badge-medium";
    if (level === "ALTO") return "badge badge-high";
    return "badge";
  }

  function explanation(level) {
    if (level === "ALTO") {
      return "Tu exposición es alta: conviene contrastar de forma prioritaria las capas de detección y tiempos de respuesta.";
    }
    if (level === "MEDIO") {
      return "Tu exposición es moderada: hay puntos mejorables para reducir previsibilidad y oportunidad de intrusión.";
    }
    return "Tu exposición es contenida: mantener revisión periódica ayuda a conservar este nivel.";
  }

  function recommendations(level) {
    if (level === "ALTO") {
      return [
        "Revisar con un proveedor homologado los puntos de acceso con mayor tiempo de exposición.",
        "Contrastar opciones de detección temprana y protocolo de respuesta en franjas críticas.",
        "Definir una priorización por fases para reducir riesgo sin sobredimensionar inversión.",
      ];
    }

    if (level === "MEDIO") {
      return [
        "Verificar qué accesos o rutinas generan mayor previsibilidad y priorizar su ajuste.",
        "Comparar dos propuestas técnicas para equilibrar cobertura, coste y tiempos de atención.",
        "Alinear medidas físicas y hábitos operativos para evitar puntos ciegos frecuentes.",
      ];
    }

    return [
      "Mantener revisión periódica de cerramientos y puntos sensibles de acceso.",
      "Comprobar que hábitos diarios no incrementen la observabilidad del inmueble.",
      "Solicitar validación externa anual para detectar desajustes progresivos.",
    ];
  }

  function humanTranslation(level) {
    if (level === "ALTO") {
      return "El patrón coincide con escenarios de intrusión cuando el inmueble queda sin presencia.";
    }
    if (level === "MEDIO") {
      return "Hay varios puntos típicos de acceso oportunista que conviene revisar con criterio técnico.";
    }
    return "No se detecta exposición relevante actualmente, aunque conviene mantener revisión periódica.";
  }

  const evaluation = readEvaluation();
  if (!evaluation) {
    window.location.href = "/diagnostico";
    return;
  }

  const score = Number(evaluation.risk_score || 0);
  const level = String(evaluation.risk_level || "MEDIO").toUpperCase();

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
  explanationNode.textContent = explanation(level);
  humanTextNode.textContent = humanTranslation(level);

  recommendationsNode.innerHTML = recommendations(level)
    .map((item) => `<li>${item}</li>`)
    .join("");

  const factorsTop = Array.isArray(evaluation.factores_top) ? evaluation.factores_top.slice(0, 3) : [];
  topFactorsNode.innerHTML = factorsTop.length > 0
    ? factorsTop.map((factor) => `<li>${factor.texto || "Factor de riesgo detectado"}</li>`).join("")
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
      summary: resumen,
      tipo_inmueble: evaluation.tipo_inmueble,
      factores_top: factorsTop,
      generated_at: evaluation.generated_at || new Date().toISOString(),
    })
  );

  window.PuntoSeguroAnalytics?.trackEvent("result_viewed", {
    risk_level: level,
    risk_score: score,
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
    });

    window.location.href = "/solicitar-propuesta";
  });
})();
