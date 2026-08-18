/* ==========================================================================
   CBE QUALITY AUDIT SYSTEM — client
   State is held on the server. Every change is posted as it is made and the
   client pulls other people's changes every few seconds, so an audit team can
   work on the same campus file at the same time.
   ========================================================================== */

const APP_VERSION = '2.0';
let PRIOR_RECS = [];            // supplied by the server for the open campus
let ME = null;                  // { role, campus, office, name, ... }
let META = { year: '2026/2027', quarter: 'First' };
let AUDITS = [];                // campus list for the dashboard
let REV = 0;                    // highest revision seen
let OTHERS = [];                // other people in this audit right now

function blankState() {
  return {
    auditId: null,
    session: { campus: '', academicYear: META.year, quarter: META.quarter, dateFrom: '', dateTo: '',
      leadAuditor: '', team: '', submittedTo: 'Deputy Rector – Academic, Research and Consultancy' },
    standards: { ...DEFAULT_STANDARDS },
    general: {}, items: {}, grids: {}, followUp: {}, responses: {},
    wayForward: [], locked: false, issuedAt: null
  };
}
let S = blankState();
let UI = { screen: 'dashboard', open: {}, busy: false, lastSync: null, error: null };

/* ------------------------------- API ------------------------------------ */
const API = {
  async call(method, url, body) {
    const r = await fetch(url, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    if (r.status === 401 && !url.startsWith('/api/login')) {
      let msg = 'Your session has expired. Please sign in again.';
      ME = null; render(); throw new Error(msg);
    }
    let d = null;
    try { d = await r.json(); } catch (e) { }
    if (!r.ok) throw new Error((d && d.error) || `Request failed (${r.status})`);
    return d;
  },
  get(u) { return this.call('GET', u); },
  post(u, b) { return this.call('POST', u, b); },
  put(u, b) { return this.call('PUT', u, b); },
  patch(u, b) { return this.call('PATCH', u, b); },
  del(u) { return this.call('DELETE', u); }
};

/* --------------------------- saving (debounced) -------------------------- */
const pending = new Map();
let flushTimer = null;
function queueSave(key, fn) {
  pending.set(key, fn);
  setSaveState('saving');
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushSaves, 700);
}
async function flushSaves() {
  if (!pending.size) return;
  const jobs = Array.from(pending.values());
  pending.clear();
  try {
    for (const j of jobs) { const r = await j(); if (r && r.rev) REV = Math.max(REV, r.rev); }
    setSaveState('saved');
  } catch (e) {
    setSaveState('error', e.message);
    toast(e.message, 5000);
  }
}
function setSaveState(state, msg) {
  const el = document.getElementById('saveState');
  if (!el) return;
  el.textContent = state === 'saving' ? 'Saving…'
    : state === 'saved' ? 'All changes saved'
    : msg || 'Not saved';
  el.style.color = state === 'error' ? '#ffd2d9' : '';
  UI.lastSync = new Date();
}
const saveSession  = () => queueSave('session', () => API.post(`/api/audit/${S.auditId}/session`,
  { session: S.session, general: S.general, standards: S.standards, wayForward: S.wayForward }));
const saveItem     = id => queueSave('item:' + id, () => API.post(`/api/audit/${S.auditId}/item`,
  { itemId: id, data: S.items[id] }));
const saveGrid     = gid => queueSave('grid:' + gid, () => API.post(`/api/audit/${S.auditId}/grid`,
  { gridId: gid, rows: S.grids[gid] || [] }));
const saveFollowUp = rid => queueSave('fu:' + rid, () => API.post(`/api/audit/${S.auditId}/followup`,
  { recId: rid, data: S.followUp[rid] }));

/* --------------------------- pulling changes ----------------------------- */
let pollTimer = null;
function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!S.auditId || !ME || document.hidden) return;
    try {
      const d = await API.get(`/api/audit/${S.auditId}/since?rev=${REV}`);
      if (!d || d.rev === REV) { pingPresence(); return; }
      let changed = false;
      const focus = document.activeElement;
      const focusKey = focus && focus.dataset ? (focus.dataset.s || focus.dataset.g || '') : '';
      Object.entries(d.items || {}).forEach(([k, v]) => {
        if (focusKey.includes(`items.${k}.`)) return;            // don't yank what someone is typing
        S.items[k] = v; changed = true;
      });
      Object.entries(d.grids || {}).forEach(([k, v]) => {
        if (focus && focus.dataset && focus.dataset.g === k) return;
        S.grids[k] = v; changed = true;
      });
      Object.entries(d.followUp || {}).forEach(([k, v]) => {
        if (focusKey.includes(`followUp.${k}.`)) return;
        S.followUp[k] = v; changed = true;
      });
      Object.entries(d.responses || {}).forEach(([k, v]) => { S.responses[k] = v; changed = true; });
      if (d.audit && !focusKey.startsWith('session.') && !focusKey.startsWith('general.')) {
        S.session = Object.assign(S.session, d.audit.session || {});
        S.general = Object.assign(S.general, d.audit.general || {});
        S.standards = Object.assign(S.standards, d.audit.standards || {});
        if (Array.isArray(d.audit.wayForward)) S.wayForward = d.audit.wayForward;
        S.locked = !!d.audit.locked;
        changed = true;
      }
      REV = d.rev;
      if (changed && !pending.size) { render(); }
      pingPresence();
    } catch (e) { /* offline for a moment; keep going */ }
  }, 7000);
}
async function pingPresence() {
  try {
    const d = await API.post('/api/presence', { auditId: S.auditId, screen: UI.screen });
    OTHERS = d.others || [];
    const el = document.getElementById('others');
    if (el) el.innerHTML = OTHERS.length
      ? `<span class="chip" title="${OTHERS.map(o => esc(o.actor + ' — ' + o.screen)).join('\n')}">${OTHERS.length} other${OTHERS.length > 1 ? 's' : ''} online</span>` : '';
  } catch (e) { }
}

/* ------------------------------ helpers ---------------------------------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl2br = s => esc(s).replace(/\n/g, '<br>');
function toast(msg, ms) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms || 2800);
}
function campusObj() { return CAMPUSES.find(c => c.id === S.session.campus) || { id: '', name: '—', full: '—' }; }
function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).length === 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d)) return String(iso);
  const m = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${ordinal(d.getDate())} ${m[d.getMonth()]}, ${d.getFullYear()}`;
}
function dateRange() {
  const a = S.session.dateFrom, b = S.session.dateTo;
  if (!a && !b) return '(dates to be confirmed)';
  if (a && b) {
    const da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
    if (da.getMonth() === db.getMonth() && da.getFullYear() === db.getFullYear())
      return `${ordinal(da.getDate())} to ${fmtDate(b)}`;
    return `${fmtDate(a)} to ${fmtDate(b)}`;
  }
  return fmtDate(a || b);
}
const canEdit = () => ME && (ME.role === 'qa_manager' ||
  (ME.role === 'auditor' && ME.campus === S.session.campus)) && (!S.locked || ME.role === 'qa_manager');
const isManager = () => ME && ME.role === 'qa_manager';

function activeAspects() {
  const c = S.session.campus;
  return FRAMEWORK.filter(a => a.campuses === 'ALL' || (Array.isArray(a.campuses) && a.campuses.includes(c)));
}
function activeItems(aspect) {
  const c = S.session.campus;
  return (aspect.items || []).filter(i => !i.campuses || i.campuses === 'ALL' || (Array.isArray(i.campuses) && i.campuses.includes(c)));
}
function rec(itemId) {
  if (!S.items[itemId]) S.items[itemId] = { status: '', probes: {} };
  const r = S.items[itemId]; if (!r.probes) r.probes = {};
  return r;
}
function gridRows(gid) { if (!S.grids[gid]) S.grids[gid] = []; return S.grids[gid]; }
function itemDef(id) {
  for (const a of FRAMEWORK) for (const i of (a.items || [])) if (i.id === id) return { item: i, aspect: a };
  return null;
}
function gridForItem(item) {
  if (item.grid) return item.grid;
  if (item.usesGrid) for (const a of FRAMEWORK) for (const i of (a.items || []))
    if (i.grid && i.grid.id === item.usesGrid) return i.grid;
  return null;
}
function runDerive(item) {
  const fname = item.deriveOnly || (item.grid && item.grid.derive);
  if (!fname || !DERIVE[fname]) return empty();
  const g = gridForItem(item);
  const rows = g ? gridRows(g.id) : [];
  try {
    const r = DERIVE[fname](rows, S.standards, { probes: rec(item.id).probes, item }) || empty();
    if (r.issue) r.issue = r.issue.charAt(0).toUpperCase() + r.issue.slice(1);
    if (r.rec) r.rec = r.rec.charAt(0).toUpperCase() + r.rec.slice(1);

    /* THE EXTENT — the figures that show how big the issue is. Taken from the
       metrics the analysis flagged, so the report never says "some modules"
       when it can say "2 of 118". */
    r.quant = (r.metrics || []).filter(m => m.flag)
      .map(m => `${m.label}: ${m.value}`).join('; ');

    /* THE AFFECTED ITEMS — named one by one, not summarised. Drawn from the
       appendix rows the analysis produced (module codes and names, room
       numbers, departments, programmes, staff names). */
    if (r.appendix && r.appendix.rows && r.appendix.rows.length) {
      const cols = r.appendix.cols || [];
      const skip = /^(#|no\.?|ref)$/i;
      const keep = cols.map((c, i) => skip.test(String(c).trim()) ? -1 : i).filter(i => i >= 0).slice(0, 2);
      r.affected = r.appendix.rows.map(row =>
        keep.map(i => row[i]).filter(v => v !== undefined && v !== null && String(v).trim() !== '')
            .join(' — ')).filter(Boolean);
    } else r.affected = [];

    return r;
  } catch (e) { console.warn('derive', item.id, e); return empty(); }
}
function followUpRecs() { return PRIOR_RECS; }
function aspectProgress(a) {
  if (a.followUp) {
    const r = followUpRecs();
    return { done: r.filter(x => (S.followUp[x.id] || {}).status).length, total: r.length };
  }
  const items = activeItems(a);
  return { done: items.filter(i => (S.items[i.id] || {}).status).length, total: items.length };
}
function overallProgress() {
  let d = 0, t = 0;
  activeAspects().forEach(a => { const p = aspectProgress(a); d += p.done; t += p.total; });
  return { done: d, total: t, pct: t ? Math.round(d / t * 100) : 0 };
}

/* ==========================================================================
   BOOT AND ROUTER
   ========================================================================== */
async function boot() {
  try {
    const d = await API.get('/api/me');
    ME = d.me; META = { year: d.year, quarter: d.quarter };
  } catch (e) { ME = null; }
  if (!ME) {
    try { IDENTITIES = (await API.get('/api/roles')).identities || []; } catch (e) { IDENTITIES = []; }
  }
  if (ME) {
    await loadAudits();
    if (ME.role === 'office') { UI.screen = 'myresponses'; startPolling(); await loadMyIssues(); return; }
    else if (ME.role === 'auditor' && ME.campus) {
      const mine = AUDITS.find(a => a.campus === ME.campus);
      if (mine) { await openAudit(mine.id); return; }
    }
  }
  render();
  startPolling();
}
async function loadAudits() {
  try { AUDITS = (await API.get('/api/audits')).audits || []; } catch (e) { AUDITS = []; }
}
async function openAudit(id) {
  UI.busy = true; render();
  const d = await API.get('/api/audit/' + id);
  S = blankState();
  S.auditId = d.audit.id;
  S.session = Object.assign(S.session, d.audit.session || {}, { campus: d.audit.campus,
    academicYear: d.audit.academicYear, quarter: d.audit.quarter });
  S.general = d.audit.general || {};
  S.standards = Object.assign({ ...DEFAULT_STANDARDS }, d.audit.standards || {});
  S.wayForward = Array.isArray(d.audit.wayForward) ? d.audit.wayForward : [];
  S.locked = !!d.audit.locked; S.issuedAt = d.audit.issuedAt;
  S.items = d.items || {}; S.grids = d.grids || {};
  S.followUp = d.followUp || {}; S.responses = d.responses || {};
  PRIOR_RECS = d.priorRecs || [];
  REV = d.rev || 0;
  UI.busy = false;
  UI.screen = S.session.leadAuditor ? 'A' : 'setup';
  render(); pingPresence();
}

function render() {
  const root = $('#root');
  if (!ME) { root.innerHTML = viewLogin(); bindDynamic(); return; }
  root.innerHTML = shell(screenHtml());
  bindDynamic();
  window.scrollTo({ top: 0 });
}
function screenHtml() {
  if (UI.busy) return `<div class="card"><p class="muted">Loading…</p></div>`;
  switch (UI.screen) {
    case 'dashboard':    return viewDashboard();
    case 'setup':        return viewSetup();
    case 'general':      return viewGeneral();
    case 'report':       return viewReport();
    case 'exports':      return viewExports();
    case 'myresponses':  return viewMyResponses();
    case 'responses':    return viewResponseRegister();
    case 'consol':       return viewConsolidate();
    case 'standards':    return viewStandards();
    case 'codes':        return viewCodes();
    case 'activity':     return viewActivity();
    case 'backup':       return viewBackup();
    default:             return viewAspect(UI.screen);
  }
}

/* ------------------------------- shell ----------------------------------- */
function shell(inner) {
  const p = overallProgress();
  const c = campusObj();
  const showSide = S.auditId && ME.role !== 'office';
  return `<div class="top">
    <div class="brand"><b>CBE QUALITY AUDIT SYSTEM</b>
      <span>Quality Assurance Unit · ${esc(META.quarter)} Quarter ${esc(META.year)}</span></div>
    <div class="crumb">
      ${S.auditId ? `<span class="chip gold">${esc(c.name)} Campus</span>` : ''}
      ${S.auditId && S.locked ? '<span class="chip">Issued — locked</span>' : ''}
      ${showSide ? `<span class="chip">${p.done}/${p.total} · ${p.pct}%</span>` : ''}
      <span id="others"></span>
      <span class="chip">${esc(ME.name)} · ${esc(ME.roleLabel)}</span>
      <span class="saveState" id="saveState">All changes saved</span>
      <button class="btn sm sec" data-act="logout">Sign out</button>
    </div></div>
  <div class="layout ${showSide ? '' : 'nosidebar'}">
    ${showSide ? `<div class="side">${sideNav()}</div>` : ''}
    <div class="main">${inner}</div>
  </div>
  <div class="toast" id="toast"></div>
  <div class="modal" id="modal"><div class="box"></div></div>`;
}
function sideNav() {
  let h = `<h5>Audit file</h5>
    <div class="navitem ${UI.screen === 'dashboard' ? 'on' : ''}" data-go="dashboard"><span class="n">←</span>All campuses</div>
    <div class="navitem ${UI.screen === 'setup' ? 'on' : ''}" data-go="setup"><span class="n">i</span>Set-up &amp; scope</div>
    <div class="navitem ${UI.screen === 'general' ? 'on' : ''}" data-go="general"><span class="n">ii</span>Entrance &amp; access</div>
    <h5>Audit aspects</h5>`;
  activeAspects().forEach(a => {
    const p = aspectProgress(a);
    const cls = p.total && p.done === p.total ? 'done' : (p.done ? 'part' : '');
    h += `<div class="navitem ${UI.screen === a.id ? 'on' : ''}" data-go="${a.id}">
      <span class="n">${a.code}</span><span style="flex:1">${esc(a.short)}</span>
      <span class="pill ${cls}">${p.done}/${p.total}</span></div>`;
  });
  h += `<h5>Output</h5>
    <div class="navitem ${UI.screen === 'report' ? 'on' : ''}" data-go="report"><span class="n">R</span>Generated report</div>
    <div class="navitem ${UI.screen === 'exports' ? 'on' : ''}" data-go="exports"><span class="n">E</span>Issue &amp; download</div>
    <div class="navitem ${UI.screen === 'responses' ? 'on' : ''}" data-go="responses"><span class="n">M</span>Management responses</div>
    <div class="navitem ${UI.screen === 'consol' ? 'on' : ''}" data-go="consol"><span class="n">C</span>Consolidated report</div>
    <h5>Configuration</h5>
    <div class="navitem ${UI.screen === 'standards' ? 'on' : ''}" data-go="standards"><span class="n">S</span>Institutional standards</div>`;
  if (isManager()) h += `
    <div class="navitem ${UI.screen === 'codes' ? 'on' : ''}" data-go="codes"><span class="n">A</span>Access codes</div>
    <div class="navitem ${UI.screen === 'activity' ? 'on' : ''}" data-go="activity"><span class="n">L</span>Activity log</div>
    <div class="navitem ${UI.screen === 'backup' ? 'on' : ''}" data-go="backup"><span class="n">B</span>Backup &amp; restore</div>`;
  return h;
}

/* ------------------------------- login ----------------------------------- */
let IDENTITIES = [];
let CHOSEN = null;

function viewLogin() {
  const group = (title, list) => !list.length ? '' : `
    <h4 class="signgrp">${esc(title)}</h4>
    <div class="cards">${list.map(i => `
      <button class="idcard ${CHOSEN && CHOSEN.key === i.key ? 'on' : ''}" data-key="${esc(i.key)}">
        <b>${esc(i.label)}</b><span>${esc(i.note || '')}</span></button>`).join('')}</div>`;

  return `<div class="loginwrap"><div class="signpanel">
    <div class="loginhead">
      <div class="lh1">COLLEGE OF BUSINESS EDUCATION</div>
      <div class="lh2">Quality Assurance Unit</div>
      <div class="lh3">Academic Quality Audit System</div>
      <div class="lh4">${esc(META.quarter)} Quarter · ${esc(META.year)} Academic Year</div>
    </div>
    <div class="loginbody">
      <div id="loginErr" class="banner bad hide" style="margin-bottom:14px"></div>
      ${group('Audit teams', IDENTITIES.filter(i => i.role === 'auditor'))}
      ${group('Responsible offices', IDENTITIES.filter(i => i.role === 'office'))}
      ${group('Quality Assurance Unit and Management',
              IDENTITIES.filter(i => i.role === 'qa_manager' || i.role === 'viewer'))}
      <div class="confirmrow ${CHOSEN ? '' : 'hide'}" id="confirmRow">
        <p class="muted" style="margin:0 0 12px">Signing in as <b>${esc(CHOSEN ? CHOSEN.label : '')}</b></p>
        <div class="field" style="max-width:420px"><label>Your name</label>
          <input type="text" id="loginName" placeholder="e.g. Dr. Gordian Bwemelo" autocomplete="name"></div>
        <div class="field hide" id="pinWrap" style="max-width:220px"><label>PIN</label>
          <input type="password" id="loginPin" inputmode="numeric" autocomplete="off"></div>
        <button class="btn" id="loginGo">Continue</button>
      </div>
    </div>
  </div></div>`;
}

/* ----------------------------- dashboard --------------------------------- */
function viewDashboard() {
  const rows = CAMPUSES.map(c => {
    const a = AUDITS.find(x => x.campus === c.id);
    const canOpen = isManager() || (ME.role === 'auditor' && ME.campus === c.id) || ME.role === 'viewer';
    return { c, a, canOpen };
  });
  return `<div class="card">
    <h2>Academic Quality Audit — ${esc(META.quarter)} Quarter, ${esc(META.year)}</h2>
    <p class="muted">Select a campus to open its audit file. ${isManager() ? 'As Quality Assurance Manager you may open any campus.'
      : ME.role === 'auditor' ? 'Your access code covers ' + esc(ME.campus) + ' Campus.' : 'You have read-only access.'}</p>
    <div class="hr"></div>
    <table class="plain"><thead><tr><th>Campus</th><th>Scheduled window</th><th>Status</th>
      <th style="width:130px">Items recorded</th><th style="width:120px">Responses</th><th style="width:150px"></th></tr></thead><tbody>
    ${rows.map(({ c, a, canOpen }) => `<tr>
      <td><b>${esc(c.name)}</b><div class="muted">${esc(c.team)}</div></td>
      <td>${esc(c.auditWindow)}</td>
      <td>${a ? (a.locked ? '<span class="badge b-c">Issued ' + esc(fmtDate((a.issued_at || '').slice(0, 10))) + '</span>'
            : '<span class="badge b-pc">In progress</span>') : '<span class="badge b-na">Not started</span>'}</td>
      <td>${a ? a.items_done + ' + ' + a.fu_done + ' follow-ups' : '—'}</td>
      <td>${a ? a.responses : '—'}</td>
      <td>${canOpen ? `<button class="btn sm" data-act="open" data-c="${c.id}" data-id="${a ? a.id : ''}">${a ? 'Open' : 'Start audit'}</button>` : '<span class="muted">No access</span>'}</td>
    </tr>`).join('')}
    </tbody></table>
  </div>
  ${isManager() ? `<div class="card"><h3>College-wide</h3>
    <div class="btnrow">
      <button class="btn sec" data-go="consol">Consolidated report across campuses</button>
      <button class="btn sec" data-go="responses">Management response register</button>
      <button class="btn sec" data-go="codes">Access codes</button>
      <button class="btn sec" data-go="backup">Backup the database</button>
    </div></div>` : ''}`;
}

/* ------------------------------- set-up ---------------------------------- */
function viewSetup() {
  const c = campusObj(); const ro = !canEdit();
  return `<div class="card">
    <h2>${esc(c.name)} Campus — audit file</h2>
    <p class="muted">These particulars appear on the cover page and in Sections 1.0 and 2.0 of the report.</p>
    ${S.locked ? '<div class="banner warn">This report has been issued to the responsible offices and is locked. Only the Quality Assurance Manager can reopen it.</div>' : ''}
    <div class="hr"></div>
    ${c.auditWindow ? `<div class="banner">Scheduled window per the approved plan: <b>${esc(c.auditWindow)}</b> · Team: ${esc(c.team)}</div>` : ''}
    <div class="grid2" style="margin-top:14px">
      <div class="field"><label>Academic year</label><input type="text" data-s="session.academicYear" value="${esc(S.session.academicYear)}" ${ro ? 'disabled' : ''}></div>
      <div class="field"><label>Quarter</label><input type="text" data-s="session.quarter" value="${esc(S.session.quarter)}" ${ro ? 'disabled' : ''}></div>
      <div class="field"><label class="req">Audit start date</label><input type="date" data-s="session.dateFrom" value="${esc(S.session.dateFrom)}" ${ro ? 'disabled' : ''}></div>
      <div class="field"><label class="req">Audit end date</label><input type="date" data-s="session.dateTo" value="${esc(S.session.dateTo)}" ${ro ? 'disabled' : ''}></div>
      <div class="field"><label class="req">Lead auditor</label><input type="text" data-s="session.leadAuditor" value="${esc(S.session.leadAuditor)}" ${ro ? 'disabled' : ''}></div>
      <div class="field"><label>Report submitted to</label><input type="text" data-s="session.submittedTo" value="${esc(S.session.submittedTo)}" ${ro ? 'disabled' : ''}></div>
    </div>
    <div class="field"><label>Audit team members</label>
      <textarea data-s="session.team" ${ro ? 'disabled' : ''}>${esc(S.session.team)}</textarea>
      ${c.team && !ro ? `<div class="help"><a href="#" data-act="useteam">Use the team named in the approved plan</a></div>` : ''}</div>
  </div>
  <div class="card">
    <h3>Scope of this audit</h3>
    <table class="plain"><thead><tr><th style="width:34px">#</th><th>Audit aspect</th><th style="width:80px">Items</th></tr></thead><tbody>
    ${FRAMEWORK.map(a => `<tr><td><b>${a.code}</b></td><td><b>${esc(a.title)}</b><div class="muted">${esc(a.intro)}</div></td>
      <td>${a.followUp ? followUpRecs().length : (a.items || []).length}</td></tr>`).join('')}
    </tbody></table>
    <div class="btnrow" style="margin-top:14px"><button class="btn" data-go="general">Continue →</button></div>
  </div>`;
}

function viewGeneral() {
  const ro = !canEdit();
  return `<div class="card">
    <h2>Entrance meeting, access and audit conduct</h2>
    <p class="muted">These entries feed Sections 1.0, 2.0 and 6.0 of the report.</p>
    <div class="hr"></div>
    ${GENERAL_QUESTIONS.map(q => fieldHtml(q, S.general[q.k] != null ? S.general[q.k] : (q.def || ''), `general.${q.k}`, ro)).join('')}
    <div class="btnrow"><button class="btn" data-go="A">Begin aspect 1 →</button></div>
  </div>`;
}

/* --------------------------- generic field ------------------------------- */
function fieldHtml(q, val, path, ro) {
  const id = 'f_' + path.replace(/[^a-z0-9]/gi, '_');
  const d = ro ? 'disabled' : '';
  let ctl;
  if (q.type === 'textarea') ctl = `<textarea id="${id}" data-s="${path}" ${d}>${esc(val)}</textarea>`;
  else if (q.type === 'select') ctl = `<select id="${id}" data-s="${path}" ${d}><option value=""></option>` +
    q.options.map(o => `<option ${val === o ? 'selected' : ''}>${esc(o)}</option>`).join('') + '</select>';
  else if (q.type === 'multiselect') {
    const arr = Array.isArray(val) ? val : [];
    ctl = `<div class="checks" data-ms="${path}">` + q.options.map(o =>
      `<label class="${arr.includes(o) ? 'on' : ''}"><input type="checkbox" value="${esc(o)}" ${arr.includes(o) ? 'checked' : ''} ${d}>${esc(o)}</label>`).join('') + '</div>';
  }
  else if (q.type === 'number') ctl = `<input type="number" step="any" id="${id}" data-s="${path}" value="${esc(val)}" ${d}>`;
  else if (q.type === 'date') ctl = `<input type="date" id="${id}" data-s="${path}" value="${esc(val)}" ${d}>`;
  else ctl = `<input type="text" id="${id}" data-s="${path}" value="${esc(val)}" ${d}>`;
  return `<div class="field"><label for="${id}">${esc(q.label)}</label>${ctl}${q.help ? `<div class="help">${esc(q.help)}</div>` : ''}</div>`;
}

/* ------------------------------- aspects --------------------------------- */
function viewAspect(aid) {
  const a = FRAMEWORK.find(x => x.id === aid);
  if (!a) { UI.screen = 'dashboard'; return viewDashboard(); }
  if (a.followUp) return viewFollowUp(a);
  const items = activeItems(a), p = aspectProgress(a);
  return `<div class="card tight">
      <h2 style="margin-bottom:2px">${a.code}. ${esc(a.title)}</h2>
      <p class="muted" style="margin:0">${esc(a.intro)}</p>
      <div class="bar" style="margin-top:10px"><i style="width:${p.total ? p.done / p.total * 100 : 0}%"></i></div>
      <div class="muted" style="margin-top:5px">${p.done} of ${p.total} items recorded</div>
    </div>
    ${items.map((it, ix) => itemHtml(a, it, ix + 1)).join('')}
    <div class="btnrow" style="margin-top:14px">
      <button class="btn sec" data-act="expandAll" data-a="${a.id}">Expand all</button>
      <button class="btn sec" data-act="collapseAll" data-a="${a.id}">Collapse all</button>
      ${nextAspect(a.id) ? `<button class="btn" data-go="${nextAspect(a.id)}">Next aspect →</button>`
        : `<button class="btn" data-go="report">Generate report →</button>`}
    </div>`;
}
function nextAspect(id) {
  const l = activeAspects(), i = l.findIndex(x => x.id === id);
  return i >= 0 && i < l.length - 1 ? l[i + 1].id : null;
}

function itemHtml(a, it, n) {
  const r = rec(it.id), ref = `${a.code}.${n}`, d = runDerive(it);
  const open = UI.open[it.id], st = STATUSES.find(s => s.id === r.status);
  const g = gridForItem(it), ownsGrid = !!it.grid, ro = !canEdit();

  let h = `<div class="item ${open ? 'open' : ''} ${d.flags.length && r.status !== 'C' ? 'flagged' : ''}" id="it_${it.id}">
    <div class="head" data-toggle="${it.id}">
      <span class="ref">${ref}</span>
      <span class="t"><b>${esc(it.title)}</b><span>${esc(it.approach)}</span></span>
      ${r.updatedBy ? `<span class="who">${esc(r.updatedBy)}</span>` : ''}
      ${st ? `<span class="badge b-${st.id.toLowerCase()}">${esc(st.label)}</span>` : '<span class="badge b-na">Not recorded</span>'}
    </div><div class="body">
    <div class="banner" style="margin:12px 0"><b>Standard:</b> ${esc(it.standard || '—')}<br>
      <b>Evidence to obtain:</b> ${esc(it.evidence || '—')}</div>`;

  const always = (it.probes || []).filter(p => p.showIf === 'always');
  if (always.length) h += `<div class="grid2">${always.map(p => fieldHtml(p, r.probes[p.k], `items.${it.id}.probes.${p.k}`, ro)).join('')}</div>`;

  if (g && ownsGrid) h += gridHtml(g, ro);
  else if (g) h += `<div class="muted" style="margin:8px 0">Analysed from the <b>${esc(g.title)}</b> entered above.</div>`;

  if (d.metrics.length) h += `<div class="metrics">${d.metrics.map(m =>
    `<div class="metric ${m.flag ? 'flag' : ''}"><b>${esc(m.value)}</b><span>${esc(m.label)}</span></div>`).join('')}</div>`;
  if (d.flags.length) h += `<div class="banner bad"><b>Automatic checks flagged the following:</b>
    <ul class="flaglist">${d.flags.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>`;
  if (d.suggest && d.suggest !== r.status && !ro)
    h += `<div class="banner ${d.suggest === 'C' ? 'ok' : 'warn'}" style="margin-top:9px">
      The evidence entered suggests a status of <b>${esc((STATUSES.find(s => s.id === d.suggest) || {}).label)}</b>.
      <button class="btn sm gold" data-act="applySuggest" data-i="${it.id}" data-v="${d.suggest}">Apply</button></div>`;

  h += `<div class="field" style="margin-top:14px"><label class="req">Audit conclusion for this item</label>
    <div class="statusrow">${STATUSES.map(s =>
      `<button class="statusbtn ${s.cls} ${r.status === s.id ? 'on' : ''}" ${ro ? 'disabled' : ''}
        data-act="setStatus" data-i="${it.id}" data-v="${s.id}" title="${esc(s.hint)}">${esc(s.label)}</button>`).join('')}</div>
    ${st ? `<div class="help">${esc(st.hint)}</div>` : ''}</div>`;

  if (r.status === 'C') {
    h += `<div class="reveal ok"><div class="revlabel">Recorded in Section 3.0 — Areas of Strength</div>
      ${fieldHtml({ label: 'Strength as it will be listed in the report',
        help: 'One sentence, stated positively. e.g. "All 118 modules examined were moderated and the reports filed."',
        type: 'textarea' }, r.finding, `items.${it.id}.finding`, ro)}
      ${fieldHtml({ label: 'Evidence examined / reference', type: 'text' }, r.evidence, `items.${it.id}.evidence`, ro)}</div>`;
  }
  if (r.status === 'PC' || r.status === 'NC') {
    h += `<div class="reveal issue"><div class="revlabel">Recorded in Section 4.0 — Issues Observed and Recommendations</div>`;
    if (d.issue && !r.issue && !ro)
      h += `<div class="banner warn" style="margin-bottom:10px">A draft issue statement has been prepared from the evidence sheet.
        <button class="btn sm gold" data-act="useDraft" data-i="${it.id}">Insert draft</button></div>`;
    h += fieldHtml({ label: 'Audit area (short heading used in the report)', type: 'text' }, r.area || it.title, `items.${it.id}.area`, ro);
    h += fieldHtml({ label: 'Issue observed — state the facts and their magnitude', type: 'textarea' }, r.issue, `items.${it.id}.issue`, ro);
    ((it.probes || []).filter(p => p.showIf === 'issue')).forEach(p =>
      h += fieldHtml(p, r.probes[p.k], `items.${it.id}.probes.${p.k}`, ro));
    h += fieldHtml({ label: 'Root cause established', type: 'select',
      options: ['Policy or guideline not defined', 'Policy defined but not enforced', 'Staff shortage or capacity gap',
        'Resource or budget constraint', 'System or ICT limitation', 'Process not documented', 'Human error / oversight', 'Other'] },
      r.rootCause, `items.${it.id}.rootCause`, ro);
    h += `<div class="grid2">
      ${fieldHtml({ label: 'Severity', type: 'select', options: SEVERITIES.map(s => s.label) }, r.severity, `items.${it.id}.severity`, ro)}
      ${fieldHtml({ label: 'Target implementation date', type: 'date' }, r.target, `items.${it.id}.target`, ro)}</div>`;
    h += fieldHtml({ label: 'Recommendation', type: 'textarea' }, r.rec, `items.${it.id}.rec`, ro);
    h += fieldHtml({ label: 'Responsible officer — this determines who is asked to respond', type: 'select', options: OFFICES },
      r.responsible || it.responsible, `items.${it.id}.responsible`, ro);
    if ((r.responsible || '') === 'Other (specify)')
      h += fieldHtml({ label: 'Specify the responsible officer', type: 'text' }, r.responsibleOther, `items.${it.id}.responsibleOther`, ro);
    h += fieldHtml({ label: 'Evidence reference (appendix, file, register)', type: 'text' }, r.evidence, `items.${it.id}.evidence`, ro);
    h += `</div>`;
  }
  if (r.status === 'NA') h += `<div class="reveal na"><div class="revlabel">Excluded from the report — justification required</div>
    ${fieldHtml({ label: 'Why this item does not apply to this campus', type: 'textarea' }, r.na, `items.${it.id}.na`, ro)}</div>`;
  if (r.status === 'NV') h += `<div class="reveal"><div class="revlabel">Recorded in Section 6.0 — Limitations of the audit</div>
    ${fieldHtml({ label: 'Why the item could not be verified and the effect on the audit', type: 'textarea' }, r.nv, `items.${it.id}.nv`, ro)}</div>`;

  h += fieldHtml({ label: 'Auditor working notes (not printed in the report)', type: 'textarea' }, r.notes, `items.${it.id}.notes`, ro);
  h += `</div></div>`;
  return h;
}

/* -------------------------------- grids ---------------------------------- */
function gridHtml(g, ro) {
  const rows = gridRows(g.id);
  let h = `<div class="field" style="margin-top:14px"><label>${esc(g.title)} — evidence sheet</label>
    <div class="gridwrap"><table class="dg"><thead><tr><th style="width:34px">#</th>
    ${g.cols.map(c => `<th style="min-width:${c.w || 120}px">${esc(c.label)}</th>`).join('')}<th></th></tr></thead><tbody>`;
  if (!rows.length) h += `<tr><td colspan="${g.cols.length + 2}" style="padding:14px;text-align:center;color:#7b8798">
    No records yet — add a row, or paste from Excel.</td></tr>`;
  rows.forEach((row, i) => {
    h += `<tr><td style="text-align:center;color:#8b95a5;font-size:11px">${i + 1}</td>` + g.cols.map(c => {
      const v = row[c.k] == null ? '' : row[c.k];
      if (c.type === 'select') return `<td><select data-g="${g.id}" data-r="${i}" data-k="${c.k}" ${ro ? 'disabled' : ''}><option value=""></option>` +
        c.options.map(o => `<option ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('') + '</select></td>';
      return `<td><input type="${c.type === 'number' ? 'number' : 'text'}" step="any" data-g="${g.id}" data-r="${i}" data-k="${c.k}" value="${esc(v)}" ${ro ? 'disabled' : ''}></td>`;
    }).join('') + `<td class="rm">${ro ? '' : `<button class="xbtn" data-act="delRow" data-g="${g.id}" data-r="${i}" title="Delete row">✕</button>`}</td></tr>`;
  });
  h += `</tbody></table></div>`;
  if (!ro) h += `<div class="btnrow" style="margin-top:7px">
      <button class="btn sm sec" data-act="addRow" data-g="${g.id}">+ Add row</button>
      <button class="btn sm sec" data-act="addRow10" data-g="${g.id}">+ 10 rows</button>
      <button class="btn sm sec" data-act="pasteGrid" data-g="${g.id}">Paste from Excel</button>
      <button class="btn sm sec" data-act="tmplGrid" data-g="${g.id}">Download blank CSV</button>
      <button class="btn sm sec" data-act="csvGrid" data-g="${g.id}">Import CSV</button>
      <span class="muted">${rows.length} record${rows.length === 1 ? '' : 's'}</span></div>`;
  return h + `</div>`;
}

/* ------------------------------ follow-up -------------------------------- */
function viewFollowUp(a) {
  const recs = followUpRecs(), p = aspectProgress(a), ro = !canEdit();
  const counts = {};
  IMPL_STATUSES.forEach(s => counts[s.id] = recs.filter(r => (S.followUp[r.id] || {}).status === s.id).length);
  let h = `<div class="card tight">
    <h2 style="margin-bottom:2px">${a.code}. ${esc(a.title)}</h2>
    <p class="muted" style="margin:0">${esc(a.intro)}</p>
    <div class="bar" style="margin-top:10px"><i style="width:${p.total ? p.done / p.total * 100 : 0}%"></i></div>
    <div class="muted" style="margin-top:5px">${p.done} of ${p.total} recommendations assessed</div>
    <div class="kpi" style="margin-top:12px">${IMPL_STATUSES.map(s =>
      `<div class="k ${s.id === 'IMP' ? 'ok' : s.id === 'NOT' ? 'bad' : s.id === 'SUP' ? '' : 'warn'}">
        <b>${counts[s.id]}</b><span>${esc(s.label)}</span></div>`).join('')}</div></div>`;
  if (!recs.length) h += `<div class="card"><div class="banner warn">No earlier recommendations are on file for
    ${esc(campusObj().name)} Campus. Add them below so the audit can record their implementation status.</div></div>`;
  recs.forEach((r, i) => {
    const f = S.followUp[r.id] || {}, open = UI.open['fu_' + r.id];
    const stLab = (IMPL_STATUSES.find(s => s.id === f.status) || {}).label;
    h += `<div class="item ${open ? 'open' : ''}">
      <div class="head" data-toggle="fu_${r.id}">
        <span class="ref">${a.code}.${i + 1}</span>
        <span class="t"><b>${esc(r.area || 'Recommendation ' + r.sourceRef)}</b>
          <span>${esc((r.recommendation || '').substring(0, 190))}${(r.recommendation || '').length > 190 ? '…' : ''}</span></span>
        <span class="badge ${f.status === 'IMP' ? 'b-c' : f.status === 'NOT' ? 'b-nc' : f.status ? 'b-pc' : 'b-na'}">${esc(stLab || 'Not assessed')}</span>
      </div><div class="body">
        <table class="plain" style="margin:12px 0"><tbody>
          <tr><th style="width:170px">Source</th><td>${esc(r.sourceLabel || 'Fourth Quarter 2025/2026')}, item ${esc(r.sourceRef)} — ${esc(r.campus)} Campus</td></tr>
          <tr><th>Issue then observed</th><td>${nl2br(r.issue)}</td></tr>
          <tr><th>Recommendation</th><td>${nl2br(r.recommendation)}</td></tr>
          <tr><th>Responsible officer</th><td>${esc(r.responsibleOfficer || '—')}</td></tr>
          ${r.priorResponse ? `<tr><th>Response given then</th><td>${nl2br(r.priorResponse)}</td></tr>` : ''}
        </tbody></table>
        <div class="field"><label class="req">Implementation status established by this audit</label>
          <div class="statusrow">${IMPL_STATUSES.map(s =>
            `<button class="statusbtn ${s.id === 'IMP' ? 'st-c' : s.id === 'NOT' ? 'st-nc' : 'st-pc'} ${f.status === s.id ? 'on' : ''}"
              ${ro ? 'disabled' : ''} data-act="setFU" data-i="${r.id}" data-v="${s.id}">${esc(s.label)}</button>`).join('')}</div></div>
        ${fieldHtml({ label: 'Evidence of implementation examined', type: 'textarea' }, f.evidence, `followUp.${r.id}.evidence`, ro)}
        ${f.status && f.status !== 'IMP' && f.status !== 'SUP' ? `
          ${fieldHtml({ label: 'Reason implementation is outstanding', type: 'textarea' }, f.reason, `followUp.${r.id}.reason`, ro)}
          ${fieldHtml({ label: 'Revised target date', type: 'date' }, f.revisedTarget, `followUp.${r.id}.revisedTarget`, ro)}
          ${fieldHtml({ label: 'Does the audit re-issue this recommendation?', type: 'select',
            options: ['Yes — re-issue as it stands', 'Yes — re-issue in strengthened form', 'No — superseded'] }, f.reissue, `followUp.${r.id}.reissue`, ro)}` : ''}
        ${fieldHtml({ label: 'Auditor remarks for the report', type: 'textarea' }, f.remarks, `followUp.${r.id}.remarks`, ro)}
      </div></div>`;
  });
  if (!ro) h += `<div class="btnrow" style="margin-top:14px">
    <button class="btn sec" data-act="addPrior">+ Add an earlier recommendation</button>
    <button class="btn" data-go="report">Generate report →</button></div>`;
  return h;
}

/* ------------------------------ standards -------------------------------- */
const STD_LABELS = {
  sampleSizePct: 'Minimum script moderation sample size (%)',
  maxModulesModerator: 'Maximum modules per moderator per cycle',
  maxCandidatesSup: "Maximum Master's candidates per supervisor",
  maxModulesLecturer: 'Maximum modules per lecturer per semester',
  maxTFC: 'Maximum TFC contact hours per week',
  maxTNC: 'Maximum TNC contact hours per week',
  maxTotalHours: 'Maximum combined contact hours per week',
  minSamplingPct: 'Minimum audit sampling rate (%)',
  lmsUploadTarget: 'Target LMS upload compliance (%)',
  printSurplusPct: 'Acceptable examination printing surplus (%)',
  minorModuleVar: 'Modules above ceiling still classed as a minor variation',
  minorHourVar: 'Hours above ceiling still classed as a minor variation'
};
function viewStandards() {
  const ro = !canEdit();
  return `<div class="card">
    <h2>Institutional standards applied by the automatic checks</h2>
    <p class="muted">Drawn from the CBE Examination Regulations, the workload policy and previous audit reports.
      Change a threshold here and every flag, drafted issue statement and appendix recalculates at once.</p>
    <div class="hr"></div>
    <div class="grid2">${Object.keys(DEFAULT_STANDARDS).map(k =>
      `<div class="field"><label>${esc(STD_LABELS[k] || k)}</label>
       <input type="number" step="any" data-s="standards.${k}" value="${esc(S.standards[k])}" ${ro ? 'disabled' : ''}></div>`).join('')}</div>
    ${ro ? '' : '<div class="btnrow"><button class="btn sec" data-act="resetStd">Restore default thresholds</button></div>'}
  </div>`;
}

/* ==========================================================================
   EVENTS
   ========================================================================== */
function setPath(path, val) {
  const parts = path.split('.');
  let o = S;
  for (let i = 0; i < parts.length - 1; i++) {
    if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
    o = o[parts[i]];
  }
  o[parts[parts.length - 1]] = val;
}
function persistPath(path) {
  if (path.startsWith('items.')) saveItem(path.split('.')[1]);
  else if (path.startsWith('followUp.')) saveFollowUp(path.split('.')[1]);
  else saveSession();
}

function bindDynamic() {
  $$('.idcard').forEach(el => el.onclick = () => {
    CHOSEN = IDENTITIES.find(i => i.key === el.dataset.key) || null;
    render();
    const n = $('#loginName'); if (n) n.focus();
  });

  const lg = $('#loginGo');
  if (lg) {
    const go = async () => {
      const name = ($('#loginName') || {}).value || '';
      const pin = ($('#loginPin') || {}).value || '';
      const err = $('#loginErr');
      if (!CHOSEN) { err.textContent = 'Choose who you are.'; err.classList.remove('hide'); return; }
      lg.disabled = true; lg.textContent = 'Signing in…';
      try {
        const d = await API.post('/api/login', { key: CHOSEN.key, name, pin });
        ME = d.me; await loadAudits();
        UI.screen = ME.role === 'office' ? 'myresponses' : 'dashboard';
        if (ME.role === 'office') { startPolling(); await loadMyIssues(); return; }
        if (ME.role === 'auditor' && ME.campus) {
          const mine = AUDITS.find(a => a.campus === ME.campus);
          if (mine) { await openAudit(mine.id); startPolling(); return; }
        }
        render(); startPolling();
      } catch (e) {
        err.textContent = e.message; err.classList.remove('hide');
        if (/PIN/i.test(e.message)) { const w = $('#pinWrap'); if (w) { w.classList.remove('hide'); $('#loginPin').focus(); } }
        lg.disabled = false; lg.textContent = 'Continue';
      }
    };
    lg.onclick = go;
    ['loginName', 'loginPin'].forEach(id => { const el = $('#' + id); if (el) el.onkeydown = e => { if (e.key === 'Enter') go(); }; });
    if ($('#loginName')) $('#loginName').focus();
    return;
  }

  $$('[data-go]').forEach(el => el.onclick = e => {
    e.preventDefault(); UI.screen = el.dataset.go;
    if (UI.screen === 'consol') { loadConsolidated(); return; }
    if (UI.screen === 'codes') { loadCodes(); return; }
    if (UI.screen === 'activity') { loadActivity(); return; }
    if (UI.screen === 'responses' || UI.screen === 'myresponses') { loadMyIssues(); return; }
    render();
  });
  $$('[data-toggle]').forEach(el => el.onclick = () => {
    const k = el.dataset.toggle; UI.open[k] = !UI.open[k];
    el.parentElement.classList.toggle('open', !!UI.open[k]);
  });
  $$('[data-s]').forEach(el => {
    const h = () => {
      const v = el.type === 'number' ? (el.value === '' ? '' : parseFloat(el.value)) : el.value;
      setPath(el.dataset.s, v);
      persistPath(el.dataset.s);
      if (el.dataset.s.startsWith('standards.') || /\.probes\./.test(el.dataset.s)) softRefresh(el);
    };
    if (el.tagName === 'SELECT') el.onchange = h; else { el.oninput = h; el.onchange = h; }
  });
  $$('[data-ms]').forEach(box => box.querySelectorAll('input').forEach(cb => cb.onchange = () => {
    const path = box.dataset.ms;
    setPath(path, Array.from(box.querySelectorAll('input:checked')).map(x => x.value));
    persistPath(path);
    box.querySelectorAll('label').forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
  }));
  $$('[data-g]').forEach(el => {
    const h = () => {
      const rows = gridRows(el.dataset.g), i = +el.dataset.r;
      if (!rows[i]) rows[i] = {};
      rows[i][el.dataset.k] = el.type === 'number' ? (el.value === '' ? '' : parseFloat(el.value)) : el.value;
      saveGrid(el.dataset.g);
    };
    if (el.tagName === 'SELECT') el.onchange = () => { h(); softRefresh(el); };
    else { el.oninput = h; el.onchange = () => { h(); softRefresh(el); }; }
  });
  $$('[data-act]').forEach(el => el.onclick = e => { e.preventDefault(); e.stopPropagation(); actions(el.dataset.act, el); });
  $$('[data-pk]').forEach(el => el.oninput = el.onchange = () => {
    const ref = el.dataset.pk;
    RESP_DRAFT[ref] = RESP_DRAFT[ref] || {};
    RESP_DRAFT[ref][el.dataset.pf] = el.value;
  });
}

let refreshTimer = null;
function softRefresh(el) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    const cur = document.activeElement;
    const path = cur && cur.dataset ? (cur.dataset.s || (cur.dataset.g ? cur.dataset.g + '|' + cur.dataset.r + '|' + cur.dataset.k : null)) : null;
    const sel = cur && cur.selectionStart, scroll = window.scrollY;
    render();
    if (path) {
      const back = path.includes('|')
        ? document.querySelector(`[data-g="${path.split('|')[0]}"][data-r="${path.split('|')[1]}"][data-k="${path.split('|')[2]}"]`)
        : document.querySelector(`[data-s="${path}"]`);
      if (back) { back.focus(); try { back.setSelectionRange(sel, sel); } catch (e) { } }
    }
    window.scrollTo(0, scroll);
  }, 550);
}

async function actions(act, el) {
  try {
    switch (act) {
      case 'logout': await API.post('/api/logout'); ME = null; S = blankState(); render(); return;
      case 'open': {
        let id = el.dataset.id;
        if (!id) { const d = await API.post('/api/audits', { campus: el.dataset.c }); id = d.audit.id; await loadAudits(); }
        await openAudit(id); return;
      }
      case 'useteam': S.session.team = campusObj().team; saveSession(); render(); return;
      case 'setStatus': {
        const r = rec(el.dataset.i);
        r.status = r.status === el.dataset.v ? '' : el.dataset.v;
        const def = itemDef(el.dataset.i);
        if ((r.status === 'NC' || r.status === 'PC') && def) {
          const d = runDerive(def.item);
          if (!r.issue && d.issue) r.issue = d.issue;
          if (!r.rec && d.rec) r.rec = d.rec;
          if (!r.area) r.area = def.item.title;
          if (!r.responsible) r.responsible = def.item.responsible || '';
        }
        r.updatedBy = ME.name;
        saveItem(el.dataset.i); UI.open[el.dataset.i] = true; render(); return;
      }
      case 'applySuggest': {
        const r = rec(el.dataset.i), def = itemDef(el.dataset.i);
        r.status = el.dataset.v;
        if (def && (r.status === 'NC' || r.status === 'PC')) {
          const d = runDerive(def.item);
          if (!r.issue) r.issue = d.issue; if (!r.rec) r.rec = d.rec;
          if (!r.quant) r.quant = d.quant;
          if (!r.affected && d.affected && d.affected.length) r.affected = d.affected.join('\n');
          if (!r.area) r.area = def.item.title;
          if (!r.responsible) r.responsible = def.item.responsible || '';
        }
        r.updatedBy = ME.name;
        saveItem(el.dataset.i); UI.open[el.dataset.i] = true; render(); return;
      }
      case 'useDraft': {
        const def = itemDef(el.dataset.i); if (!def) return;
        const d = runDerive(def.item), r = rec(el.dataset.i);
        r.issue = d.issue; if (!r.rec) r.rec = d.rec;
        r.quant = d.quant;
        if (d.affected && d.affected.length) r.affected = d.affected.join('\n');
        saveItem(el.dataset.i); render(); return;
      }
      case 'setFU': {
        const id = el.dataset.i;
        if (!S.followUp[id]) S.followUp[id] = {};
        S.followUp[id].status = S.followUp[id].status === el.dataset.v ? '' : el.dataset.v;
        saveFollowUp(id); UI.open['fu_' + id] = true; render(); return;
      }
      case 'addRow':   gridRows(el.dataset.g).push({}); saveGrid(el.dataset.g); render(); return;
      case 'addRow10': for (let i = 0; i < 10; i++) gridRows(el.dataset.g).push({}); saveGrid(el.dataset.g); render(); return;
      case 'delRow':   gridRows(el.dataset.g).splice(+el.dataset.r, 1); saveGrid(el.dataset.g); render(); return;
      case 'pasteGrid': openPaste(el.dataset.g); return;
      case 'tmplGrid':  downloadTemplate(el.dataset.g); return;
      case 'csvGrid':   importCsv(el.dataset.g); return;
      case 'expandAll':   { const a = FRAMEWORK.find(x => x.id === el.dataset.a); (a.followUp ? followUpRecs().map(r => 'fu_' + r.id) : activeItems(a).map(i => i.id)).forEach(k => UI.open[k] = true); render(); return; }
      case 'collapseAll': { const a = FRAMEWORK.find(x => x.id === el.dataset.a); (a.followUp ? followUpRecs().map(r => 'fu_' + r.id) : activeItems(a).map(i => i.id)).forEach(k => UI.open[k] = false); render(); return; }
      case 'resetStd': S.standards = { ...DEFAULT_STANDARDS }; saveSession(); render(); toast('Thresholds restored.'); return;
      case 'addPrior': {
        const d = await API.post('/api/prior', { campus: S.session.campus });
        const fresh = await API.get('/api/audit/' + S.auditId);
        PRIOR_RECS = fresh.priorRecs; UI.open['fu_' + d.id] = true; render();
        toast('Recommendation added — complete its particulars.'); return;
      }
      default: await exportActions(act, el);
    }
  } catch (e) { toast(e.message, 5000); }
}

/* --------------------- paste / CSV helpers for grids ---------------------- */
function openPaste(gid) {
  const g = findGrid(gid); if (!g) return;
  const m = $('#modal');
  m.querySelector('.box').innerHTML = `<h3>Paste ${esc(g.title)} from Excel</h3>
    <p class="muted">Copy the rows in Excel (without the header) and paste below. Columns must be in this order:</p>
    <p>${g.cols.map((c, i) => `<span class="tag">${i + 1}. ${esc(c.label)}</span>`).join('')}</p>
    <textarea id="pasteBox" style="min-height:200px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px"></textarea>
    <div class="btnrow" style="margin-top:12px"><button class="btn" id="pasteGo">Add rows</button>
    <button class="btn sec" data-close>Cancel</button></div>`;
  m.classList.add('show');
  m.querySelector('#pasteGo').onclick = () => {
    const n = ingestRows(gid, parseDelimited(m.querySelector('#pasteBox').value));
    m.classList.remove('show'); saveGrid(gid); render(); toast(`${n} row(s) added.`);
  };
  m.querySelectorAll('[data-close]').forEach(b => b.onclick = () => m.classList.remove('show'));
  setTimeout(() => m.querySelector('#pasteBox').focus(), 50);
}
function parseDelimited(txt) {
  return String(txt).replace(/\r/g, '').split('\n').filter(l => l.trim() !== '')
    .map(l => (l.indexOf('\t') >= 0 ? l.split('\t') : splitCsv(l)).map(c => c.trim().replace(/^"(.*)"$/, '$1')));
}
function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out;
}
function ingestRows(gid, rows) {
  const g = findGrid(gid), target = gridRows(gid);
  let n = 0;
  rows.forEach(cells => {
    if (!cells.some(c => c !== '')) return;
    if (cells[0] && g.cols[0] && String(cells[0]).toLowerCase() === g.cols[0].label.toLowerCase()) return;
    const r = {};
    g.cols.forEach((c, i) => {
      let v = cells[i] == null ? '' : String(cells[i]).trim();
      if (c.type === 'number') { const f = parseFloat(v.replace(/[, ]/g, '')); v = isNaN(f) ? '' : f; }
      if (c.type === 'select' && v) {
        const m = c.options.find(o => o.toLowerCase() === v.toLowerCase())
          || c.options.find(o => o.toLowerCase().startsWith(v.toLowerCase()));
        v = m || v;
      }
      r[c.k] = v;
    });
    target.push(r); n++;
  });
  return n;
}
function findGrid(gid) {
  for (const a of FRAMEWORK) for (const i of (a.items || [])) if (i.grid && i.grid.id === gid) return i.grid;
  return null;
}
function downloadTemplate(gid) {
  const g = findGrid(gid);
  saveText('﻿' + g.cols.map(c => `"${c.label}"`).join(',') + '\n'
    + g.cols.map(c => `"${c.type === 'select' ? c.options.join(' | ') : c.type}"`).join(',') + '\n',
    `TEMPLATE_${gid}.csv`, 'text/csv');
  toast('Blank sheet downloaded — fill it in Excel, then use Import CSV.');
}
function importCsv(gid) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.csv,text/csv';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const rows = parseDelimited(String(rd.result).replace(/^﻿/, ''));
      if (rows.length && rows[0].join('').toLowerCase().includes(findGrid(gid).cols[0].label.toLowerCase().slice(0, 6))) rows.shift();
      const filtered = rows.filter(r => !r.every(c => /\|/.test(c) || /^(text|number|select|date)$/i.test(c)));
      const n = ingestRows(gid, filtered);
      saveGrid(gid); render(); toast(`${n} row(s) imported.`);
    };
    rd.readAsText(f);
  };
  inp.click();
}

document.addEventListener('DOMContentLoaded', boot);
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.auditId) pingPresence(); });
window.addEventListener('beforeunload', e => { if (pending.size) { e.preventDefault(); e.returnValue = ''; } });
