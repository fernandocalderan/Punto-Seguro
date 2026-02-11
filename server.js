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

const repositories = createRepositories(DATA_DIR);
const emailService = createEmailService({
  env: process.env,
  dataDir: DATA_DIR,
});

const app = express();
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
routeToFile("/autor", "autor.html");

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
    secure: false,
    maxAge: 1000 * 60 * 60 * 8,
  });

  return res.json({ ok: true });
});

app.post("/api/admin/logout", requireAdminApi, (_req, res) => {
  res.clearCookie(ADMIN_COOKIE);
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
