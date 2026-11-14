const { Pool } = require('pg');

// Lit DATABASE_URL, ou à défaut PGHOST / PGUSER / PGPASSWORD / PGDATABASE
const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS refuge_sites (
  id         INTEGER PRIMARY KEY,
  site       TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`;

async function init(retries = 10) {
  for (let i = 1; ; i++) {
    try { await pool.query(SCHEMA); return; }
    catch (e) {
      if (i >= retries) throw e;
      console.log(`Base indisponible (${e.code || e.message}), nouvel essai ${i}/${retries}…`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}
module.exports = { pool, init };
