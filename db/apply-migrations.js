#!/usr/bin/env node
require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { pool } = require("./client");

function isSqlFile(fileName) {
  return fileName.toLowerCase().endsWith(".sql");
}

async function main() {
  if (!pool) {
    throw new Error("DATABASE_URL is required to apply migrations");
  }

  const migrationsDir = path.join(process.cwd(), "migrations");
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && isSqlFile(entry.name))
    .map((entry) => entry.name)
    .sort();

  if (files.length === 0) {
    console.log("No migrations to apply.");
    await pool.end();
    return;
  }

  for (const fileName of files) {
    const migrationPath = path.join(migrationsDir, fileName);
    const sql = fs.readFileSync(migrationPath, "utf8");
    await pool.query(sql);
    console.log(`Migration applied successfully: migrations/${fileName}`);
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

