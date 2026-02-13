const { Resend } = require("resend");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatValue(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text ? escapeHtml(text) : fallback;
}

function providerSubject(lead) {
  const ieiLevel = lead?.risk_level || "Sin nivel";
  return `Nuevo lead asignado (IEI™ ${ieiLevel})`;
}

function resolvePublicBaseUrl(env) {
  const explicit = (env.PUBLIC_BASE_URL || env.APP_BASE_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  if (env.VERCEL_URL) return `https://${String(env.VERCEL_URL).trim()}`;

  const port = String(env.PORT || 3000).trim();
  return `http://localhost:${port}`;
}

function providerHtml(provider, lead, { baseUrl }) {
  function isEmptyValue(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim() === "";
    if (Array.isArray(value)) return value.length === 0;
    if (value instanceof Date) return false;
    if (typeof value === "object") return Object.keys(value).length === 0;
    return false;
  }

  function toDisplayValue(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return String(value);
    if (typeof value === "string") return value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.join(", ");
    return JSON.stringify(value, null, 2);
  }

  function row(label, value) {
    if (isEmptyValue(value)) return "";
    const text = toDisplayValue(value);
    if (isEmptyValue(text)) return "";

    return `
      <tr>
        <td style="padding: 8px 10px; border-bottom: 1px solid rgba(15,23,42,0.08); vertical-align: top; width: 34%;"><b>${escapeHtml(label)}</b></td>
        <td style="padding: 8px 10px; border-bottom: 1px solid rgba(15,23,42,0.08); vertical-align: top;">${escapeHtml(text)}</td>
      </tr>
    `.trim();
  }

  const createdAt = lead?.created_at || lead?.createdAt;
  const updatedAt = lead?.updated_at || lead?.updatedAt;
  const assignedAt = lead?.assigned_at || lead?.assignedAt;
  const acceptedAt = lead?.accepted_at || lead?.acceptedAt;
  const soldAt = lead?.sold_at || lead?.soldAt;
  const deletedAt = lead?.deleted_at || lead?.deletedAt;

  const ticketEstimated =
    lead?.ticket_estimated_eur ?? lead?.ticket_estimated ?? lead?.ticket_estimado ?? null;
  const price = lead?.price_eur ?? lead?.price ?? null;
  const consentIp = lead?.consent_ip ?? lead?.ip_consentimiento ?? lead?.ip ?? null;

  const providerIds =
    Array.isArray(lead?.provider_ids) ? lead.provider_ids : Array.isArray(lead?.providerIds) ? lead.providerIds : null;
  const providerPrimary = lead?.assigned_provider_id || lead?.assignedProviderId || null;

  const evaluationSummary = lead?.evaluation_summary ?? lead?.evaluationSummary ?? null;
  const evaluationSummaryText =
    evaluationSummary && typeof evaluationSummary === "string"
      ? evaluationSummary
      : evaluationSummary
        ? JSON.stringify(evaluationSummary, null, 2)
        : "";

  // Ensure `risk_score` exists for the provider template (DB stores it inside evaluation_summary).
  if (lead && Number.isFinite(Number(lead.risk_score))) {
    lead = { ...lead, risk_score: String(Math.round(Number(lead.risk_score))) };
  } else if (lead && (lead.risk_score === undefined || lead.risk_score === null || lead.risk_score === "")) {
    let scoreCandidate = null;

    if (evaluationSummary && typeof evaluationSummary === "object") {
      scoreCandidate = evaluationSummary.risk_score;
    } else if (typeof evaluationSummary === "string" && evaluationSummary.trim()) {
      try {
        const parsed = JSON.parse(evaluationSummary);
        scoreCandidate = parsed?.risk_score;
      } catch (_error) {
        scoreCandidate = null;
      }
    }

    if (Number.isFinite(Number(scoreCandidate))) {
      lead = { ...lead, risk_score: String(Math.round(Number(scoreCandidate))) };
    } else if (scoreCandidate !== null && scoreCandidate !== undefined && String(scoreCandidate).trim() !== "") {
      lead = { ...lead, risk_score: String(scoreCandidate).trim() };
    }
  }

  return `
<div style="font-family: Arial, sans-serif; background:#f5f7fa; padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

    <div style="padding:20px;border-bottom:1px solid #e5e7eb;">
      <h2 style="margin:0;">Nuevo lead asignado</h2>
    </div>

    ${(() => {
      const level = lead?.risk_level || "—";
      const score = lead?.risk_score || "";
      const colorMap = {
        "CONTROLADA": "#16a34a",
        "MODERADA": "#d97706",
        "ELEVADA": "#dc2626",
        "CRÍTICA": "#991b1b"
      };
      const color = colorMap[level] || "#374151";

      return `
        <div style="padding:20px;">
          <div style="font-size:28px;font-weight:700;color:${color};">
            IEI™ ${score ? score + "/100" : ""}
          </div>
          <div style="margin-top:6px;font-size:14px;color:#6b7280;">
            Nivel: <strong style="color:${color};">${escapeHtml(level)}</strong>
          </div>
        </div>
      `;
    })()}

    <div style="padding:20px;border-top:1px solid #e5e7eb;">
      <h3 style="margin-top:0;">Datos de contacto</h3>
      <p><strong>Nombre:</strong> ${formatValue(lead?.name)}</p>
      <p><strong>Teléfono:</strong> ${formatValue(lead?.phone)}</p>
      <p><strong>Email:</strong> ${formatValue(lead?.email)}</p>
      <p><strong>Ciudad:</strong> ${formatValue(lead?.city)}</p>
      <p><strong>Código Postal:</strong> ${formatValue(lead?.postal_code)}</p>
      <p><strong>Tipo:</strong> ${formatValue(lead?.business_type)}</p>
      <p><strong>Urgencia:</strong> ${formatValue(lead?.urgency)}</p>
      <p><strong>Presupuesto:</strong> ${formatValue(lead?.budget_range)}</p>
    </div>

    ${
      lead?.evaluation_summary
        ? `
        <div style="padding:20px;border-top:1px solid #e5e7eb;">
          <h3 style="margin-top:0;">Top factores detectados</h3>
          <ul style="padding-left:18px;margin:0;">
            ${
              (() => {
                try {
                  const parsed = typeof lead.evaluation_summary === "string"
                    ? JSON.parse(lead.evaluation_summary)
                    : lead.evaluation_summary;

                  const factors = parsed?.factores_top || parsed?.factors_top || [];
                  return factors.slice(0,3)
                    .map(f => `<li>${escapeHtml(f.texto || f.text || "")}</li>`)
                    .join("");
                } catch {
                  return "";
                }
              })()
            }
          </ul>
        </div>
        `
        : ""
    }

    <div style="padding:20px;border-top:1px solid #e5e7eb;text-align:center;">
      <a href="${escapeHtml(`${String(baseUrl || "").replace(/\/+$/, "")}/admin/leads`)}"
         style="display:inline-block;background:#2563eb;color:#ffffff;
         padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700;">
         Ver lead en admin
      </a>
    </div>

    <div style="padding:14px;background:#f9fafb;font-size:12px;color:#6b7280;text-align:center;">
      IEI™ es una evaluación orientativa. Lead enviado con consentimiento del usuario.
    </div>

  </div>
</div>
`.trim();
}

function userSubject() {
  return "Tu resumen IEI™ y solicitud enviada - Punto Seguro";
}

function parseEvaluationSummary(evaluationSummary) {
  try {
    const parsed = typeof evaluationSummary === "string" ? JSON.parse(evaluationSummary) : evaluationSummary;
    if (!parsed || typeof parsed !== "object") return null;

    const factors = parsed.factores_top || parsed.factors_top || [];
    return {
      risk_level: parsed.risk_level || null,
      risk_score: parsed.risk_score ?? null,
      tipo_inmueble: parsed.tipo_inmueble || null,
      factors: Array.isArray(factors) ? factors : [],
    };
  } catch {
    return null;
  }
}

function axisAdvice(tipo, riskLevel) {
  const t = String(tipo || "").toLowerCase();
  const level = String(riskLevel || "").toUpperCase();

  // acciones genéricas (sin prometer resultados)
  const common = [
    "Refuerza la disuasión visible (señalización, iluminación exterior, orden y mantenimiento).",
    "Reduce patrones previsibles de ausencia y mejora el control de accesos secundarios.",
    "Asegura una respuesta rápida ante evento (alarma conectada / verificación / protocolo).",
  ];

  if (t.includes("comercio")) {
    return [
      "Controla puntos de entrada y cerramientos (puerta, persiana/cierre, cristal).",
      "Evita dejar stock atractivo visible y revisa rutinas de apertura/cierre.",
      "Aumenta detección y verificación: sensores + cámara orientada a accesos.",
    ];
  }

  if (t.includes("vivienda")) {
    return [
      "Revisa puerta principal y puntos secundarios (ventanas, balcones, patio/terraza).",
      "Minimiza señales de ausencia (luces programadas, persianas, buzón, hábitos).",
      "Mejora detección temprana (sensores perimetrales/interiores + sirena/aviso).",
    ];
  }

  // fallback
  return common;
}

function userHtml(lead, providerCount) {
  const safeName = formatValue(lead?.name, "Hola");
  const count = Number.isFinite(Number(providerCount)) ? Number(providerCount) : 2;

  const diag = parseEvaluationSummary(lead?.evaluation_summary ?? lead?.evaluationSummary);
  const riskLevel = diag?.risk_level || lead?.risk_level || null;
  const riskScore = diag?.risk_score ?? lead?.risk_score ?? null;
  const tipo = diag?.tipo_inmueble || lead?.business_type || null;

  const factors = (diag?.factors || [])
    .slice(0, 3)
    .map(f => (f.texto || f.text || "").trim())
    .filter(Boolean);

  const advice = axisAdvice(tipo, riskLevel);

  const levelColor = {
    "CONTROLADA": "#16a34a",
    "MODERADA": "#d97706",
    "ELEVADA": "#dc2626",
    "CRÍTICA": "#991b1b"
  }[String(riskLevel || "").toUpperCase()] || "#374151";

  const scoreLine =
    typeof riskScore === "number" || (typeof riskScore === "string" && String(riskScore).trim() !== "")
      ? `IEI™ ${escapeHtml(String(riskScore))}/100`
      : "IEI™ (resultado orientativo)";

  const tipoLine = tipo ? escapeHtml(String(tipo)) : "-";

  return `
  <div style="font-family: Arial, sans-serif; background:#f5f7fa; padding:20px;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      
      <div style="padding:20px;border-bottom:1px solid #e5e7eb;">
        <h2 style="margin:0;">Solicitud recibida</h2>
        <div style="margin-top:6px;color:#6b7280;font-size:14px;">
          Punto Seguro ha compartido tu solicitud con hasta <strong>${count}</strong> proveedores activos de tu zona.
        </div>
      </div>

      <div style="padding:20px;">
        <p style="margin-top:0;">Hola ${safeName},</p>
        <p style="margin:0;color:#111827;">
          Gracias. A continuación tienes un <strong>resumen técnico en lenguaje claro</strong> de tu evaluación IEI™.
        </p>
      </div>

      <div style="padding:20px;border-top:1px solid #e5e7eb;">
        <div style="font-size:26px;font-weight:800;color:${levelColor};">${scoreLine}</div>
        <div style="margin-top:6px;font-size:14px;color:#6b7280;">
          Nivel: <strong style="color:${levelColor};">${escapeHtml(String(riskLevel || "Sin nivel"))}</strong> · Tipo: <strong>${tipoLine}</strong>
        </div>

        <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:10px;font-size:13px;color:#111827;">
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:999px;padding:6px 10px;">
            CP: <strong>${formatValue(lead?.postal_code)}</strong>
          </div>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:999px;padding:6px 10px;">
            Ciudad: <strong>${formatValue(lead?.city)}</strong>
          </div>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:999px;padding:6px 10px;">
            Urgencia: <strong>${formatValue(lead?.urgency)}</strong>
          </div>
        </div>
      </div>

      ${
        factors.length
          ? `
          <div style="padding:20px;border-top:1px solid #e5e7eb;">
            <h3 style="margin:0 0 10px 0;">Qué ha pesado más en tu resultado</h3>
            <ul style="padding-left:18px;margin:0;color:#111827;">
              ${factors.map(t => `<li>${escapeHtml(t)}</li>`).join("")}
            </ul>
            <div style="margin-top:10px;color:#6b7280;font-size:13px;">
              Estos puntos no implican un incidente, pero sí aumentan la exposición si se combinan con rutinas previsibles o baja detección.
            </div>
          </div>
          `
          : ""
      }

      <div style="padding:20px;border-top:1px solid #e5e7eb;">
        <h3 style="margin:0 0 10px 0;">Acciones recomendadas (rápidas)</h3>
        <ol style="padding-left:18px;margin:0;color:#111827;">
          ${advice.slice(0, 3).map(a => `<li>${escapeHtml(a)}</li>`).join("")}
        </ol>
      </div>

      <div style="padding:20px;border-top:1px solid #e5e7eb;text-align:center;">
        <a href="/diagnostico"
           style="display:inline-block;background:#111827;color:#ffffff;
           padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:800;">
           Repetir evaluación IEI™
        </a>
      </div>

      <div style="padding:14px;background:#f9fafb;font-size:12px;color:#6b7280;text-align:center;">
        IEI™ es una evaluación orientativa basada en criterios de exposición. Tus datos solo se comparten si envías la solicitud.
      </div>

    </div>
  </div>
  `.trim();
}

function createEmailService({ env }) {
  const apiKey = env.RESEND_API_KEY;
  const resend = apiKey ? new Resend(apiKey) : null;

  const baseUrl = resolvePublicBaseUrl(env);

  const fromAddress = env.EMAIL_FROM || "Punto Seguro <no-reply@puntoseguro.local>";
  const replyTo = env.EMAIL_REPLY_TO || undefined;
  const mode = resend ? "resend" : "console";

  async function send({ to, subject, html }) {
    if (!resend) {
      console.log("EMAIL OUTBOX (Resend not configured):", { to, subject });
      return;
    }

    await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      html,
      replyTo,
    });
  }

  async function sendProviderLeadEmail(provider, lead) {
    return send({
      to: provider.email,
      subject: providerSubject(lead),
      html: providerHtml(provider, lead, { baseUrl }),
    });
  }

  async function sendUserConfirmationEmail(lead, providerCount) {
    const to = lead.email;
    if (!to) return;
    return send({
      to,
      subject: userSubject(),
      html: userHtml(lead, providerCount),
    });
  }

  return {
    mode,
    sendProviderLeadEmail,
    sendUserConfirmationEmail,
  };
}

module.exports = {
  createEmailService,
};
