const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. On Render this is supplied automatically by the blueprint.');
}

const needsSsl = /render\.com|amazonaws|neon\.tech|supabase/.test(connectionString || '')
  && !/sslmode=disable/.test(connectionString || '');

const pool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
  max: Number(process.env.PG_POOL_MAX || 8),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000
});

pool.on('error', err => console.error('Unexpected PostgreSQL error', err.message));

async function query(text, params) {
  return pool.query(text, params);
}

async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/* Run the schema, then seed anything that is missing. Safe to run on every boot. */
async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);

  // seed the prior recommendations once
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM prior_recs');
  if (rows[0].n === 0) {
    const recs = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'prior_recs.json'), 'utf8'));
    for (const r of recs) {
      await pool.query(
        `INSERT INTO prior_recs (id, campus, source_ref, source_label, area, issue, recommendation, responsible_officer, prior_response)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
        [r.id, r.campus, r.sourceRef, r.sourceLabel || 'Fourth Quarter 2025/2026', r.area, r.issue,
         r.recommendation, r.responsibleOfficer, r.priorResponse]);
    }
    console.log(`Seeded ${recs.length} prior recommendations.`);
  }

  // seed the access codes once
  const ac = await pool.query('SELECT count(*)::int AS n FROM access_codes');
  if (ac.rows[0].n === 0) {
    const seed = require('./data/seed_codes.js')(process.env.QA_MANAGER_CODE);
    for (const c of seed) {
      await pool.query(
        `INSERT INTO access_codes (code, role, campus, office, label) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (code) DO NOTHING`,
        [c.code, c.role, c.campus || null, c.office || null, c.label]);
    }
    console.log(`Seeded ${seed.length} access codes. Manager code: ${seed[0].code}`);
  }
}

module.exports = { pool, query, tx, migrate };
