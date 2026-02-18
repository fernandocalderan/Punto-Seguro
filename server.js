require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const twilio = require("twilio");

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
const OTP_JWT_SECRET = String(process.env.OTP_JWT_SECRET || "");
const OTP_TOKEN_TTL_SECONDS = Math.max(60, Number(process.env.OTP_TOKEN_TTL_SECONDS || 600));
const OTP_VERIFIED_WINDOW_MS = Math.max(60 * 1000, Number(process.env.OTP_VERIFIED_WINDOW_MS || 10 * 60 * 1000));
const OTP_RATE_WINDOW_MS = Math.max(60 * 1000, Number(process.env.OTP_RATE_WINDOW_MS || 60 * 60 * 1000));
const OTP_RATE_LIMIT_IP = Math.max(1, Number(process.env.OTP_RATE_LIMIT_IP || 5));
const OTP_RATE_LIMIT_PHONE = Math.max(1, Number(process.env.OTP_RATE_LIMIT_PHONE || 3));
const OTP_SPAIN_ONLY = String(process.env.OTP_SPAIN_ONLY || "1") !== "0";
const TWILIO_ACCOUNT_SID = String(process.env.TWILIO_ACCOUNT_SID || "");
const TWILIO_AUTH_TOKEN = String(process.env.TWILIO_AUTH_TOKEN || "");
const TWILIO_VERIFY_SERVICE_SID = String(process.env.TWILIO_VERIFY_SERVICE_SID || "");
const COLLABORATOR_STATUS_VALUES = new Set(["active", "paused", "banned"]);
const COLLABORATOR_COMMISSION_VALUES = new Set(["percent", "fixed"]);

const otpVerifiedMap = new Map();
const otpStartedMap = new Map();
const otpStartByIpMap = new Map();
const otpStartByPhoneMap = new Map();
let twilioClient = null;

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
    pathName === "/admin/providers.html" ||
    pathName === "/admin/leads.html" ||
    pathName === "/admin/collaborators.html";

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

function normalizeCollaboratorTrackingCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeCollaboratorPatch(body, { partial = false } = {}) {
  const patch = {};

  if (!partial || body.name !== undefined) {
    patch.name = String(body.name || "").trim();
  }
  if (!partial || body.type !== undefined) {
    patch.type = String(body.type || "").trim();
  }
  if (!partial || body.tracking_code !== undefined) {
    patch.tracking_code = normalizeCollaboratorTrackingCode(body.tracking_code);
  }
  if (!partial || body.commission_type !== undefined) {
    patch.commission_type = String(body.commission_type || "").trim().toLowerCase();
    if (patch.commission_type && !COLLABORATOR_COMMISSION_VALUES.has(patch.commission_type)) {
      throw new Error("Invalid commission_type");
    }
  }
  if (!partial || body.commission_value !== undefined) {
    const value = Number(body.commission_value);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("commission_value must be >= 0");
    }
    patch.commission_value = value;
  }
  if (!partial || body.status !== undefined) {
    patch.status = String(body.status || "").trim().toLowerCase();
    if (patch.status && !COLLABORATOR_STATUS_VALUES.has(patch.status)) {
      throw new Error("Invalid status");
    }
  }

  if (!partial) {
    if (!patch.name) throw new Error("name is required");
    if (!patch.type) throw new Error("type is required");
    if (!patch.tracking_code) throw new Error("tracking_code is required");
  }

  return patch;
}

function parseExpandParam(value) {
  const raw = Array.isArray(value) ? value.join(",") : String(value || "");
  const tokens = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return new Set(tokens);
}

function providerSlotsForLead(lead) {
  const providerIds = Array.isArray(lead?.provider_ids)
    ? lead.provider_ids.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const assignedProviderId = String(lead?.assigned_provider_id || "").trim();

  const primaryId = providerIds[0] || assignedProviderId || null;
  const secondaryCandidate = providerIds[1] || null;
  const secondaryId = secondaryCandidate && secondaryCandidate !== primaryId ? secondaryCandidate : null;

  return {
    primaryId,
    secondaryId,
  };
}

async function expandAdminLeads(leads, expandSet) {
  const expanded = Array.isArray(leads) ? leads.slice() : [];
  if (expanded.length === 0) return expanded;

  const shouldExpandCollaborator = expandSet.has("collaborator");
  const shouldExpandProviders = expandSet.has("providers");

  const collaboratorsById = new Map();
  if (shouldExpandCollaborator) {
    const collaboratorIds = Array.from(
      new Set(
        expanded
          .map((lead) => String(lead?.collaborator_id || "").trim())
          .filter(Boolean)
      )
    );

    for (const collaboratorId of collaboratorIds) {
      const collaborator = await repositories.collaborators.findById(collaboratorId);
      if (collaborator) {
        collaboratorsById.set(collaboratorId, collaborator);
      }
    }
  }

  const providersById = new Map();
  if (shouldExpandProviders) {
    const providerIds = Array.from(
      new Set(
        expanded.flatMap((lead) => {
          const slots = providerSlotsForLead(lead);
          return [slots.primaryId, slots.secondaryId].filter(Boolean);
        })
      )
    );

    if (providerIds.length > 0) {
      const providers = await repositories.providers.getByIds(providerIds);
      for (const provider of providers) {
        providersById.set(provider.id, provider);
      }
    }
  }

  return expanded.map((lead) => {
    const nextLead = { ...lead };

    if (shouldExpandCollaborator) {
      const collaboratorId = String(lead?.collaborator_id || "").trim();
      nextLead._collaborator = collaboratorId ? collaboratorsById.get(collaboratorId) || null : null;
    }

    if (shouldExpandProviders) {
      const slots = providerSlotsForLead(lead);
      const relatedProviders = [];
      if (slots.primaryId && providersById.has(slots.primaryId)) {
        relatedProviders.push(providersById.get(slots.primaryId));
      }
      if (slots.secondaryId && providersById.has(slots.secondaryId) && slots.secondaryId !== slots.primaryId) {
        relatedProviders.push(providersById.get(slots.secondaryId));
      }
      nextLead._providers = relatedProviders;
    }

    return nextLead;
  });
}

function normalizePhoneE164(value) {
  let phone = String(value || "").trim();
  if (!phone) return "";

  phone = phone.replace(/[\s()-]/g, "");
  if (phone.startsWith("00")) {
    phone = `+${phone.slice(2)}`;
  }

  if (phone.startsWith("+")) {
    const normalized = `+${phone.slice(1).replace(/\D/g, "")}`;
    return /^\+\d{8,15}$/.test(normalized) ? normalized : "";
  }

  const digits = phone.replace(/\D/g, "");
  if (/^\d{9}$/.test(digits)) {
    return `+34${digits}`;
  }
  return /^\d{8,15}$/.test(digits) ? `+${digits}` : "";
}

function otpVerificationKey(phone, req) {
  return `${phone}|${requesterIp(req) || "unknown"}`;
}

function normalizeOtpProof(value) {
  if (value && typeof value === "object") {
    const expiresAt = Number(value.expiresAt);
    const otpResponse = Number(value.otp_response_seconds);
    return {
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
      phone_verified: value.phone_verified !== false,
      otp_started_at: value.otp_started_at || null,
      otp_verified_at: value.otp_verified_at || null,
      otp_response_seconds: Number.isFinite(otpResponse) ? Math.max(0, Math.round(otpResponse)) : null,
    };
  }

  const legacyExpiresAt = Number(value);
  return {
    expiresAt: Number.isFinite(legacyExpiresAt) ? legacyExpiresAt : 0,
    phone_verified: true,
    otp_started_at: null,
    otp_verified_at: null,
    otp_response_seconds: null,
  };
}

function cleanupOtpVerifications() {
  const now = Date.now();
  for (const [key, rawProof] of otpVerifiedMap.entries()) {
    const proof = normalizeOtpProof(rawProof);
    if (!proof.expiresAt || proof.expiresAt <= now) {
      otpVerifiedMap.delete(key);
    }
  }
}

function markOtpStarted(phone, req, now = Date.now()) {
  otpStartedMap.set(otpVerificationKey(phone, req), now);
}

function markOtpVerified(phone, req) {
  const key = otpVerificationKey(phone, req);
  const now = Date.now();
  const startedAtMs = Number(otpStartedMap.get(key));
  const hasStartedAt = Number.isFinite(startedAtMs) && startedAtMs > 0 && startedAtMs <= now;
  const otpResponseSeconds = hasStartedAt ? Math.max(0, Math.round((now - startedAtMs) / 1000)) : null;

  cleanupOtpVerifications();
  otpVerifiedMap.set(key, {
    expiresAt: now + OTP_VERIFIED_WINDOW_MS,
    phone_verified: true,
    otp_started_at: hasStartedAt ? new Date(startedAtMs).toISOString() : null,
    otp_verified_at: new Date(now).toISOString(),
    otp_response_seconds: otpResponseSeconds,
  });
}

function consumeOtpVerified(phone, req) {
  cleanupOtpVerifications();
  const key = otpVerificationKey(phone, req);
  const rawProof = otpVerifiedMap.get(key);
  if (!rawProof) {
    return null;
  }

  const proof = normalizeOtpProof(rawProof);
  if (!proof.expiresAt || proof.expiresAt <= Date.now()) {
    otpVerifiedMap.delete(key);
    return null;
  }

  otpVerifiedMap.delete(key);
  otpStartedMap.delete(key);
  return proof;
}

function pruneOtpAttempts(map, now) {
  for (const [key, attempts] of map.entries()) {
    const recent = Array.isArray(attempts)
      ? attempts.filter((timestamp) => now - Number(timestamp) <= OTP_RATE_WINDOW_MS)
      : [];
    if (recent.length === 0) {
      map.delete(key);
      continue;
    }
    map.set(key, recent);
  }
}

function isOtpRateLimited(map, key, limit, now) {
  const attempts = Array.isArray(map.get(key)) ? map.get(key) : [];
  const recent = attempts.filter((timestamp) => now - Number(timestamp) <= OTP_RATE_WINDOW_MS);
  if (recent.length >= limit) {
    map.set(key, recent);
    return true;
  }
  return false;
}

function registerOtpAttempt(map, key, now) {
  const attempts = Array.isArray(map.get(key)) ? map.get(key) : [];
  attempts.push(now);
  map.set(key, attempts);
}

function getTwilioClient() {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
    return null;
  }
  if (!twilioClient) {
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
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

app.get("/admin/collaborators", requireAdminPage, (_req, res) => {
  res.sendFile(file("admin/collaborators.html"));
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

app.post("/api/otp/start", asyncHandler(async (req, res) => {
  const phone = normalizePhoneE164(req.body.phone);
  if (!phone) {
    return res.status(400).json({ ok: false, error: "invalid_phone" });
  }
  if (OTP_SPAIN_ONLY && !phone.startsWith("+34")) {
    return res.status(400).json({ ok: false, error: "unsupported_country" });
  }

  const now = Date.now();
  pruneOtpAttempts(otpStartByIpMap, now);
  pruneOtpAttempts(otpStartByPhoneMap, now);

  const ipKey = requesterIp(req) || "unknown";
  if (isOtpRateLimited(otpStartByIpMap, ipKey, OTP_RATE_LIMIT_IP, now)) {
    return res.status(429).json({ ok: false, error: "otp_rate_limited_ip" });
  }
  if (isOtpRateLimited(otpStartByPhoneMap, phone, OTP_RATE_LIMIT_PHONE, now)) {
    return res.status(429).json({ ok: false, error: "otp_rate_limited_phone" });
  }

  const client = getTwilioClient();
  if (!client) {
    return res.status(503).json({ ok: false, error: "otp_not_configured" });
  }

  await client.verify.v2.services(TWILIO_VERIFY_SERVICE_SID).verifications.create({
    to: phone,
    channel: "sms",
  });

  markOtpStarted(phone, req, now);
  registerOtpAttempt(otpStartByIpMap, ipKey, now);
  registerOtpAttempt(otpStartByPhoneMap, phone, now);

  return res.json({ ok: true });
}));

app.post("/api/otp/check", asyncHandler(async (req, res) => {
  const phone = normalizePhoneE164(req.body.phone);
  const code = String(req.body.code || "").replace(/\D/g, "");
  if (!phone) {
    return res.status(400).json({ ok: false, error: "invalid_phone" });
  }
  if (!/^\d{4,8}$/.test(code)) {
    return res.status(400).json({ ok: false, error: "invalid_code" });
  }

  const client = getTwilioClient();
  if (!client) {
    return res.status(503).json({ ok: false, error: "otp_not_configured" });
  }

  const check = await client.verify.v2.services(TWILIO_VERIFY_SERVICE_SID).verificationChecks.create({
    to: phone,
    code,
  });

  const verified = String(check.status || "").toLowerCase() === "approved";
  if (verified) {
    markOtpVerified(phone, req);
  }

  return res.json({ ok: true, verified });
}));

app.post("/api/otp/token", asyncHandler(async (req, res) => {
  const phone = normalizePhoneE164(req.body.phone);
  if (!phone) {
    return res.status(400).json({ ok: false, error: "invalid_phone" });
  }
  if (!OTP_JWT_SECRET) {
    return res.status(500).json({ ok: false, error: "otp_secret_missing" });
  }

  const verificationProof = consumeOtpVerified(phone, req);
  if (!verificationProof) {
    return res.status(403).json({ ok: false, error: "otp_not_verified" });
  }

  const token = jwt.sign(
    {
      phone,
      purpose: "lead_phone_verification",
      phone_verified: Boolean(verificationProof.phone_verified),
      otp_started_at: verificationProof.otp_started_at || null,
      otp_verified_at: verificationProof.otp_verified_at || new Date().toISOString(),
      otp_response_seconds: verificationProof.otp_response_seconds,
    },
    OTP_JWT_SECRET,
    { expiresIn: OTP_TOKEN_TTL_SECONDS }
  );

  return res.json({ ok: true, token });
}));

app.post("/api/leads", async (req, res) => {
  try {
    if (!OTP_JWT_SECRET) {
      return res.status(500).json({ ok: false, error: "otp_secret_missing" });
    }

    const verificationToken = String(req.body.verificationToken || "").trim();
    if (!verificationToken) {
      return res.status(403).json({ ok: false, error: "phone_not_verified" });
    }

    const normalizedPhone = normalizePhoneE164(req.body.phone);
    if (!normalizedPhone) {
      return res.status(400).json({ ok: false, error: "invalid_phone" });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(verificationToken, OTP_JWT_SECRET);
    } catch (_error) {
      return res.status(403).json({ ok: false, error: "phone_not_verified" });
    }

    if (decodedToken?.purpose !== "lead_phone_verification") {
      return res.status(403).json({ ok: false, error: "phone_not_verified" });
    }

    if (normalizePhoneE164(decodedToken?.phone) !== normalizedPhone) {
      return res.status(403).json({ ok: false, error: "phone_not_verified" });
    }
    if (decodedToken?.phone_verified === false) {
      return res.status(403).json({ ok: false, error: "phone_not_verified" });
    }

    const otpResponseSeconds = Number(decodedToken?.otp_response_seconds);

    const result = await createLeadAndDispatch({
      leadInput: {
        name: req.body.name,
        email: req.body.email,
        phone: normalizedPhone,
        risk_score: req.body.risk_score ?? req.body.iei_score,
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
        collaborator_tracking_code: req.body.collaborator_tracking_code,
        phone_verified: true,
        otp_started_at: decodedToken?.otp_started_at || null,
        otp_verified_at: decodedToken?.otp_verified_at || null,
        otp_response_seconds: Number.isFinite(otpResponseSeconds)
          ? Math.max(0, Math.round(otpResponseSeconds))
          : null,
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

app.get("/api/admin/providers/:id/leads", requireAdminApi, asyncHandler(async (req, res) => {
  const providerId = String(req.params.id || "").trim();
  const provider = await repositories.providers.getById(providerId);
  if (!provider) {
    return res.status(404).json({ error: "Provider not found" });
  }

  const leads = await repositories.leads.list();
  const relatedLeads = leads.filter((lead) => {
    const slots = providerSlotsForLead(lead);
    return slots.primaryId === providerId || slots.secondaryId === providerId;
  });

  return res.json({
    provider,
    leads: relatedLeads,
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

app.get("/api/admin/collaborators", requireAdminApi, asyncHandler(async (_req, res) => {
  return res.json({
    collaborators: await repositories.collaborators.findAll(),
  });
}));

app.post("/api/admin/collaborators", requireAdminApi, asyncHandler(async (req, res) => {
  try {
    const payload = normalizeCollaboratorPatch(req.body, { partial: false });
    const existing = await repositories.collaborators.findByTrackingCode(payload.tracking_code);
    if (existing) {
      return res.status(409).json({ error: "tracking_code already exists" });
    }

    const collaborator = await repositories.collaborators.create(payload);
    return res.status(201).json({ collaborator });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Invalid collaborator payload" });
  }
}));

app.patch("/api/admin/collaborators/:id", requireAdminApi, asyncHandler(async (req, res) => {
  const collaboratorId = String(req.params.id || "").trim();
  const existing = await repositories.collaborators.findById(collaboratorId);
  if (!existing) {
    return res.status(404).json({ error: "Collaborator not found" });
  }

  try {
    const patch = normalizeCollaboratorPatch(req.body, { partial: true });
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    if (patch.tracking_code) {
      const byCode = await repositories.collaborators.findByTrackingCode(patch.tracking_code);
      if (byCode && byCode.id !== collaboratorId) {
        return res.status(409).json({ error: "tracking_code already exists" });
      }
    }

    const collaborator = await repositories.collaborators.update(collaboratorId, patch);
    return res.json({ collaborator });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Invalid collaborator payload" });
  }
}));

app.get("/api/admin/collaborators/:id/leads", requireAdminApi, asyncHandler(async (req, res) => {
  const collaboratorId = String(req.params.id || "").trim();
  const collaborator = await repositories.collaborators.findById(collaboratorId);
  if (!collaborator) {
    return res.status(404).json({ error: "Collaborator not found" });
  }

  const leads = await repositories.leads.list();
  const relatedLeads = leads.filter((lead) => lead.collaborator_id === collaboratorId);

  return res.json({
    collaborator,
    leads: relatedLeads,
  });
}));

app.get("/api/admin/leads", requireAdminApi, asyncHandler(async (req, res) => {
  const expandSet = parseExpandParam(req.query.expand);
  const leads = await repositories.leads.list();
  const payloadLeads = expandSet.size > 0
    ? await expandAdminLeads(leads, expandSet)
    : leads;

  return res.json({
    leads: payloadLeads,
  });
}));

app.get("/api/admin/leads/:id", requireAdminApi, asyncHandler(async (req, res) => {
  const lead = await repositories.leads.getById(req.params.id);
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }

  const expandSet = parseExpandParam(req.query.expand);
  if (expandSet.size === 0) {
    return res.json({ lead });
  }

  const [expandedLead] = await expandAdminLeads([lead], expandSet);
  return res.json({ lead: expandedLead || lead });
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

app.get("/api/admin/metrics/by-collaborator", requireAdminApi, asyncHandler(async (_req, res) => {
  const [leads, collaborators] = await Promise.all([
    repositories.leads.list(),
    repositories.collaborators.findAll(),
  ]);

  const collaboratorMap = new Map(collaborators.map((item) => [item.id, item]));
  const grouped = new Map();

  for (const lead of leads) {
    const collaboratorId = String(lead?.collaborator_id || "").trim();
    if (!collaboratorId) continue;

    if (!grouped.has(collaboratorId)) {
      grouped.set(collaboratorId, {
        collaborator_id: collaboratorId,
        collaborator: collaboratorMap.get(collaboratorId) || null,
        total_leads: 0,
        otp_verified_count: 0,
        total_commission: 0,
        risk_score_sum: 0,
        risk_score_count: 0,
      });
    }

    const row = grouped.get(collaboratorId);
    row.total_leads += 1;
    if (lead.phone_verified) row.otp_verified_count += 1;
    row.total_commission += Number(lead.commission_estimated_eur) || 0;

    const riskScore = Number(lead.risk_score);
    if (Number.isFinite(riskScore)) {
      row.risk_score_sum += riskScore;
      row.risk_score_count += 1;
    }
  }

  const metrics = Array.from(grouped.values())
    .map((row) => ({
      collaborator_id: row.collaborator_id,
      collaborator: row.collaborator,
      total_leads: row.total_leads,
      otp_verified_count: row.otp_verified_count,
      total_commission: Math.round((row.total_commission + Number.EPSILON) * 100) / 100,
      avg_risk_score: row.risk_score_count > 0
        ? Math.round((row.risk_score_sum / row.risk_score_count) * 100) / 100
        : null,
    }))
    .sort((a, b) => b.total_leads - a.total_leads);

  return res.json({ metrics });
}));

app.get("/api/admin/metrics/by-provider", requireAdminApi, asyncHandler(async (_req, res) => {
  const [leads, providers] = await Promise.all([
    repositories.leads.list(),
    repositories.providers.list(),
  ]);

  const providerMap = new Map(providers.map((item) => [item.id, item]));
  const grouped = new Map();

  for (const lead of leads) {
    const slots = providerSlotsForLead(lead);
    const assignedIds = Array.from(new Set([slots.primaryId, slots.secondaryId].filter(Boolean)));
    if (assignedIds.length === 0) continue;

    for (const providerId of assignedIds) {
      if (!grouped.has(providerId)) {
        grouped.set(providerId, {
          provider_id: providerId,
          provider: providerMap.get(providerId) || null,
          total_assigned: 0,
          sold_count: 0,
          ticket_sum: 0,
          ticket_count: 0,
        });
      }

      const row = grouped.get(providerId);
      row.total_assigned += 1;
      if (lead.status === "sold") row.sold_count += 1;

      const ticket = Number(lead.ticket_estimated_eur);
      if (Number.isFinite(ticket)) {
        row.ticket_sum += ticket;
        row.ticket_count += 1;
      }
    }
  }

  const metrics = Array.from(grouped.values())
    .map((row) => ({
      provider_id: row.provider_id,
      provider: row.provider,
      total_assigned: row.total_assigned,
      conversion: row.total_assigned > 0
        ? Math.round((row.sold_count / row.total_assigned) * 10000) / 100
        : 0,
      avg_ticket: row.ticket_count > 0
        ? Math.round((row.ticket_sum / row.ticket_count) * 100) / 100
        : null,
    }))
    .sort((a, b) => b.total_assigned - a.total_assigned);

  return res.json({ metrics });
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
