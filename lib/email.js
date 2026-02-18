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

function normalizeRiskLevel(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "CRITICA") return "CRÍTICA";
  if (raw === "ALTO") return "ELEVADA";
  if (raw === "MEDIO") return "MODERADA";
  if (raw === "BAJO") return "CONTROLADA";
  if (raw === "CONTROLADA" || raw === "MODERADA" || raw === "ELEVADA" || raw === "CRÍTICA") return raw;
  return "MODERADA";
}

function normalizeUrgency(value) {
  const urgency = String(value || "").trim().toLowerCase();
  if (!urgency) return "-";
  if (urgency === "alta") return "alta";
  if (urgency === "media") return "media";
  if (urgency === "baja") return "baja";
  return urgency;
}

function normalizeBusinessType(value) {
  const type = String(value || "").trim().toLowerCase();
  if (!type || type === "general") return "-";
  if (type === "vivienda") return "vivienda";
  if (type === "comercio") return "comercio";
  return type;
}

function parseEvaluationSummary(evaluationSummary) {
  try {
    const parsed = typeof evaluationSummary === "string" ? JSON.parse(evaluationSummary) : evaluationSummary;
    if (!parsed || typeof parsed !== "object") return null;

    const topFactors = []
      .concat(Array.isArray(parsed.top_factors) ? parsed.top_factors : [])
      .concat(Array.isArray(parsed.factores_top) ? parsed.factores_top : [])
      .concat(Array.isArray(parsed.factors_top) ? parsed.factors_top : []);

    return {
      risk_level: parsed.risk_level || null,
      risk_score: parsed.risk_score ?? null,
      tipo_inmueble: parsed.tipo_inmueble || null,
      summary: parsed.summary || null,
      drivers: Array.isArray(parsed.drivers) ? parsed.drivers : [],
      topFactors,
    };
  } catch {
    return null;
  }
}

function resolveRiskScore(lead, diag) {
  const scoreCandidate = lead?.risk_score ?? lead?.iei_score ?? diag?.risk_score;
  const numeric = Number(scoreCandidate);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  return Math.max(0, Math.min(100, rounded));
}

function resolveRiskLevel(lead, diag) {
  return normalizeRiskLevel(diag?.risk_level || lead?.risk_level || "MODERADA");
}

function clipText(value, max = 170) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function extractMainReasons(lead, limit = 3, detailed = true) {
  const diag = parseEvaluationSummary(lead?.evaluation_summary ?? lead?.evaluationSummary);
  const fromDrivers = (diag?.drivers || [])
    .map((driver) => {
      const title = String(driver?.title || "").trim();
      const detail = String(driver?.detail || driver?.description || "").trim();
      if (title && detail) {
        return detailed ? `${title}: ${detail}` : title;
      }
      return title || detail;
    })
    .map((item) => clipText(item))
    .filter(Boolean);

  if (fromDrivers.length > 0) {
    return fromDrivers.slice(0, limit);
  }

  const fromFactors = (diag?.topFactors || [])
    .map((factor) => factor?.texto || factor?.text || factor?.resultado || "")
    .map((item) => clipText(item))
    .filter(Boolean);

  return fromFactors.slice(0, limit);
}

function providerSubject(lead) {
  const diag = parseEvaluationSummary(lead?.evaluation_summary ?? lead?.evaluationSummary);
  const riskLevel = resolveRiskLevel(lead, diag);
  const riskScore = resolveRiskScore(lead, diag);
  const urgency = normalizeUrgency(lead?.urgency);
  const postalCode = String(lead?.postal_code || "-").trim() || "-";
  const scoreText = riskScore === null ? "-" : String(riskScore);

  return `Lead pre-cualificado · IEI™ ${riskLevel} (${scoreText}/100) · Urgencia ${urgency} · ${postalCode}`;
}

function resolvePublicBaseUrl(env) {
  const explicit = (env.PUBLIC_BASE_URL || env.APP_BASE_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  if (env.VERCEL_URL) return `https://${String(env.VERCEL_URL).trim()}`;

  const port = String(env.PORT || 3000).trim();
  return `http://localhost:${port}`;
}

function providerHtml(provider, lead, { baseUrl }) {
  const diag = parseEvaluationSummary(lead?.evaluation_summary ?? lead?.evaluationSummary);
  const riskLevel = resolveRiskLevel(lead, diag);
  const riskScore = resolveRiskScore(lead, diag);
  const typeLabel = normalizeBusinessType(diag?.tipo_inmueble || lead?.business_type);
  const urgencyLabel = normalizeUrgency(lead?.urgency);
  const city = String(lead?.city || "").trim() || "-";
  const postalCode = String(lead?.postal_code || "").trim() || "-";
  const phoneVerified = lead?.phone_verified === true;

  const reasons = extractMainReasons(lead, 3, true);
  const commercialScore = Number(lead?.commercial_score);
  const hasCommercialScore = Number.isFinite(commercialScore);
  const commercialTier = String(lead?.commercial_tier || "").trim();
  const contextLabel = urgencyLabel === "alta" || (hasCommercialScore && commercialScore >= 60)
    ? "Lead en fase de decisión"
    : (hasCommercialScore && commercialScore < 40 ? "Lead informativo" : "Lead en evaluación activa");

  const normalizedBudget = String(lead?.budget_range || "").trim().toLowerCase();
  const showBudget = normalizedBudget && normalizedBudget !== "sin_definir";
  const scoreText = riskScore === null ? "-" : String(riskScore);

  return `
<div style="font-family: Arial, sans-serif; background:#f5f7fa; padding:20px;">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="padding:22px;border-bottom:1px solid #e5e7eb;">
      <h2 style="margin:0;">Nuevo lead validado y pre-cualificado</h2>
      <div style="margin-top:8px;color:#475569;font-size:14px;">
        Teléfono verificado por SMS ${phoneVerified ? "✔" : "—"} · Consentimiento registrado ✔
      </div>
    </div>

    ${
      hasCommercialScore && commercialTier
        ? `
        <div style="margin:18px 22px 0;border:1px solid rgba(15,23,42,0.12);border-radius:12px;background:rgba(15,23,42,0.03);padding:16px;">
          <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#475569;font-weight:800;">Lead Score Comercial (CIS™)</div>
          <div style="margin-top:6px;font-size:30px;font-weight:900;color:#0f172a;">${Math.max(0, Math.min(100, Math.round(commercialScore)))}/100</div>
          <div style="margin-top:4px;font-size:14px;color:#0f172a;">Clasificación: <b>${escapeHtml(commercialTier)}</b></div>
          <div style="margin-top:8px;font-size:13px;color:#475569;">Señales de intención: evaluación completa + solicitud activa + urgencia declarada.</div>
          <div style="margin-top:6px;font-size:12px;color:#64748b;">CIS™ usa un algoritmo propietario de pre-cualificación comercial.</div>
        </div>
        `
        : ""
    }

    <div style="padding:22px;border-top:1px solid #e5e7eb;">
      <h3 style="margin:0 0 10px;">Resumen técnico</h3>
      <div style="font-size:14px;color:#0f172a;line-height:1.55;">
        <div>IEI™ <b>${escapeHtml(scoreText)}/100</b></div>
        <div>Nivel <b>${escapeHtml(riskLevel)}</b></div>
        <div>Tipo <b>${escapeHtml(typeLabel)}</b></div>
        <div>CP <b>${escapeHtml(postalCode)}</b> / Ciudad <b>${escapeHtml(city)}</b></div>
      </div>
      <div style="margin-top:12px;font-size:14px;color:#0f172a;"><b>Motivos principales</b> (top 3):</div>
      <ul style="margin:8px 0 0;padding-left:20px;color:#334155;line-height:1.5;">
        ${
          reasons.length > 0
            ? reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")
            : "<li>No se registraron motivos principales en el resumen de evaluación.</li>"
        }
      </ul>
    </div>

    <div style="padding:22px;border-top:1px solid #e5e7eb;">
      <h3 style="margin:0 0 10px;">Datos de contacto (verificados)</h3>
      <div style="font-size:14px;color:#0f172a;line-height:1.55;">
        <div><b>Nombre:</b> ${formatValue(lead?.name)}</div>
        <div><b>Teléfono:</b> ${formatValue(lead?.phone)} ${phoneVerified ? "· verificado ✔" : ""}</div>
        <div><b>Email:</b> ${formatValue(lead?.email)}</div>
        <div><b>Urgencia:</b> ${formatValue(urgencyLabel)}</div>
        ${showBudget ? `<div><b>Presupuesto:</b> ${formatValue(lead?.budget_range)}</div>` : ""}
      </div>
    </div>

    <div style="padding:16px 22px;border-top:1px solid #e5e7eb;background:#f8fafc;font-size:14px;color:#0f172a;">
      <b>Contexto comercial:</b> ${escapeHtml(contextLabel)}
    </div>

    <div style="padding:20px;border-top:1px solid #e5e7eb;text-align:center;">
      <a href="${escapeHtml(`${String(baseUrl || "").replace(/\/+$/, "")}/admin/leads`)}"
         style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:800;">
         Ver lead en admin
      </a>
    </div>

    <div style="padding:14px;background:#f9fafb;font-size:12px;color:#6b7280;text-align:center;line-height:1.45;">
      IEI™ es una evaluación de exposición, no diagnóstico oficial.<br>
      Lead enviado con consentimiento. Limitado a hasta 2 proveedores.
    </div>
  </div>
</div>
`.trim();
}

function userSubject(lead) {
  const diag = parseEvaluationSummary(lead?.evaluation_summary ?? lead?.evaluationSummary);
  const riskScore = resolveRiskScore(lead, diag);
  const scoreText = riskScore === null ? "-" : String(riskScore);
  return `Tu IEI™ ${scoreText}/100 · Solicitud enviada correctamente`;
}

function userHtml(lead, providerCount, { baseUrl }) {
  const safeName = formatValue(lead?.name, "Hola");
  const count = Number.isFinite(Number(providerCount)) ? Number(providerCount) : 2;
  const diag = parseEvaluationSummary(lead?.evaluation_summary ?? lead?.evaluationSummary);
  const riskLevel = resolveRiskLevel(lead, diag);
  const riskScore = resolveRiskScore(lead, diag);
  const typeLabel = normalizeBusinessType(diag?.tipo_inmueble || lead?.business_type);
  const city = String(lead?.city || "").trim() || "-";
  const postalCode = String(lead?.postal_code || "").trim() || "-";
  const urgencyLabel = normalizeUrgency(lead?.urgency);
  const reasons = extractMainReasons(lead, 3, false);
  const scoreText = riskScore === null ? "-" : String(riskScore);
  const diagnosticsUrl = `${String(baseUrl || "").replace(/\/+$/, "")}/diagnostico`;

  return `
<div style="font-family: Arial, sans-serif; background:#f5f7fa; padding:20px;">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="padding:22px;border-bottom:1px solid #e5e7eb;">
      <h2 style="margin:0;">Solicitud recibida</h2>
      <p style="margin:8px 0 0;color:#475569;font-size:14px;">
        Hemos compartido tu solicitud con hasta ${count} proveedores activos de tu zona.
      </p>
    </div>

    <div style="padding:22px;border-bottom:1px solid #e5e7eb;">
      <p style="margin:0 0 12px;color:#0f172a;">Hola ${safeName},</p>
      <div style="font-size:30px;font-weight:900;color:#0f172a;">IEI™ ${escapeHtml(scoreText)}/100</div>
      <div style="margin-top:6px;font-size:14px;color:#334155;">
        Nivel: <b>${escapeHtml(riskLevel)}</b> · Tipo: <b>${escapeHtml(typeLabel)}</b>
      </div>
      <div style="margin-top:10px;font-size:14px;color:#334155;">
        CP: <b>${escapeHtml(postalCode)}</b> · Ciudad: <b>${escapeHtml(city)}</b> · Urgencia: <b>${escapeHtml(urgencyLabel)}</b>
      </div>
    </div>

    <div style="padding:22px;border-bottom:1px solid #e5e7eb;">
      <h3 style="margin:0 0 10px;">Qué ha influido más</h3>
      <ul style="margin:0;padding-left:20px;color:#334155;line-height:1.5;">
        ${
          reasons.length > 0
            ? reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")
            : "<li>No se registraron motivos principales en el resumen.</li>"
        }
      </ul>
      <p style="margin:10px 0 0;font-size:13px;color:#64748b;">
        No implica un incidente, pero aumenta la exposición si se combinan factores.
      </p>
    </div>

    <div style="padding:22px;border-bottom:1px solid #e5e7eb;">
      <h3 style="margin:0 0 10px;">Acciones recomendadas (rápidas)</h3>
      <ol style="margin:0;padding-left:20px;color:#334155;line-height:1.5;">
        <li>Revisa accesos principales y secundarios (puerta, ventanas, terraza/balcón).</li>
        <li>Reduce señales de ausencia (luces programadas, persianas, buzón, hábitos).</li>
        <li>Activa detección temprana (sensores + aviso inmediato).</li>
      </ol>
    </div>

    <div style="padding:22px;border-bottom:1px solid #e5e7eb;">
      <h3 style="margin:0 0 10px;">Qué ocurrirá ahora</h3>
      <p style="margin:0;color:#334155;line-height:1.5;">
        En las próximas horas, un proveedor autorizado podrá contactarte con una propuesta adaptada.
        Verificamos tu teléfono por SMS para evitar solicitudes falsas y proteger la calidad del servicio.
        No hacemos llamadas desde Punto Seguro.
      </p>
    </div>

    <div style="padding:20px;border-top:1px solid #e5e7eb;text-align:center;">
      <a href="${escapeHtml(diagnosticsUrl)}"
         style="display:inline-block;background:#111827;color:#ffffff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:800;">
         Repetir evaluación IEI™
      </a>
    </div>

    <div style="padding:14px;background:#f9fafb;font-size:12px;color:#6b7280;text-align:center;line-height:1.45;">
      IEI™ es una evaluación orientativa basada en criterios de exposición.<br>
      Tus datos solo se comparten si envías la solicitud.
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
      subject: userSubject(lead),
      html: userHtml(lead, providerCount, { baseUrl }),
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
