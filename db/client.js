const { Pool } = require("pg");

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

const pool = hasDatabaseUrl
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PG_SSL_DISABLE === "true"
        ? false
        : { rejectUnauthorized: false },
    })
  : null;

async function query(text, params = []) {
  if (!pool) {
    throw new Error("DATABASE_URL is not defined");
  }
  return pool.query(text, params);
}

async function withTransaction(run) {
  if (!pool) {
    throw new Error("DATABASE_URL is not defined");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  withTransaction,
};
