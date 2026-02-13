require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const express = require("express");
const cookieParser = require("cookie-parser");

const { createRepositories } = require("./lib/repositories");
const { createEmailService } = require("./lib/email");
const { createLeadAndDispatch } = require("./lib/leadService");
const { LEAD_STATUSES } = require("./lib/models");
const { assignProviders } = require("./lib/assignment");
const { trackEvent } = require("./lib/events");

function resolveRootDir() {
  const candidates = [
    __dirname,
    process.cwd(),
    path.resolve(__dirname, ".."),
  ];

  for (const candidate of candidates) {
    const hasCoreFiles =
      fs.existsSync(path.join(candidate, "index.html")) &&
      fs.existsSync(path.join(candidate, "evaluador.html"));
    if (hasCoreFiles) return candidate;
  }

  return __dirname;
}

const ROOT_DIR = resolveRootDir();
const DATA_DIR =
  process.env.DATA_DIR ||
  (process.env.VERCEL ? "/tmp/punto-seguro-data" : path.join(ROOT_DIR, "data"));

const PORT = Number(process.env.PORT || 3000);
const MAX_PROVIDERS_PER_LEAD = Math.max(1, Number(process.env.MAX_PROVIDERS_PER_LEAD || 2));
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "cambia-esta-clave";
const ADMIN_COOKIE = "ps_admin_session";
const ADMIN_TOKEN = createHash("sha256").update(ADMIN_PASSWORD).digest("hex");

if (process.env.VERCEL && !process.env.DATABASE_URL) {
  console.warn("[punto-seguro] WARNING: DATABASE_URL no está definido en Vercel. La persistencia será efímera.");
}

const repositories = createRepositories(DATA_DIR);
const emailService = createEmailService({
  env: process.env,
  dataDir: DATA_DIR,
});

const app = express();
if (process.env.VERCEL) {
  app.set("trust proxy", 1);
}
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use((req, res, next) => {
  const pathName = req.path || "";
  const protectedAdminFile =
    pathName === "/admin/providers.html" || pathName === "/admin/leads.html";

  if (protectedAdminFile && !isAdminAuthenticated(req)) {
    return res.redirect("/admin/login");
  }
  return next();
});

app.use(express.static(ROOT_DIR, { index: false, dotfiles: "ignore" }));

function file(filePath) {
  return path.join(ROOT_DIR, filePath);
}

function requesterIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || null;
}

function isAdminAuthenticated(req) {
  return req.cookies?.[ADMIN_COOKIE] === ADMIN_TOKEN;
}

function isSecureRequest(req) {
  if (process.env.VERCEL === "1") return true;
  if (req.secure) return true;
  return req.headers["x-forwarded-proto"] === "https";
}

function requireAdminPage(req, res, next) {
  if (isAdminAuthenticated(req)) return next();
  return res.redirect("/admin/login");
}

function requireAdminApi(req, res, next) {
  if (isAdminAuthenticated(req)) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function normalizeProviderIds(value) {
  if (!Array.isArray(value)) return [];
  const cleaned = value.map((id) => String(id).trim()).filter(Boolean);
  return Array.from(new Set(cleaned)).slice(0, MAX_PROVIDERS_PER_LEAD);
}

function statusAfterAssignment(currentStatus) {
  const keep = new Set(["sent", "accepted", "closed", "sold", "rejected", "deleted"]);
  if (keep.has(currentStatus)) return currentStatus;
  return "assigned";
}

function routeToFile(routePath, filePath) {
  app.get(routePath, (_req, res) => {
    res.sendFile(file(filePath));
  });
}

routeToFile("/", "index.html");
routeToFile("/diagnostico", "evaluador.html");
routeToFile("/resultado", "resultado.html");
routeToFile("/solicitar-propuesta", "solicitar-propuesta.html");
routeToFile("/confirmacion", "confirmacion.html");
routeToFile("/proveedores", "proveedores.html");
routeToFile("/privacidad", "privacidad.html");
routeToFile("/terminos", "terminos.html");
routeToFile("/cookies", "cookies.html");
routeToFile("/blog", "blog.html");
routeToFile("/iei", "iei.html");

app.get("/admin/login", (_req, res) => {
  res.sendFile(file("admin/login.html"));
});

app.get("/admin", requireAdminPage, (_req, res) => {
  res.redirect("/admin/providers");
});

app.get("/admin/providers", requireAdminPage, (_req, res) => {
  res.sendFile(file("admin/providers.html"));
});

app.get("/admin/leads", requireAdminPage, (_req, res) => {
  res.sendFile(file("admin/leads.html"));
});

app.post("/api/events", asyncHandler(async (req, res) => {
  const eventName = String(req.body.event_name || "").trim();
  if (!eventName) {
    return res.status(400).json({ error: "event_name is required" });
  }

  const event = await trackEvent(
    repositories.events,
    eventName,
    req.body.payload || {},
    {
      path: req.body.path || req.path,
      user_agent: req.headers["user-agent"],
      ip: requesterIp(req),
    }
  );

  return res.status(201).json({ ok: true, event_id: event.id });
}));

app.post("/api/leads", async (req, res) => {
  try {
    const result = await createLeadAndDispatch({
      leadInput: {
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
        city: req.body.city,
        postal_code: req.body.postal_code,
        business_type: req.body.business_type,
        risk_level: req.body.risk_level,
        urgency: req.body.urgency,
        budget_range: req.body.budget_range,
        intent_plazo: req.body.intent_plazo,
        notes: req.body.notes,
        consent: req.body.consent,
        consent_timestamp: req.body.consent_timestamp,
        evaluation_summary: req.body.evaluation_summary,
      },
      requesterIp: requesterIp(req),
      repositories,
      emailService,
      maxProvidersPerLead: MAX_PROVIDERS_PER_LEAD,
    });

    return res.status(201).json({
      ok: true,
      lead_id: result.lead.id,
      provider_count: result.assignedProviders.length,
      provider_ids: result.assignedProviders.map((provider) => provider.id),
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error.message || "Unable to create lead",
    });
  }
});

app.post("/api/admin/login", (req, res) => {
  const password = String(req.body.password || "");
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: "Credenciales incorrectas" });
  }

  res.cookie(ADMIN_COOKIE, ADMIN_TOKEN, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    maxAge: 1000 * 60 * 60 * 8,
  });

  return res.json({ ok: true });
});

app.post("/api/admin/logout", requireAdminApi, (req, res) => {
  res.clearCookie(ADMIN_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
  });
  return res.json({ ok: true });
});

app.get("/api/admin/providers", requireAdminApi, asyncHandler(async (_req, res) => {
  return res.json({
    providers: await repositories.providers.list(),
  });
}));

app.post("/api/admin/providers", requireAdminApi, asyncHandler(async (req, res) => {
  try {
    const provider = await repositories.providers.create({
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      zones: req.body.zones,
      business_types: req.body.business_types,
      active: req.body.active,
      priority: req.body.priority,
      daily_cap: req.body.daily_cap,
      last_assigned_at: req.body.last_assigned_at,
    });

    return res.status(201).json({ provider });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}));

app.put("/api/admin/providers/:id", requireAdminApi, asyncHandler(async (req, res) => {
  try {
    const provider = await repositories.providers.update(req.params.id, {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      zones: req.body.zones,
      business_types: req.body.business_types,
      active: req.body.active,
      priority: req.body.priority,
      daily_cap: req.body.daily_cap,
      last_assigned_at: req.body.last_assigned_at,
    });

    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    return res.json({ provider });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}));

app.delete("/api/admin/providers/:id", requireAdminApi, asyncHandler(async (req, res) => {
  const providerId = String(req.params.id || "").trim();
  const provider = await repositories.providers.getById(providerId);
  if (!provider) {
    return res.status(404).json({ error: "Provider not found" });
  }

  const leads = await repositories.leads.list();
  const hasAssignments = leads.some((lead) => {
    if (lead.assigned_provider_id === providerId) return true;
    return Array.isArray(lead.provider_ids) && lead.provider_ids.includes(providerId);
  });

  if (hasAssignments) {
    return res.status(409).json({
      error: "Provider has assigned leads and cannot be deleted",
    });
  }

  const deleted = await repositories.providers.deleteProvider(providerId);
  if (!deleted) {
    return res.status(404).json({ error: "Provider not found" });
  }

  await trackEvent(repositories.events, "provider_deleted", {
    provider_id: providerId,
    provider_name: provider.name,
  }, {
    path: req.path,
    user_agent: req.headers["user-agent"],
    ip: requesterIp(req),
    actor: "admin",
  });

  return res.json({ ok: true });
}));

app.get("/api/admin/leads", requireAdminApi, asyncHandler(async (_req, res) => {
  return res.json({
    leads: await repositories.leads.list(),
  });
}));

app.get("/api/admin/leads/:id", requireAdminApi, asyncHandler(async (req, res) => {
  const lead = await repositories.leads.getById(req.params.id);
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }
  return res.json({ lead });
}));

app.patch("/api/admin/leads/:id", requireAdminApi, asyncHandler(async (req, res) => {
  const lead = await repositories.leads.getById(req.params.id);
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }

  const patch = {
    ...lead,
    notes: req.body.notes !== undefined ? String(req.body.notes) : lead.notes,
  };

  if (req.body.status) {
    const nextStatus = String(req.body.status);
    if (!LEAD_STATUSES.includes(nextStatus)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    patch.status = nextStatus;
  }

  try {
    const updatedLead = await repositories.leads.update(req.params.id, patch);
    return res.json({ lead: updatedLead });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}));

app.post("/api/admin/leads/:id/assign-manual", requireAdminApi, asyncHandler(async (req, res) => {
  const lead = await repositories.leads.getById(req.params.id);
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }

  const providerIds = normalizeProviderIds(req.body.provider_ids);
  if (providerIds.length === 0) {
    return res.status(400).json({ error: "provider_ids is required" });
  }
  if (Array.isArray(req.body.provider_ids) && req.body.provider_ids.length > MAX_PROVIDERS_PER_LEAD) {
    return res.status(400).json({ error: `provider_ids max is ${MAX_PROVIDERS_PER_LEAD}` });
  }

  const providers = await repositories.providers.getByIds(providerIds);
  const providerMap = new Map(providers.map((provider) => [provider.id, provider]));
  const missing = providerIds.filter((id) => !providerMap.has(id));
  if (missing.length > 0) {
    return res.status(400).json({ error: `Providers not found: ${missing.join(", ")}` });
  }

  const inactive = providers.filter((provider) => !provider.active).map((provider) => provider.id);
  const warnings = inactive.length > 0 ? [`inactive_providers: ${inactive.join(", ")}`] : [];

  const nowIso = new Date().toISOString();
  const note = req.body.note !== undefined ? String(req.body.note).trim() : "";
  const notes = note
    ? `${lead.notes || ""}\n[ADMIN manual assign ${nowIso}] ${note}`.trim()
    : lead.notes || "";

  const updatedLead = await repositories.leads.update(lead.id, {
    ...lead,
    provider_ids: providerIds,
    assigned_provider_id: providerIds[0] || null,
    assigned_at: nowIso,
    assignment_mode: "manual",
    assigned_by: "admin",
    updated_at: nowIso,
    status: statusAfterAssignment(lead.status),
    notes,
  });

  await repositories.providers.touchAssignedAt(providerIds, nowIso);

  await trackEvent(repositories.events, "lead_assigned_manual", {
    lead_id: updatedLead.id,
    provider_ids: providerIds,
    assigned_provider_id: providerIds[0],
    previous_provider_ids: lead.provider_ids || [],
    previous_assigned_provider_id: lead.assigned_provider_id || null,
    warnings,
  }, {
    path: req.path,
    user_agent: req.headers["user-agent"],
    ip: requesterIp(req),
    actor: "admin",
  });

  // Admin assign: enviar email al proveedor principal (si existe)
  try {
    const primaryProviderId = providerIds[0] || null;

    if (primaryProviderId) {
      const provider = await repositories.providers.getById(primaryProviderId);

      if (provider?.email) {
        console.log("[admin-assign-manual] sending provider email", {
          lead_id: updatedLead.id,
          provider_id: primaryProviderId,
        });

        await emailService.sendProviderLeadEmail(provider, updatedLead);
      } else {
        console.log("[admin-assign-manual] provider has no email", {
          provider_id: primaryProviderId,
        });
      }
    } else {
      console.log("[admin-assign-manual] no provider assigned, skip email", {
        lead_id: updatedLead.id,
      });
    }
  } catch (err) {
    console.error("[admin-assign-manual] email send failed", err);
  }

  return res.json({ ok: true, lead: updatedLead, warnings });
}));

app.post("/api/admin/leads/:id/reassign-auto", requireAdminApi, asyncHandler(async (req, res) => {
  const lead = await repositories.leads.getById(req.params.id);
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const candidates = await repositories.providers.listActive();
  const assignedProviders = await assignProviders({
    lead,
    providers: candidates,
    leadRepository: repositories.leads,
    maxProviders: MAX_PROVIDERS_PER_LEAD,
    now,
  });

  const providerIds = assignedProviders.map((provider) => provider.id);
  const primaryProviderId = providerIds[0] || null;

  const nextStatus = providerIds.length > 0
    ? statusAfterAssignment(lead.status)
    : (lead.status === "new" || lead.status === "validated" || lead.status === "assigned")
      ? "validated"
      : lead.status;

  const updatedLead = await repositories.leads.update(lead.id, {
    ...lead,
    provider_ids: providerIds,
    assigned_provider_id: primaryProviderId,
    assigned_at: providerIds.length > 0 ? nowIso : null,
    assignment_mode: "auto",
    assigned_by: "admin",
    updated_at: nowIso,
    status: nextStatus,
  });

  if (providerIds.length > 0) {
    await repositories.providers.touchAssignedAt(providerIds, nowIso);
  }

  await trackEvent(repositories.events, "lead_reassigned_auto", {
    lead_id: updatedLead.id,
    provider_ids: providerIds,
    assigned_provider_id: primaryProviderId,
    provider_count: providerIds.length,
    previous_provider_ids: lead.provider_ids || [],
    previous_assigned_provider_id: lead.assigned_provider_id || null,
  }, {
    path: req.path,
    user_agent: req.headers["user-agent"],
    ip: requesterIp(req),
    actor: "admin",
  });

  // Admin reassign: enviar email al proveedor principal (si existe)
  try {
    if (primaryProviderId) {
      const provider = await repositories.providers.getById(primaryProviderId);

      if (provider?.email) {
        console.log("[admin-reassign-auto] sending provider email", {
          lead_id: updatedLead.id,
          provider_id: primaryProviderId,
        });

        await emailService.sendProviderLeadEmail(provider, updatedLead);
      } else {
        console.log("[admin-reassign-auto] provider has no email", {
          provider_id: primaryProviderId,
        });
      }
    } else {
      console.log("[admin-reassign-auto] no provider assigned, skip email", {
        lead_id: updatedLead.id,
      });
    }
  } catch (err) {
    console.error("[admin-reassign-auto] email send failed", err);
  }

  return res.json({ ok: true, lead: updatedLead });
}));

app.post("/api/admin/leads/:id/anonymize", requireAdminApi, asyncHandler(async (req, res) => {
  const lead = await repositories.leads.getById(req.params.id);
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }

  const reason = req.body.reason !== undefined ? String(req.body.reason).trim() : "";
  const anonymized = await repositories.leads.anonymize(lead.id, { reason });

  await trackEvent(repositories.events, "lead_anonymized", {
    lead_id: lead.id,
    previous_status: lead.status,
    previous_provider_ids: lead.provider_ids || [],
    reason: reason || null,
  }, {
    path: req.path,
    user_agent: req.headers["user-agent"],
    ip: requesterIp(req),
    actor: "admin",
  });

  return res.json({ ok: true, lead: anonymized });
}));

app.get("/api/admin/events", requireAdminApi, asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit || 100);
  return res.json({
    events: await repositories.events.list(limit),
  });
}));

app.get("/api/admin/metrics", requireAdminApi, asyncHandler(async (_req, res) => {
  const leads = await repositories.leads.list();
  const events = await repositories.events.list(1000);
  const providers = await repositories.providers.list();

  const leadsByStatus = leads.reduce((acc, lead) => {
    acc[lead.status] = (acc[lead.status] || 0) + 1;
    return acc;
  }, {});

  const eventsByName = events.reduce((acc, event) => {
    acc[event.event_name] = (acc[event.event_name] || 0) + 1;
    return acc;
  }, {});

  return res.json({
    totals: {
      leads: leads.length,
      providers: providers.length,
      events: events.length,
    },
    leads_by_status: leadsByStatus,
    events_by_name: eventsByName,
  });
}));

app.use((error, req, res, _next) => {
  console.error("[punto-seguro] request error", error);
  if (req.path.startsWith("/api/")) {
    return res.status(500).json({ error: "Internal server error" });
  }
  return res.status(500).send("Internal server error");
});

app.use((_req, res) => {
  res.status(404).send("Not Found");
});

if (require.main === module) {
  app.listen(PORT, () => {
    if (!process.env.ADMIN_PASSWORD) {
      console.warn("[punto-seguro] ADMIN_PASSWORD no esta definido. Usando valor por defecto inseguro.");
    }
    console.log(`[punto-seguro] servidor iniciado en http://localhost:${PORT}`);
  });
}

module.exports = app;
