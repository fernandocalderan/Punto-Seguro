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
  const risk = lead?.risk_level || "Sin nivel";
  return `Nuevo lead asignado (${risk})`;
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

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Nuevo lead asignado</h2>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid rgba(15,23,42,0.08); border-radius: 10px; overflow: hidden;">
        ${row("Lead ID", lead?.id)}
        ${row("Estado", lead?.status)}
        ${row("Modo de asignación", lead?.assignment_mode)}
        ${row("Asignado por", lead?.assigned_by)}
        ${row("Asignado (principal)", providerPrimary)}
        ${row("Proveedores (lista)", providerIds)}
        ${row("Asignado en", assignedAt)}
        ${row("Creado en", createdAt)}
        ${row("Actualizado en", updatedAt)}
        ${row("Aceptado en", acceptedAt)}
        ${row("Vendido en", soldAt)}
        ${row("Eliminado en", deletedAt)}

        ${row("Nombre", lead?.name)}
        ${row("Email", lead?.email)}
        ${row("Teléfono", lead?.phone)}
        ${row("Ciudad", lead?.city)}
        ${row("Código Postal", lead?.postal_code)}
        ${row("Tipo (hogar/negocio)", lead?.business_type)}

        ${row("Nivel de riesgo", lead?.risk_level)}
        ${row("Plazo (intención)", lead?.intent_plazo)}
        ${row("Urgencia", lead?.urgency)}
        ${row("Presupuesto", lead?.budget_range)}

        ${row("Lead score", lead?.lead_score)}
        ${row("Ticket estimado (EUR)", ticketEstimated)}
        ${row("Precio (EUR)", price)}

        ${row("Consentimiento", lead?.consent)}
        ${row("Consentimiento timestamp", lead?.consent_timestamp)}
        ${row("Consentimiento IP", consentIp)}

        ${row("Notas", lead?.notes)}
      </table>

      ${
        evaluationSummaryText
          ? `
            <div style="margin-top: 16px;">
              <h3 style="margin: 0 0 8px 0; font-size: 16px;">Diagnóstico (resumen)</h3>
              <pre style="margin: 0; padding: 12px; border-radius: 10px; border: 1px solid rgba(15,23,42,0.08); background: #f8fafc; white-space: pre-wrap; word-break: break-word;">${escapeHtml(evaluationSummaryText)}</pre>
            </div>
          `.trim()
          : ""
      }

      <div style="margin-top: 18px;">
        <a href="${escapeHtml(`${String(baseUrl || "").replace(/\/+$/, "")}/admin/leads`)}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 10px 14px; border-radius: 10px; text-decoration: none; font-weight: 700;">
          Ver lead en admin
        </a>
      </div>
      <hr/>
      <p>Enviado automáticamente por Punto Seguro</p>
    </div>
  `.trim();
}

function userSubject() {
  return "Confirmación de solicitud - Punto Seguro";
}

function userHtml(lead, providerCount) {
  const safeName = formatValue(lead?.name, "Hola");
  const count = Number.isFinite(Number(providerCount)) ? Number(providerCount) : 2;

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <p>Hola ${safeName},</p>
      <p>Hemos enviado tu solicitud a hasta <strong>${count}</strong> proveedores seleccionados para tu zona.</p>
      <hr/>
      <p><strong>Resumen:</strong></p>
      <p><strong>Ciudad:</strong> ${formatValue(lead?.city)}</p>
      <p><strong>Código Postal:</strong> ${formatValue(lead?.postal_code)}</p>
      <p><strong>Riesgo orientativo:</strong> ${formatValue(lead?.risk_level)}</p>
      <p><strong>Urgencia:</strong> ${formatValue(lead?.urgency)}</p>
      <p><strong>Presupuesto:</strong> ${formatValue(lead?.budget_range)}</p>
      <p style="margin-top: 18px;">Gracias por usar Punto Seguro.</p>
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
