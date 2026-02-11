const fs = require("node:fs");
const path = require("node:path");
const nodemailer = require("nodemailer");

function createTransportFromEnv(env) {
  if (env.SMTP_HOST && env.SMTP_PORT) {
    return {
      transporter: nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT),
        secure: String(env.SMTP_SECURE || "false") === "true",
        auth: env.SMTP_USER
          ? {
              user: env.SMTP_USER,
              pass: env.SMTP_PASS,
            }
          : undefined,
      }),
      mode: "smtp",
    };
  }

  return {
    transporter: nodemailer.createTransport({
      jsonTransport: true,
    }),
    mode: "json",
  };
}

function appendOutbox(dataDir, payload) {
  const outboxPath = path.join(dataDir, "email-outbox.log");
  const lines = [
    `--- ${new Date().toISOString()} ---`,
    `TO: ${payload.to}`,
    `SUBJECT: ${payload.subject}`,
    payload.text,
    "",
  ];
  fs.appendFileSync(outboxPath, `${lines.join("\n")}\n`);
}

function providerSubject(lead) {
  return `Nuevo contacto Punto Seguro (riesgo ${lead.risk_level} – ${lead.city})`;
}

function providerBody(lead) {
  return [
    "Nuevo lead asignado por Punto Seguro",
    "",
    `Nombre: ${lead.name}`,
    `Email: ${lead.email}`,
    `Telefono: ${lead.phone}`,
    `Ciudad: ${lead.city}`,
    `Codigo postal: ${lead.postal_code}`,
    `Tipo de inmueble/negocio: ${lead.business_type}`,
    `Riesgo: ${lead.risk_level}`,
    `Urgencia: ${lead.urgency}`,
    `Presupuesto: ${lead.budget_range}`,
    `Notas del usuario: ${lead.notes || "Sin notas adicionales"}`,
    "",
    "Resumen de evaluacion:",
    lead.evaluation_summary || "No informado",
    "",
    "Contacto generado en Punto Seguro.",
  ].join("\n");
}

function userSubject() {
  return "Confirmacion de solicitud - Punto Seguro";
}

function userBody(lead, providerCount) {
  return [
    `Hola ${lead.name},`,
    "",
    `Hemos enviado tu solicitud a hasta ${providerCount} proveedores seleccionados para tu zona.`,
    "",
    "Resumen de tu solicitud:",
    `Ciudad: ${lead.city}`,
    `Codigo postal: ${lead.postal_code}`,
    `Riesgo orientativo: ${lead.risk_level}`,
    `Urgencia: ${lead.urgency}`,
    `Presupuesto: ${lead.budget_range}`,
    "",
    "Gracias por usar Punto Seguro.",
  ].join("\n");
}

function createEmailService({ env, dataDir }) {
  const { transporter, mode } = createTransportFromEnv(env);
  const fromAddress = env.EMAIL_FROM || "Punto Seguro <no-reply@puntoseguro.local>";

  async function sendMail({ to, subject, text }) {
    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      text,
    });

    appendOutbox(dataDir, { to, subject, text, info, mode });
    return info;
  }

  async function sendProviderLeadEmail(provider, lead) {
    return sendMail({
      to: provider.email,
      subject: providerSubject(lead),
      text: providerBody(lead),
    });
  }

  async function sendUserConfirmationEmail(lead, providerCount) {
    return sendMail({
      to: lead.email,
      subject: userSubject(lead),
      text: userBody(lead, providerCount),
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
