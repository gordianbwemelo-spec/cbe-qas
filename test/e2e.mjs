import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import fs from 'fs'; import path from 'path';
import { execSync } from 'child_process';

const BASE = process.env.BASE || 'http://localhost:3100';
const OUT = path.resolve('test/out');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const step = async (n, fn) => { try { await fn(); console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ' :: ' + e.message); errors.push(n + ': ' + e.message); } };

const psql = q => execSync(
  `psql -h /tmp -p 5433 -U qauser -d qadb -tAc ${JSON.stringify(q)}`, { encoding: 'utf8' }).trim();

/* Start from an empty database every time — a half-finished previous run
   would otherwise leave rows behind and fail the next one for no reason. */
psql('TRUNCATE audit_responses, audit_followups, audit_grids, audit_items, activity, audits RESTART IDENTITY CASCADE');

const MANAGER = 'mgr';
const AUD_DODOMA = 'aud:Dodoma';
const OFF_DASS = 'off:Director of Academic Support Services (DASS)';
const OFF_DAC = 'off:Director of Academics (DAC)';
const VIEWER = 'view';
console.log('codes:', { MANAGER, AUD_DODOMA, OFF_DASS, OFF_DAC, VIEWER });

const b = await chromium.launch();
const mk = async () => {
  const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  p.on('console', m => { const s = m.text(); /* 400/401/403/409/423 are the deliberate refusals the negative tests provoke */
    if (m.type() === 'error' && !/favicon|status of (40[0139]|423)|ERR_FAILED|CORS/.test(s)) errors.push('CONSOLE: ' + s); });
  return p;
};
const login = async (p, name, key) => {
  await p.goto(BASE); await p.waitForSelector('.idcard', { timeout: 15000 });
  await p.click(`.idcard[data-key="${key.replace(/"/g, '\\"')}"]`);
  await p.waitForSelector('#loginName');
  await p.fill('#loginName', name);
  await p.click('#loginGo'); await p.waitForTimeout(1400);
};

/* ---------------------------- 1. manager -------------------------------- */
const mgr = await mk();
await step('an invented identity is rejected by the server', async () => {
  await mgr.goto(BASE); await mgr.waitForSelector('.idcard');
  const r = await mgr.evaluate(async () => {
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'off:Rector Of Everything', name: 'Intruder' }) });
    return res.status;
  });
  if (r !== 400) throw new Error('server accepted an invented identity: ' + r);
});
await step('manager signs in and sees all campuses', async () => {
  await login(mgr, 'Dr. Gordian Bwemelo', MANAGER);
  const t = await mgr.textContent('#root');
  for (const c of ['Dar es Salaam', 'Dodoma', 'Mwanza', 'Mbeya']) if (!t.includes(c)) throw new Error('missing ' + c);
  if (!t.includes('Quality Assurance Manager')) throw new Error('role not shown');
});
await step('manager opens the Dodoma audit', async () => {
  await mgr.click('[data-act="open"][data-c="Dodoma"]');
  await mgr.waitForTimeout(1800);
  const c = await mgr.evaluate(() => S.session.campus);
  if (c !== 'Dodoma') throw new Error('campus not opened: ' + c);
  const n = await mgr.evaluate(() => PRIOR_RECS.length);
  if (n !== 28) throw new Error('expected 28 Dodoma prior recs, got ' + n);
});
await step('set-up details persist to the server', async () => {
  await mgr.click('[data-go="setup"]'); await mgr.waitForTimeout(400);
  await mgr.fill('[data-s="session.dateFrom"]', '2026-09-21');
  await mgr.fill('[data-s="session.dateTo"]', '2026-09-25');
  await mgr.fill('[data-s="session.leadAuditor"]', 'Dr. Gordian Bwemelo');
  await mgr.fill('[data-s="session.team"]', 'Mr. Laban Msoffe, Dr. Mwanaidi Msuya, Dr. Gordian Bwemelo');
  await mgr.waitForTimeout(1600);
  const row = psql("select session->>'leadAuditor' from audits where campus='Dodoma'");
  if (row !== 'Dr. Gordian Bwemelo') throw new Error('not saved to the database: ' + row);
});

/* ------------------------ 2. evidence and branching ---------------------- */
await step('evidence sheet saves and auto-flags', async () => {
  await mgr.click('[data-go="A"]'); await mgr.waitForTimeout(500);
  await mgr.evaluate(async () => {
    /* exceptions only — nothing that met the standard is recorded */
    ingestRows('g_notmod', [
      ['PSC 05104', 'Procurement Principles', '7', 'BPS', 'Procurement', '76', 'Moderator not appointed', '']
    ]);
    ingestRows('g_lowsample', [
      ['ACC 05203', 'Financial Accounting', '98', '12', 'Dr. J. Mushi', ''],
      ['ICT 06110', 'Database Systems', '22', '3', 'Mr. A. Kimaro', '']
    ]);
    ingestRows('g_modload', [
      ['Dr. J. Mushi', 'CBE DSM', '24', '']
    ]);
    ingestRows('g_modqual', [
      ['Mr. A. Kimaro', 'Lecturer by publication', 'ICT', 'ICT 06110 Database Systems', 'Yes', 'Partly', '']
    ]);
    saveGrid('g_notmod'); saveGrid('g_lowsample'); saveGrid('g_modload'); saveGrid('g_modqual');
    await new Promise(r => setTimeout(r, 1500));
    render();
  });
  await mgr.waitForTimeout(1200);
  const n = Number(psql("select jsonb_array_length(rows) from audit_grids where grid_id='g_lowsample'"));
  if (n !== 2) throw new Error('grid not persisted: ' + n);
  const d = await mgr.evaluate(() => ({ a1: runDerive(itemDef('A1').item).suggest,
    a2: runDerive(itemDef('A2').item).suggest, a3: runDerive(itemDef('A3').item).suggest }));
  if (d.a1 !== 'NC' || d.a2 !== 'NC' || d.a3 !== 'NC') throw new Error('flags wrong: ' + JSON.stringify(d));
});
await step('apply suggestion writes a status and issue to the server', async () => {
  await mgr.evaluate(() => { UI.open.A1 = true; render(); });
  await mgr.waitForTimeout(300);
  await mgr.click('#it_A1 [data-act="applySuggest"]');
  await mgr.waitForTimeout(1500);
  const st = psql("select data->>'status' from audit_items where item_id='A1'");
  const iss = psql("select data->>'issue' from audit_items where item_id='A1'");
  if (st !== 'NC') throw new Error('status not saved: ' + st);
  if (!/not moderated/i.test(iss)) throw new Error('issue not drafted: ' + iss);
  if (!/Procurement Principles/.test(iss)) throw new Error('affected module not named in the issue: ' + iss);
});
await step('branching shows only the fields the status needs', async () => {
  if (!(await mgr.locator('#it_A1 [data-s="items.A1.issue"]').count())) throw new Error('issue field missing on NC');
  await mgr.evaluate(() => { UI.open.A5 = true; rec('A5').status = 'C'; saveItem('A5'); render(); });
  await mgr.waitForTimeout(600);
  if (await mgr.locator('#it_A5 [data-s="items.A5.issue"]').count()) throw new Error('issue field shown on compliant item');
  if (!(await mgr.locator('#it_A5 [data-s="items.A5.finding"]').count())) throw new Error('finding field missing');
});

/* ---------------------- 3. concurrent auditor --------------------------- */
const aud = await mk();
await step('campus auditor signs in straight into their own campus', async () => {
  await login(aud, 'Mr. Laban Msoffe', AUD_DODOMA);
  await aud.waitForTimeout(1800);
  const c = await aud.evaluate(() => S.session.campus);
  if (c !== 'Dodoma') throw new Error('auditor not routed to Dodoma: ' + c);
});
await step("auditor's entry reaches the manager's screen without a reload", async () => {
  await aud.evaluate(() => {
    rec('A9').status = 'C';
    rec('A9').finding = 'Results were discussed and approved at DAEC, CAEC and JAEC.';
    saveItem('A9');
  });
  await aud.waitForTimeout(1500);
  // manager polls every 7s
  await mgr.waitForTimeout(9000);
  const seen = await mgr.evaluate(() => (S.items.A9 || {}).status);
  if (seen !== 'C') throw new Error('manager did not receive the change: ' + seen);
});
await step('auditor cannot open another campus', async () => {
  const r = await aud.evaluate(async () => {
    try { await API.post('/api/audits', { campus: 'Mbeya' }); return 'allowed'; }
    catch (e) { return e.message; }
  });
  if (r === 'allowed') throw new Error('auditor was allowed to open another campus');
});

/* -------------------- 4. finish the audit as manager --------------------- */
await step('fill the remaining findings', async () => {
  await mgr.evaluate(async () => {
    const sev = { H: 'High — systemic / affects credibility of results or accreditation',
      M: 'Medium — recurring or affects a department / programme', L: 'Low — isolated, easily corrected' };
    S.items.A1.severity = sev.H; saveItem('A1');
    for (const id of ['A2', 'A3', 'A4']) {
      const d = runDerive(itemDef(id).item), r = rec(id);
      r.status = 'NC'; r.issue = d.issue; r.rec = d.rec; r.area = itemDef(id).item.title;
      r.responsible = itemDef(id).item.responsible; r.severity = sev.M; saveItem(id);
    }
    rec('A5').evidence = 'Mark sheets, 46 of 112 sampled'; saveItem('A5');
    rec('A12').status = 'NV'; rec('A12').nv = 'The printing register for August 2026 was not availed.'; saveItem('A12');
    ingestRows('g_curr', [
      ['MBA Finance and Banking', '9', '2018', '2023', 'Expired', ''],
      ['Bachelor of Accountancy', '8', '2022', '2027', 'Under review', '']
    ]);
    ingestRows('g_wl', [['Hassan Issa Millas', 'Accountancy', '7', '34', '26', '']]);
    saveGrid('g_curr'); saveGrid('g_wl');
    for (const id of ['C1', 'C3']) {
      const d = runDerive(itemDef(id).item), r = rec(id);
      r.status = d.suggest; r.issue = d.issue; r.rec = d.rec; r.area = itemDef(id).item.title;
      r.responsible = itemDef(id).item.responsible; r.severity = sev.H; saveItem(id);
    }
    ingestRows('g_rooms', [
      ['B1-7', 'Classroom', '60', '60', 'Absent', 'Absent', 'Absent', '', '', '', '', '', ''],
      ['T2', 'Lecture theatre', '120', '108', 'Faulty', '', '', 'Worn', 'Faulty', 'Inadequate', 'Faulty', 'Fair', '']
    ]);
    saveGrid('g_rooms');
    const d1 = runDerive(itemDef('D1').item);
    Object.assign(rec('D1'), { status: d1.suggest, issue: d1.issue, rec: d1.rec,
      area: itemDef('D1').item.title, responsible: 'Head of Estates / Maintenance Unit', severity: sev.H });
    saveItem('D1');
    followUpRecs().forEach((r, i) => {
      const st = ['IMP', 'PART', 'NOT', 'PROG'][i % 4];
      S.followUp[r.id] = { status: st, evidence: 'Verified against departmental records.',
        reason: st === 'IMP' ? '' : 'Awaiting procurement action.', revisedTarget: st === 'IMP' ? '' : '2026-12-31',
        remarks: 'Reviewed on site.' };
      saveFollowUp(r.id);
    });
    await new Promise(r => setTimeout(r, 3000));
  });
  await mgr.waitForTimeout(3000);
  const n = Number(psql("select count(*) from audit_followups where data->>'status' <> ''"));
  if (n !== 28) throw new Error('follow-ups not saved: ' + n);
});
await step('report builds with every section', async () => {
  await mgr.click('[data-go="report"]'); await mgr.waitForTimeout(1200);
  const t = await mgr.textContent('#docPreview');
  for (const s of ['1.0 Introduction', '2.0 Methodology', '3.0 Areas of Strength',
    '4.0 Issues Observed', '5.0 Implementation of the Fourth Quarter', '6.0 Limitations',
    '7.0 Way Forward', 'Appendix 1'])
    if (!t.includes(s)) throw new Error('missing ' + s);
  const st = await mgr.evaluate(() => buildReport().stats);
  console.log('       stats:', JSON.stringify(st));
  if (st.issues < 6) throw new Error('too few issues: ' + st.issues);
  // every issue must be quantified and its affected items named
  const bad = await mgr.evaluate(() => buildReport().allIssues
    .filter(i => !(i.quant || '').trim() || !(i.affected || '').trim())
    .map(i => i.ref + ' ' + i.area));
  if (bad.length) throw new Error('issues without extent or affected items: ' + bad.join(', '));
  if (!t.includes('Extent:')) throw new Error('extent not printed in the report');
  if (!t.includes('Affected:')) throw new Error('affected items not printed in the report');
});
await mgr.screenshot({ path: OUT + '/report.png' });

/* ------------------------- 5. issue and respond -------------------------- */
await step('office sees nothing before the report is issued', async () => {
  const off = await mk();
  await login(off, 'Mr. E. Kimambo', OFF_DASS);
  await off.waitForTimeout(1500);
  const n = await off.evaluate(() => MY_ISSUES.length);
  if (n !== 0) throw new Error('office saw ' + n + ' issues before issue');
  await off.close();
});
await step('manager issues the report', async () => {
  mgr.once('dialog', d => d.accept());
  await mgr.click('[data-act="issueReport"]');
  await mgr.waitForTimeout(3000);
  const locked = psql("select locked from audits where campus='Dodoma'");
  if (locked !== 't') throw new Error('audit not locked: ' + locked);
  const refs = Number(psql("select count(*) from audit_items where data->>'reportRef' is not null"));
  if (refs < 6) throw new Error('report references not written: ' + refs);
});
const off = await mk();
await step('office signs in and sees only its own issues', async () => {
  await login(off, 'Mr. E. Kimambo', OFF_DASS);
  await off.waitForTimeout(1800);
  const d = await off.evaluate(() => MY_ISSUES.map(i => i.responsible));
  if (!d.length) throw new Error('office sees no issues after issue');
  if (d.some(x => !/Academic Support/.test(x))) throw new Error('office saw another office\'s issues: ' + JSON.stringify(d));
  const t = await off.textContent('#root');
  if (t.includes('Institutional standards')) throw new Error('office can see the audit navigation');
});
await step('office submits a response and it is stored', async () => {
  await off.fill('[data-pf="response"]', 'The two modules have since been moderated and the reports filed. A checklist has been introduced.');
  await off.selectOption('[data-pf="status"]', 'Implemented');
  await off.fill('[data-pf="due"]', '2026-10-15');
  await off.click('[data-act="submitResp"]');
  await off.waitForTimeout(2000);
  const stored = psql("select data->>'response' from audit_responses limit 1");
  if (!/since been moderated/.test(stored)) throw new Error('response not stored: ' + stored);
});
await step('office cannot answer another office\'s issue', async () => {
  const r = await off.evaluate(async () => {
    try { await API.post('/api/audit/1/response', { issueRef: '4.3.1', data: { response: 'x' } }); return 'allowed'; }
    catch (e) { return e.message; }
  });
  if (r === 'allowed') throw new Error('cross-office response was accepted');
});
await step('the response appears in the manager\'s report', async () => {
  await mgr.reload(); await mgr.waitForTimeout(2500);
  await mgr.evaluate(async () => { await openAudit(S.auditId || 1); });
  await mgr.waitForTimeout(1500);
  await mgr.click('[data-go="report"]'); await mgr.waitForTimeout(1200);
  const t = await mgr.textContent('#docPreview');
  if (!/since been moderated/.test(t)) throw new Error('response missing from report');
});

/* ------------------------------ 6. exports -------------------------------- */
const grab = async (sel, page) => {
  const pg = page || mgr;
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 25000 }), pg.click(sel)]);
  const f = path.join(OUT, dl.suggestedFilename()); await dl.saveAs(f);
  console.log('  ok  downloaded ' + dl.suggestedFilename() + ' (' + Math.round(fs.statSync(f).size / 1024) + ' KB)');
  return f;
};
const docx = await grab('[data-act="expDocx"]');
const xlsx = await grab('[data-act="expXlsx"]');
await mgr.click('[data-go="exports"]'); await mgr.waitForTimeout(800);
await grab('[data-act="expMemos"]');

/* --------------------------- 7. consolidation ----------------------------- */
await step('consolidated view loads from the server', async () => {
  await mgr.click('[data-go="consol"]'); await mgr.waitForTimeout(2500);
  const n = await mgr.evaluate(() => CONSOL.length);
  if (n < 1) throw new Error('no campuses consolidated');
  const t = await mgr.textContent('#root');
  if (!t.includes('Dodoma')) throw new Error('Dodoma missing from consolidation');
});
await grab('[data-act="consolDocx"]');
await grab('[data-act="consolXlsx"]');

/* ------------------------------ 8. admin ---------------------------------- */
await step('access-code administration', async () => {
  await mgr.click('[data-go="codes"]'); await mgr.waitForTimeout(1500);
  const t = await mgr.textContent('#root');
  if (!/CBE-/.test(t)) throw new Error('codes not listed');
  const before = Number(psql('select count(*) from access_codes'));
  await mgr.evaluate(async () => { await API.post('/api/codes', { role: 'viewer', label: 'Test viewer' }); });
  const after = Number(psql('select count(*) from access_codes'));
  if (after !== before + 1) throw new Error('code not created');
});
await step('a PIN, once set, is enforced', async () => {
  execSync(`psql -h /tmp -p 5433 -U qauser -d qadb -c "UPDATE access_codes SET pin='4417' WHERE role='viewer'"`);
  const t = await mk();
  await t.goto(BASE); await t.waitForSelector('.idcard');
  const r = await t.evaluate(async () => {
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'view', name: 'Tester' }) });
    return res.status;
  });
  if (r !== 401) throw new Error('PIN not demanded: ' + r);
  const ok = await t.evaluate(async () => {
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'view', name: 'Tester', pin: '4417' }) });
    return res.status;
  });
  if (ok !== 200) throw new Error('correct PIN rejected: ' + ok);
  execSync(`psql -h /tmp -p 5433 -U qauser -d qadb -c "UPDATE access_codes SET pin=NULL WHERE role='viewer'"`);
  await t.close();
});
await step('viewer cannot edit', async () => {
  const v = await mk();
  await login(v, 'Management Viewer', VIEWER);
  await v.waitForTimeout(1200);
  await v.click('[data-act="open"][data-c="Dodoma"]').catch(() => {});
  await v.waitForTimeout(2000);
  const r = await v.evaluate(async () => {
    try { await API.post('/api/audit/' + S.auditId + '/item', { itemId: 'A1', data: { status: 'C' } }); return 'allowed'; }
    catch (e) { return e.message; }
  });
  if (r === 'allowed') throw new Error('viewer was allowed to write');
  await v.close();
});
await step('activity log records who did what', async () => {
  await mgr.click('[data-go="activity"]'); await mgr.waitForTimeout(1500);
  const t = await mgr.textContent('#root');
  if (!t.includes('Dr. Gordian Bwemelo')) throw new Error('manager not in log');
  if (!t.includes('submitted a management response')) throw new Error('office response not logged');
});
await step('backup downloads and contains the audit', async () => {
  await mgr.click('[data-go="backup"]'); await mgr.waitForTimeout(800);
  const f = await grab('[data-act="doBackup"]');
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (d.kind !== 'cbe-qas-backup') throw new Error('wrong backup format');
  if (!d.tables.audits.length) throw new Error('backup has no audits');
  if (!d.tables.audit_responses.length) throw new Error('backup has no responses');
  fs.writeFileSync(OUT + '/backup.json', JSON.stringify(d));
});
await step('restore rebuilds the database from the backup', async () => {
  const d = JSON.parse(fs.readFileSync(OUT + '/backup.json', 'utf8'));
  await mgr.evaluate(async dump => { await API.post('/api/restore', dump); }, d);
  await mgr.waitForTimeout(1500);
  const n = Number(psql("select count(*) from audit_items where data->>'status' <> ''"));
  if (n < 8) throw new Error('restore lost items: ' + n);
  const r = Number(psql('select count(*) from audit_responses'));
  if (r < 1) throw new Error('restore lost responses');
});

await step('clearing an issued audit is refused until it is reopened', async () => {
  const id = Number(psql("select id from audits where campus='Dodoma'"));
  const r = await mgr.evaluate(async aid => {
    try { await API.post(`/api/audit/${aid}/reset`, {}); return 'allowed'; }
    catch (e) { return e.message; }
  }, id);
  if (r === 'allowed') throw new Error('an issued report was cleared without being reopened');
});
await step('clearing an audit file empties it', async () => {
  const id = Number(psql("select id from audits where campus='Dodoma'"));
  const before = Number(psql(`select count(*) from audit_items where audit_id=${id}`));
  if (before < 5) throw new Error('nothing to clear: ' + before);
  await mgr.evaluate(async aid => {
    await API.post(`/api/audit/${aid}/issue`, { locked: false });
    await API.post(`/api/audit/${aid}/reset`, {});
  }, id);
  await mgr.waitForTimeout(800);
  for (const t of ['audit_items', 'audit_grids', 'audit_followups', 'audit_responses']) {
    const n = Number(psql(`select count(*) from ${t} where audit_id=${id}`));
    if (n) throw new Error(`${t} not cleared: ${n}`);
  }
  const kept = Number(psql(`select count(*) from audits where id=${id}`));
  if (kept !== 1) throw new Error('the audit file itself was deleted');
  const lead = psql(`select session->>'leadAuditor' from audits where id=${id}`);
  if (lead !== 'Dr. Gordian Bwemelo') throw new Error('set-up particulars were lost: ' + lead);
});

/* ----------------------------- 9. anonymous ------------------------------- */
await step('signed-out visitor cannot read audit data', async () => {
  const a = await mk();
  await a.goto(BASE); await a.waitForTimeout(500);
  const r = await a.evaluate(async () => (await fetch('/api/audit/1')).status);
  if (r !== 401) throw new Error('unauthenticated request returned ' + r);
  await a.close();
});

await b.close();
console.log('\n' + (errors.length ? 'ERRORS (' + errors.length + '):\n' + errors.join('\n') : 'ALL CHECKS PASSED'));
process.exit(errors.length ? 1 : 0);
