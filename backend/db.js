const { Pool } = require('pg');

const useSSL = process.env.PGSSL !== 'false';

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS || 240_000),
  query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS || 250_000),
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('[pg] idle client error', err);
});

module.exports = { pool };
