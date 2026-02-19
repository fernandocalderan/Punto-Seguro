#!/usr/bin/env node
require("dotenv").config();

const { URL } = require("node:url");

function resolveDatabaseUrl() {
  const direct = String(process.env.DATABASE_URL || "").trim();
  if (direct) return direct;

  const candidates = [
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.DATABASE_URL_UNPOOLED,
    process.env.POSTGRES_URL_NO_SSL,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);

  for (const raw of candidates) {
    try {
      const parsed = new URL(raw);
      const protocol = String(parsed.protocol || "").toLowerCase();
      if (!protocol.startsWith("postgres")) continue;
      if (!parsed.searchParams.get("sslmode")) {
        parsed.searchParams.set("sslmode", "require");
      }
      return parsed.toString();
    } catch (_error) {
      // Ignore malformed candidate and continue.
    }
  }

  const host = String(process.env.PGHOST || process.env.POSTGRES_HOST || "").trim();
  const user = String(process.env.PGUSER || process.env.POSTGRES_USER || "").trim();
  const pass = String(process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || "").trim();
  const db = String(process.env.PGDATABASE || process.env.POSTGRES_DATABASE || "").trim();
  const port = String(process.env.PGPORT || "").trim();
  if (host && user && pass && db) {
    const portPart = port ? `:${port}` : "";
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}${portPart}/${db}?sslmode=require`;
  }

  return "";
}

function describeDatabaseTarget(connectionString) {
  try {
    const parsed = new URL(connectionString);
    const host = parsed.hostname || "unknown-host";
    const dbName = String(parsed.pathname || "").replace(/^\/+/, "") || "unknown-db";
    return `${host}/${dbName}`;
  } catch (_error) {
    return "unknown";
  }
}

async function main() {
  const resolved = resolveDatabaseUrl();
  if (resolved) {
    process.env.DATABASE_URL = resolved;
  }

  const { query, pool } = require("./client");
  if (!pool) {
    console.error(
      "No se encontro DATABASE_URL ni alternativas. Anade en .env una de estas: DATABASE_URL, POSTGRES_URL, DATABASE_URL_UNPOOLED, POSTGRES_URL_NON_POOLING, POSTGRES_PRISMA_URL"
    );
    process.exit(1);
  }

  try {
    await query("SELECT 1 AS ok");
    console.log(`DB OK: ${describeDatabaseTarget(process.env.DATABASE_URL)}`);
    await pool.end();
  } catch (error) {
    const msg = error && error.message ? error.message : "connection_error";
    console.error(`DB ERROR: ${msg}`);
    try {
      await pool.end();
    } catch (_ignored) {}
    process.exit(1);
  }
}

main().catch((error) => {
  const msg = error && error.message ? error.message : String(error);
  console.error(`DB ERROR: ${msg}`);
  process.exit(1);
});
