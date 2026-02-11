#!/usr/bin/env node
require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { pool } = require("./client");

async function main() {
  if (!pool) {
    throw new Error("DATABASE_URL is required to apply schema");
  }

  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
  await pool.end();
  console.log("Schema applied successfully");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
