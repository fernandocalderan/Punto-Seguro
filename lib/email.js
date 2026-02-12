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

function providerHtml(provider, lead) {
  const intent = lead?.intent_plazo || "-";

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Nuevo lead asignado</h2>
      <p><strong>Nombre:</strong> ${formatValue(lead?.name)}</p>
      <p><strong>Email:</strong> ${formatValue(lead?.email)}</p>
      <p><strong>Teléfono:</strong> ${formatValue(lead?.phone)}</p>
      <p><strong>Ciudad:</strong> ${formatValue(lead?.city)}</p>
      <p><strong>Código Postal:</strong> ${formatValue(lead?.postal_code)}</p>
      <p><strong>Tipo:</strong> ${formatValue(lead?.business_type)}</p>
      <p><strong>Nivel de riesgo:</strong> ${formatValue(lead?.risk_level)}</p>
      <p><strong>Plazo:</strong> ${formatValue(intent)}</p>
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
      html: providerHtml(provider, lead),
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
