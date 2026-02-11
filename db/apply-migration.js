#!/usr/bin/env node
require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { pool } = require("./client");

const DEFAULT_MIGRATION = "migrations/20260211_01_leads_decision_fields.sql";

async function main() {
  if (!pool) {
    throw new Error("DATABASE_URL is required to apply migrations");
  }

  const migrationArg = process.argv[2] || DEFAULT_MIGRATION;
  const migrationPath = path.isAbsolute(migrationArg)
    ? migrationArg
    : path.join(process.cwd(), migrationArg);

  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration file not found: ${migrationPath}`);
  }

  const sql = fs.readFileSync(migrationPath, "utf8");
  await pool.query(sql);
  await pool.end();
  console.log(`Migration applied successfully: ${migrationArg}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
