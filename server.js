/* ==========================================================================
   CBE QUALITY AUDIT SYSTEM — server
   Express + PostgreSQL. Everything the audit team and the responsible offices
   need happens inside the application; nothing is exchanged by file.
   ========================================================================== */

const express = require('express');
const cookieSession = require('cookie-session');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');
const { identityList } = require('./data/reference');

const app = express();
const PORT = process.env.PORT || 3000;
const YEAR = process.env.ACADEMIC_YEAR || '2026/2027';
const QUARTER = process.env.QUARTER || 'First';

app.set('trust proxy', 1);
app.use(express.json({ limit: '8mb' }));
app.use(cookieSession({
  name: 'qas',
  keys: [process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex')],
  maxAge: 14 * 24 * 60 * 60 * 1000,
  sameSite: 'lax',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production'
}));

/* ------------------------------ helpers -------------------------------- */
const ROLES = {
  qa_manager: { rank: 4, label: 'Quality Assurance Manager' },
  auditor:    { rank: 3, label: 'Auditor' },
  office:     { rank: 2, label: 'Responsible Office' },
  viewer:     { rank: 1, label: 'Viewer' }
};
const wrap = fn => (req, res) => fn(req, res).catch(err => {
  console.error(req.method, req.path, err.message);
  res.status(500).json({ error: 'Server error. Please try again.' });
});
function who(req) { return req.session && req.session.role ? req.session : null; }
function requireAuth(req, res, next) {
  if (!who(req)) return res.status(401).json({ error: 'Not signed in' });
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    const u = who(req);
    if (!u) return res.status(401).json({ error: 'Not signed in' });
    if (!roles.includes(u.role)) return res.status(403).json({ error: 'Your access code does not allow this action.' });
    next();
  };
}
async function log(auditId, req, action, detail) {
  const u = who(req) || {};
  await db.query('INSERT INTO activity (audit_id, actor, role, action, detail) VALUES ($1,$2,$3,$4,$5)',
    [auditId || null, u.name || u.label || 'unknown', u.role || '-', action, (detail || '').slice(0, 500)]);
}
/* An auditor may only touch their own campus; the manager may touch any. */
async function canWrite(req, auditId) {
  const u = who(req);
  if (!u) return false;
  if (u.role === 'qa_manager') return true;
  if (u.role !== 'auditor') return false;
  const { rows } = await db.query('SELECT campus FROM audits WHERE id=$1', [auditId]);
  return rows.length > 0 && rows[0].campus === u.campus;
}
const nextRev = 'nextval(\'rev_seq\')';

/* ------------------------------- auth ---------------------------------- */
/* WHO MAY SIGN IN — the cards on the sign-in screen. */
app.get('/api/roles', (req, res) => {
  res.json({ year: YEAR, quarter: QUARTER,
    identities: identityList().map(i => ({ key: i.key, role: i.role, label: i.label,
      note: i.note, campus: i.campus || null, office: i.office || null })) });
});

/* SIGNING IN. You choose your identity and give your name.
   A PIN is demanded only if one has been set for that identity in the
   database — none are by default. */
app.post('/api/login', wrap(async (req, res) => {
  const key = String(req.body.key || '');
  const name = String(req.body.name || '').trim().slice(0, 80);
  const pin = String(req.body.pin || '').trim();
  if (!name) return res.status(400).json({ error: 'Enter your name so entries can be attributed.' });

  const identity = identityList().find(i => i.key === key);
  if (!identity) return res.status(400).json({ error: 'Choose who you are.' });

  const { rows } = await db.query(
    `SELECT pin FROM access_codes
      WHERE role=$1 AND coalesce(campus,'')=coalesce($2,'')
        AND coalesce(office,'')=coalesce($3,'')
        AND active AND pin IS NOT NULL AND pin <> '' LIMIT 1`,
    [identity.role, identity.campus || null, identity.office || null]);

  if (rows.length > 0) {
    if (!pin) return res.status(401).json({ error: 'A PIN is required for this role.', pinRequired: true });
    if (pin !== rows[0].pin) {
      await new Promise(r => setTimeout(r, 600));
      return res.status(401).json({ error: 'That PIN is not correct.', pinRequired: true });
    }
  }

  req.session.role = identity.role;
  req.session.campus = identity.campus || null;
  req.session.office = identity.office || null;
  req.session.label = identity.label;
  req.session.name = name;
  req.session.code = identity.key;
  req.session.token = crypto.randomBytes(8).toString('hex');
  await log(null, req, 'signed in', identity.label);
  res.json({ ok: true, me: me(req) });
}));

function me(req) {
  const u = who(req);
  if (!u) return null;
  return { role: u.role, roleLabel: ROLES[u.role].label, campus: u.campus || null,
    office: u.office || null, label: u.label, name: u.name, token: u.token };
}
app.get('/api/me', (req, res) => res.json({ me: me(req), year: YEAR, quarter: QUARTER }));
app.post('/api/logout', (req, res) => { req.session = null; res.json({ ok: true }); });

/* ------------------------------ audits --------------------------------- */
app.get('/api/audits', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT a.id, a.campus, a.academic_year, a.quarter, a.session, a.locked, a.issued_at, a.updated_at,
       (SELECT count(*)::int FROM audit_items i WHERE i.audit_id=a.id AND i.data->>'status' <> '') AS items_done,
       (SELECT count(*)::int FROM audit_followups f WHERE f.audit_id=a.id AND f.data->>'status' <> '') AS fu_done,
       (SELECT count(*)::int FROM audit_responses r WHERE r.audit_id=a.id AND coalesce(r.data->>'response','') <> '') AS responses
     FROM audits a WHERE a.academic_year=$1 AND a.quarter=$2 ORDER BY a.campus`, [YEAR, QUARTER]);
  res.json({ audits: rows });
}));

app.post('/api/audits', requireRole('qa_manager', 'auditor'), wrap(async (req, res) => {
  const u = who(req);
  const campus = String(req.body.campus || '').trim();
  if (!campus) return res.status(400).json({ error: 'Campus is required.' });
  if (u.role === 'auditor' && u.campus !== campus)
    return res.status(403).json({ error: 'Your access code is limited to ' + u.campus + ' Campus.' });
  const { rows } = await db.query(
    `INSERT INTO audits (campus, academic_year, quarter, session, standards)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (campus, academic_year, quarter) DO UPDATE SET updated_at=now()
     RETURNING *`,
    [campus, YEAR, QUARTER, JSON.stringify(req.body.session || {}), JSON.stringify(req.body.standards || {})]);
  await log(rows[0].id, req, 'opened audit file', campus);
  res.json({ audit: rows[0] });
}));

/* Full snapshot of one audit, plus the prior recommendations for its campus */
app.get('/api/audit/:id', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const a = await db.query('SELECT * FROM audits WHERE id=$1', [id]);
  if (!a.rows.length) return res.status(404).json({ error: 'Audit not found' });
  const audit = a.rows[0];
  const [items, grids, fu, resp, prior, act] = await Promise.all([
    db.query('SELECT item_id, data, rev, updated_by FROM audit_items WHERE audit_id=$1', [id]),
    db.query('SELECT grid_id, rows, rev, updated_by FROM audit_grids WHERE audit_id=$1', [id]),
    db.query('SELECT rec_id, data, rev, updated_by FROM audit_followups WHERE audit_id=$1', [id]),
    db.query('SELECT issue_ref, data, rev, updated_by FROM audit_responses WHERE audit_id=$1', [id]),
    db.query('SELECT * FROM prior_recs WHERE campus=$1 ORDER BY source_ref', [audit.campus]),
    db.query('SELECT actor, role, action, detail, at FROM activity WHERE audit_id=$1 ORDER BY at DESC LIMIT 40', [id])
  ]);
  const maxRev = Math.max(Number(audit.rev),
    ...[items, grids, fu, resp].flatMap(r => r.rows.map(x => Number(x.rev))), 0);
  res.json({
    audit: {
      id: audit.id, campus: audit.campus, academicYear: audit.academic_year, quarter: audit.quarter,
      session: audit.session, general: audit.general, standards: audit.standards,
      wayForward: audit.way_forward, locked: audit.locked, issuedAt: audit.issued_at
    },
    items: Object.fromEntries(items.rows.map(r => [r.item_id, r.data])),
    grids: Object.fromEntries(grids.rows.map(r => [r.grid_id, r.rows])),
    followUp: Object.fromEntries(fu.rows.map(r => [r.rec_id, r.data])),
    responses: Object.fromEntries(resp.rows.map(r => [r.issue_ref, r.data])),
    priorRecs: prior.rows.map(r => ({
      id: r.id, campus: r.campus, sourceRef: r.source_ref, sourceLabel: r.source_label,
      area: r.area, issue: r.issue, recommendation: r.recommendation,
      responsibleOfficer: r.responsible_officer, priorResponse: r.prior_response })),
    activity: act.rows,
    rev: maxRev
  });
}));

/* Everything that changed since the client's last revision */
app.get('/api/audit/:id/since', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id), since = Number(req.query.rev || 0);
  const [a, items, grids, fu, resp] = await Promise.all([
    db.query('SELECT * FROM audits WHERE id=$1 AND rev>$2', [id, since]),
    db.query('SELECT item_id, data, rev, updated_by FROM audit_items WHERE audit_id=$1 AND rev>$2', [id, since]),
    db.query('SELECT grid_id, rows, rev, updated_by FROM audit_grids WHERE audit_id=$1 AND rev>$2', [id, since]),
    db.query('SELECT rec_id, data, rev, updated_by FROM audit_followups WHERE audit_id=$1 AND rev>$2', [id, since]),
    db.query('SELECT issue_ref, data, rev, updated_by FROM audit_responses WHERE audit_id=$1 AND rev>$2', [id, since])
  ]);
  const maxRev = Math.max(since,
    ...[a, items, grids, fu, resp].flatMap(r => r.rows.map(x => Number(x.rev))), since);
  const out = { rev: maxRev, items: {}, grids: {}, followUp: {}, responses: {}, by: {} };
  items.rows.forEach(r => { out.items[r.item_id] = r.data; out.by[r.item_id] = r.updated_by; });
  grids.rows.forEach(r => { out.grids[r.grid_id] = r.rows; });
  fu.rows.forEach(r => { out.followUp[r.rec_id] = r.data; });
  resp.rows.forEach(r => { out.responses[r.issue_ref] = r.data; });
  if (a.rows.length) {
    const x = a.rows[0];
    out.audit = { session: x.session, general: x.general, standards: x.standards,
      wayForward: x.way_forward, locked: x.locked };
  }
  res.json(out);
}));

/* ----------------------------- writes ---------------------------------- */
async function guard(req, res, id) {
  if (!(await canWrite(req, id))) {
    res.status(403).json({ error: 'Your access code does not allow editing this campus.' });
    return false;
  }
  const { rows } = await db.query('SELECT locked FROM audits WHERE id=$1', [id]);
  if (rows.length && rows[0].locked && who(req).role !== 'qa_manager') {
    res.status(423).json({ error: 'This audit has been issued and is locked for editing.' });
    return false;
  }
  return true;
}

app.post('/api/audit/:id/session', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await guard(req, res, id))) return;
  const f = { session: 'session', general: 'general', standards: 'standards', wayForward: 'way_forward' };
  const sets = [], vals = [id];
  Object.keys(f).forEach(k => {
    if (req.body[k] !== undefined) { vals.push(JSON.stringify(req.body[k])); sets.push(`${f[k]}=$${vals.length}`); }
  });
  if (!sets.length) return res.json({ ok: true });
  const { rows } = await db.query(
    `UPDATE audits SET ${sets.join(',')}, rev=${nextRev}, updated_at=now() WHERE id=$1 RETURNING rev`, vals);
  res.json({ ok: true, rev: Number(rows[0].rev) });
}));

app.post('/api/audit/:id/item', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await guard(req, res, id))) return;
  const { itemId, data } = req.body;
  if (!itemId) return res.status(400).json({ error: 'itemId required' });
  const { rows } = await db.query(
    `INSERT INTO audit_items (audit_id, item_id, data, updated_by) VALUES ($1,$2,$3,$4)
     ON CONFLICT (audit_id, item_id) DO UPDATE SET data=$3, updated_by=$4, rev=${nextRev}, updated_at=now()
     RETURNING rev`, [id, itemId, JSON.stringify(data || {}), who(req).name]);
  res.json({ ok: true, rev: Number(rows[0].rev) });
}));

app.post('/api/audit/:id/grid', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await guard(req, res, id))) return;
  const { gridId, rows: gridRows } = req.body;
  if (!gridId) return res.status(400).json({ error: 'gridId required' });
  if (!Array.isArray(gridRows)) return res.status(400).json({ error: 'rows must be an array' });
  if (gridRows.length > 5000) return res.status(413).json({ error: 'That sheet is too large (limit 5000 rows).' });
  const { rows } = await db.query(
    `INSERT INTO audit_grids (audit_id, grid_id, rows, updated_by) VALUES ($1,$2,$3,$4)
     ON CONFLICT (audit_id, grid_id) DO UPDATE SET rows=$3, updated_by=$4, rev=${nextRev}, updated_at=now()
     RETURNING rev`, [id, gridId, JSON.stringify(gridRows), who(req).name]);
  res.json({ ok: true, rev: Number(rows[0].rev) });
}));

app.post('/api/audit/:id/followup', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await guard(req, res, id))) return;
  const { recId, data } = req.body;
  if (!recId) return res.status(400).json({ error: 'recId required' });
  const { rows } = await db.query(
    `INSERT INTO audit_followups (audit_id, rec_id, data, updated_by) VALUES ($1,$2,$3,$4)
     ON CONFLICT (audit_id, rec_id) DO UPDATE SET data=$3, updated_by=$4, rev=${nextRev}, updated_at=now()
     RETURNING rev`, [id, recId, JSON.stringify(data || {}), who(req).name]);
  res.json({ ok: true, rev: Number(rows[0].rev) });
}));

/* Add a prior recommendation manually (campuses with no report on file) */
app.post('/api/prior', requireRole('qa_manager', 'auditor'), wrap(async (req, res) => {
  const u = who(req);
  const campus = String(req.body.campus || u.campus || '');
  if (u.role === 'auditor' && campus !== u.campus)
    return res.status(403).json({ error: 'Limited to your campus.' });
  const id = 'MAN' + crypto.randomBytes(4).toString('hex').toUpperCase();
  await db.query(
    `INSERT INTO prior_recs (id, campus, source_ref, source_label, area, issue, recommendation, responsible_officer, prior_response)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'')`,
    [id, campus, req.body.sourceRef || 'added', req.body.sourceLabel || 'Added during this audit',
     req.body.area || 'New recommendation', req.body.issue || '', req.body.recommendation || '',
     req.body.responsibleOfficer || '']);
  await log(null, req, 'added a prior recommendation', campus);
  res.json({ ok: true, id });
}));
app.put('/api/prior/:id', requireRole('qa_manager', 'auditor'), wrap(async (req, res) => {
  await db.query(
    `UPDATE prior_recs SET area=$2, issue=$3, recommendation=$4, responsible_officer=$5 WHERE id=$1`,
    [req.params.id, req.body.area || '', req.body.issue || '', req.body.recommendation || '',
     req.body.responsibleOfficer || '']);
  res.json({ ok: true });
}));
app.delete('/api/prior/:id', requireRole('qa_manager'), wrap(async (req, res) => {
  await db.query("DELETE FROM prior_recs WHERE id=$1 AND id LIKE 'MAN%'", [req.params.id]);
  res.json({ ok: true });
}));

/* --------------------- issuing and management responses ----------------- */
app.post('/api/audit/:id/issue', requireRole('qa_manager'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  await db.query(`UPDATE audits SET locked=$2, issued_at=CASE WHEN $2 THEN now() ELSE NULL END,
    rev=${nextRev}, updated_at=now() WHERE id=$1`, [id, req.body.locked !== false]);
  await log(id, req, req.body.locked === false ? 'reopened the audit for editing' : 'issued the report to responsible offices', '');
  res.json({ ok: true });
}));

/* The register of issues an office must respond to — built on the server from
   the recorded items so an office never sees another office's findings.      */
app.get('/api/my-issues', requireAuth, wrap(async (req, res) => {
  const u = who(req);
  const { rows } = await db.query(
    `SELECT a.id, a.campus, a.session, a.issued_at, a.locked, i.item_id, i.data
       FROM audits a JOIN audit_items i ON i.audit_id=a.id
      WHERE a.academic_year=$1 AND a.quarter=$2
        AND i.data->>'status' IN ('NC','PC')`, [YEAR, QUARTER]);
  const resp = await db.query(
    `SELECT r.audit_id, r.issue_ref, r.data FROM audit_responses r
       JOIN audits a ON a.id=r.audit_id WHERE a.academic_year=$1 AND a.quarter=$2`, [YEAR, QUARTER]);
  const respMap = {};
  resp.rows.forEach(r => { respMap[r.audit_id + '|' + r.issue_ref] = r.data; });
  const out = rows
    .filter(r => u.role !== 'office' || (r.data.responsible === u.office))
    .filter(r => u.role === 'qa_manager' || r.issued_at)     // offices see issued reports only
    .map(r => ({
      auditId: r.id, campus: r.campus, itemId: r.item_id,
      ref: r.data.reportRef || r.item_id, area: r.data.area, issue: r.data.issue,
      rec: r.data.rec, responsible: r.data.responsible, severity: r.data.severity,
      target: r.data.target, issuedAt: r.issued_at,
      response: respMap[r.id + '|' + (r.data.reportRef || r.item_id)] || null
    }));
  res.json({ issues: out });
}));

app.post('/api/audit/:id/response', requireAuth, wrap(async (req, res) => {
  const u = who(req);
  const id = Number(req.params.id);
  const { issueRef, data } = req.body;
  if (!issueRef) return res.status(400).json({ error: 'issueRef required' });
  if (u.role === 'viewer') return res.status(403).json({ error: 'Viewers cannot submit responses.' });
  if (u.role === 'office') {
    const { rows } = await db.query(
      `SELECT data FROM audit_items WHERE audit_id=$1 AND data->>'reportRef'=$2`, [id, issueRef]);
    if (!rows.length || rows[0].data.responsible !== u.office)
      return res.status(403).json({ error: 'That issue is not assigned to your office.' });
  }
  const payload = Object.assign({}, data, { by: data.by || u.name, office: u.office || data.office || '',
    date: new Date().toISOString().slice(0, 10) });
  const { rows } = await db.query(
    `INSERT INTO audit_responses (audit_id, issue_ref, data, updated_by) VALUES ($1,$2,$3,$4)
     ON CONFLICT (audit_id, issue_ref) DO UPDATE SET data=$3, updated_by=$4, rev=${nextRev}, updated_at=now()
     RETURNING rev`, [id, issueRef, JSON.stringify(payload), u.name]);
  await log(id, req, 'submitted a management response', issueRef);
  res.json({ ok: true, rev: Number(rows[0].rev) });
}));

/* ----------------------- consolidation across campuses ------------------ */
app.get('/api/consolidated', requireAuth, wrap(async (req, res) => {
  const { rows: audits } = await db.query(
    'SELECT * FROM audits WHERE academic_year=$1 AND quarter=$2 ORDER BY campus', [YEAR, QUARTER]);
  const out = [];
  for (const a of audits) {
    const [items, grids, fu, resp, prior] = await Promise.all([
      db.query('SELECT item_id, data FROM audit_items WHERE audit_id=$1', [a.id]),
      db.query('SELECT grid_id, rows FROM audit_grids WHERE audit_id=$1', [a.id]),
      db.query('SELECT rec_id, data FROM audit_followups WHERE audit_id=$1', [a.id]),
      db.query('SELECT issue_ref, data FROM audit_responses WHERE audit_id=$1', [a.id]),
      db.query('SELECT * FROM prior_recs WHERE campus=$1', [a.campus])
    ]);
    out.push({
      audit: { id: a.id, campus: a.campus, academicYear: a.academic_year, quarter: a.quarter,
        session: a.session, general: a.general, standards: a.standards, wayForward: a.way_forward,
        locked: a.locked, issuedAt: a.issued_at },
      items: Object.fromEntries(items.rows.map(r => [r.item_id, r.data])),
      grids: Object.fromEntries(grids.rows.map(r => [r.grid_id, r.rows])),
      followUp: Object.fromEntries(fu.rows.map(r => [r.rec_id, r.data])),
      responses: Object.fromEntries(resp.rows.map(r => [r.issue_ref, r.data])),
      priorRecs: prior.rows.map(r => ({ id: r.id, campus: r.campus, sourceRef: r.source_ref,
        area: r.area, issue: r.issue, recommendation: r.recommendation,
        responsibleOfficer: r.responsible_officer, priorResponse: r.prior_response }))
    });
  }
  res.json({ campuses: out });
}));

/* ---------------------------- presence --------------------------------- */
app.post('/api/presence', requireAuth, wrap(async (req, res) => {
  const u = who(req);
  await db.query(
    `INSERT INTO presence (token, audit_id, actor, role, screen, seen_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (token) DO UPDATE SET audit_id=$2, screen=$5, seen_at=now()`,
    [u.token, req.body.auditId || null, u.name, u.role, String(req.body.screen || '').slice(0, 40)]);
  await db.query("DELETE FROM presence WHERE seen_at < now() - interval '5 minutes'");
  const { rows } = await db.query(
    `SELECT actor, role, screen FROM presence WHERE audit_id=$1 AND token<>$2 ORDER BY seen_at DESC LIMIT 12`,
    [req.body.auditId || null, u.token]);
  res.json({ others: rows });
}));

/* -------------------------- access-code admin --------------------------- */
app.get('/api/codes', requireRole('qa_manager'), wrap(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM access_codes ORDER BY role, label');
  res.json({ codes: rows });
}));
app.post('/api/codes', requireRole('qa_manager'), wrap(async (req, res) => {
  const { role, campus, office, label } = req.body;
  if (!ROLES[role]) return res.status(400).json({ error: 'Unknown role' });
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const rnd = n => Array.from({ length: n }, () => chars[crypto.randomInt(chars.length)]).join('');
  const code = `CBE-${(role === 'auditor' ? (campus || 'AUD') : role === 'office' ? 'OFF' : role.toUpperCase().slice(0, 4))}-${rnd(5)}`.toUpperCase();
  await db.query('INSERT INTO access_codes (code, role, campus, office, label) VALUES ($1,$2,$3,$4,$5)',
    [code, role, campus || null, office || null, label || role]);
  await log(null, req, 'created an access code', label || role);
  res.json({ ok: true, code });
}));
app.patch('/api/codes/:code', requireRole('qa_manager'), wrap(async (req, res) => {
  const cur = who(req);
  if (req.params.code === cur.code) return res.status(400).json({ error: 'You cannot deactivate the code you are using.' });
  await db.query('UPDATE access_codes SET active=$2, label=coalesce($3,label) WHERE code=$1',
    [req.params.code, req.body.active !== false, req.body.label || null]);
  await log(null, req, 'updated an access code', req.params.code);
  res.json({ ok: true });
}));

/* ------------------------- backup and restore --------------------------- */
app.get('/api/backup', requireRole('qa_manager'), wrap(async (req, res) => {
  const tables = ['audits', 'audit_items', 'audit_grids', 'audit_followups', 'audit_responses',
    'prior_recs', 'access_codes', 'activity'];
  const dump = { kind: 'cbe-qas-backup', takenAt: new Date().toISOString(), tables: {} };
  for (const t of tables) dump.tables[t] = (await db.query(`SELECT * FROM ${t}`)).rows;
  await log(null, req, 'downloaded a database backup', '');
  res.setHeader('Content-Disposition',
    `attachment; filename="CBE-QAS-BACKUP-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(dump);
}));

app.post('/api/restore', requireRole('qa_manager'), wrap(async (req, res) => {
  const d = req.body;
  if (!d || d.kind !== 'cbe-qas-backup') return res.status(400).json({ error: 'Not a backup file.' });
  await db.tx(async c => {
    await c.query('TRUNCATE audit_responses, audit_followups, audit_grids, audit_items, activity, audits RESTART IDENTITY CASCADE');
    const J = v => (v === null || v === undefined) ? null : JSON.stringify(v);
    for (const a of d.tables.audits || []) {
      await c.query(`INSERT INTO audits (id, campus, academic_year, quarter, session, general, standards,
        way_forward, locked, issued_at, rev, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [a.id, a.campus, a.academic_year, a.quarter, J(a.session), J(a.general), J(a.standards), J(a.way_forward),
         a.locked, a.issued_at, a.rev, a.created_at, a.updated_at]);
    }
    const simple = {
      audit_items: ['audit_id', 'item_id', 'data', 'rev', 'updated_by', 'updated_at'],
      audit_grids: ['audit_id', 'grid_id', 'rows', 'rev', 'updated_by', 'updated_at'],
      audit_followups: ['audit_id', 'rec_id', 'data', 'rev', 'updated_by', 'updated_at'],
      audit_responses: ['audit_id', 'issue_ref', 'data', 'rev', 'updated_by', 'updated_at']
    };
    for (const [t, cols] of Object.entries(simple)) {
      for (const r of d.tables[t] || []) {
        await c.query(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')})`,
          cols.map(k => (k === 'data' || k === 'rows') ? J(r[k]) : r[k]));
      }
    }
    for (const r of d.tables.prior_recs || []) {
      await c.query(`INSERT INTO prior_recs (id, campus, source_ref, source_label, area, issue, recommendation,
        responsible_officer, prior_response) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
        [r.id, r.campus, r.source_ref, r.source_label, r.area, r.issue, r.recommendation,
         r.responsible_officer, r.prior_response]);
    }
    await c.query(`SELECT setval('audits_id_seq', GREATEST((SELECT coalesce(max(id),1) FROM audits), 1))`);
    await c.query(`SELECT setval('rev_seq', GREATEST((SELECT coalesce(max(rev),1) FROM audits), 1))`);
  });
  await log(null, req, 'restored the database from a backup', d.takenAt || '');
  res.json({ ok: true });
}));

/* ------------------------------ activity -------------------------------- */
app.get('/api/activity', requireRole('qa_manager'), wrap(async (req, res) => {
  const { rows } = await db.query(
    'SELECT audit_id, actor, role, action, detail, at FROM activity ORDER BY at DESC LIMIT 200');
  res.json({ activity: rows });
}));

/* ------------------------------- static --------------------------------- */
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', etag: true }));
app.get('/healthz', (req, res) => res.type('text').send('ok'));
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* -------------------------------- boot ---------------------------------- */
db.migrate()
  .then(() => app.listen(PORT, () => console.log(`CBE Quality Audit System listening on ${PORT} (${YEAR}, ${QUARTER} quarter)`)))
  .catch(err => { console.error('Startup failed:', err); process.exit(1); });
