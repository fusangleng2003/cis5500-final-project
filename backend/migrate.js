require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function main() {
  const file = process.argv[2] || path.join(__dirname, '..', 'sql', 'indexes.sql');
  const sql = fs.readFileSync(file, 'utf8');
  console.log(`[migrate] running ${file}`);
  const client = await pool.connect();
  try {
    const t0 = Date.now();
    await client.query(sql);
    console.log(`[migrate] ok in ${Date.now() - t0} ms`);
    const { rows } = await client.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
         AND (tablename ILIKE 'game' OR tablename ILIKE 'review')
       ORDER BY indexname`,
    );
    console.log('[migrate] indexes now present:');
    for (const r of rows) console.log('  -', r.indexname);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate] failed:', err.message);
  process.exit(1);
});
