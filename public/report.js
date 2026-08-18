/* ==========================================================================
   REPORT BUILDING, EXPORTS, RESPONSE PORTAL, CONSOLIDATION, ADMINISTRATION
   ========================================================================== */

let CONSOL = [];          // campuses loaded for the consolidated report
let MY_ISSUES = [];       // issues addressed to the signed-in office
const RESP_DRAFT = {};    // responses being typed before submission
let CODES = [];
let ACTIVITY = [];

function respName(r, it) {
  const v = r.responsible || (it && it.responsible) || '';
  return v === 'Other (specify)' ? (r.responsibleOther || 'Other') : v;
}

/* Build the report model from a state object (defaults to the open audit). */
function buildReport(state) {
  const st = state || S;
  const prev = S; S = st;
  try {
    const c = CAMPUSES.find(x => x.id === st.session.campus)
      || { name: st.session.campus || '—', full: (st.session.campus || '') + ' CAMPUS' };
    const R = { campus: c, session: st.session, strengths: [], issues: [], followUp: [],
      limitations: [], appendices: [], notApplicable: [], stats: {}, refMap: {} };
    let secC = 0, secI = 0;
    activeAspects().forEach(a => {
      if (a.followUp) return;
      const comp = [], iss = [];
      activeItems(a).forEach(it => {
        const r = st.items[it.id]; if (!r || !r.status) return;
        if (r.status === 'C') comp.push({ tested: it.title, finding: r.finding || it.standard, evidence: r.evidence || '' });
        else if (r.status === 'PC' || r.status === 'NC') {
          /* If the auditor did not type an extent or list the affected items,
             fall back to the figures the analysis computed from the evidence
             sheet — so a finding is never reported without its magnitude. */
          const d = runDerive(it);
          const affected = (r.affected || '').trim()
            || ((d.affected && d.affected.length) ? d.affected.join('\n') : '');
          iss.push({ itemId: it.id, area: r.area || it.title, issue: r.issue || '', rec: r.rec || '',
            responsible: respName(r, it), severity: r.severity || '', target: r.target || '',
            rootCause: r.rootCause || '', status: r.status, evidence: r.evidence || '',
            quant: (r.quant || '').trim() || d.quant || '', affected });
        }
        else if (r.status === 'NA') R.notApplicable.push({ area: it.title, reason: r.na || '' });
        else if (r.status === 'NV') R.limitations.push({ area: it.title, reason: r.nv || '' });
        const d = runDerive(it);
        if (d.appendix && d.appendix.rows && d.appendix.rows.length && (r.status === 'NC' || r.status === 'PC')
            && !R.appendices.some(x => x.title === d.appendix.title)) R.appendices.push(d.appendix);
      });
      if (comp.length) { secC++; R.strengths.push({ ref: `3.${secC}`, area: a.short, title: a.title, rows: comp }); }
      if (iss.length) {
        secI++;
        const rows = iss.map((x, i) => ({ ...x, ref: `4.${secI}.${i + 1}` }));
        rows.forEach(x => R.refMap[x.itemId] = x.ref);
        R.issues.push({ ref: `4.${secI}`, area: a.short, title: a.title, rows });
      }
    });
    const fus = followUpRecs();
    let n = 0;
    fus.forEach(pr => {
      const f = st.followUp[pr.id]; if (!f || !f.status) return;
      n++;
      R.followUp.push({ ref: `5.${n}`, sourceRef: pr.sourceRef, area: pr.area,
        recommendation: pr.recommendation, responsible: pr.responsibleOfficer,
        status: (IMPL_STATUSES.find(s => s.id === f.status) || {}).label || '', statusId: f.status,
        evidence: f.evidence || '', reason: f.reason || '', remarks: f.remarks || '',
        revisedTarget: f.revisedTarget || '', reissue: f.reissue || '' });
    });
    const all = R.issues.flatMap(g => g.rows);
    R.stats = {
      itemsRecorded: Object.values(st.items).filter(x => x.status).length,
      compliant: Object.values(st.items).filter(x => x.status === 'C').length,
      issues: all.length,
      high: all.filter(x => /^High/.test(x.severity)).length,
      nc: all.filter(x => x.status === 'NC').length,
      pc: all.filter(x => x.status === 'PC').length,
      fuTotal: fus.length,
      fuImplemented: fus.filter(p => (st.followUp[p.id] || {}).status === 'IMP').length,
      fuNot: fus.filter(p => (st.followUp[p.id] || {}).status === 'NOT').length,
      responded: all.filter(x => (st.responses[R.refMap[x.itemId]] || {}).response).length
    };
    R.wayForward = (st.wayForward && st.wayForward.length) ? st.wayForward : draftWayForward(R);
    R.allIssues = all;
    return R;
  } finally { S = prev; }
}

function draftWayForward(R) {
  const w = [], high = (R.allIssues || []).filter(x => /^High/.test(x.severity));
  if (R.stats.issues) w.push(`Management is requested to direct the responsible officers to address the ${R.stats.issues} issue(s) raised in Section 4.0 and to submit their responses through the Quality Audit System within twenty-one (21) days of receipt of this report.`);
  if (high.length) w.push(`Priority attention is required on the ${high.length} issue(s) classified as high severity, namely: ${high.map(x => x.area).join('; ')}.`);
  if (R.stats.fuNot) w.push(`${R.stats.fuNot} recommendation(s) issued in the Fourth Quarter audit remain unimplemented and are re-issued in Section 5.0. Management is requested to establish why implementation has not occurred and to set firm completion dates.`);
  if (R.limitations.length) w.push(`The audit could not verify ${R.limitations.length} item(s) for want of records or access, as set out in Section 6.0. Management is requested to ensure that the records concerned are made available for the next audit cycle.`);
  w.push('The Quality Assurance Unit will monitor implementation of the agreed actions and report the status in the next quarterly audit.');
  return w;
}

/* ------------------------------ preview ---------------------------------- */
function viewReport() {
  const R = buildReport(), missing = validate();
  return `<div class="card noprint">
    <h2>Generated audit report</h2>
    <p class="muted">Built from the data captured. Everything below appears in the Word, PDF and Excel versions.</p>
    <div class="kpi" style="margin:12px 0">
      <div class="k"><b>${R.stats.itemsRecorded}</b><span>Items assessed</span></div>
      <div class="k ok"><b>${R.stats.compliant}</b><span>Strengths</span></div>
      <div class="k bad"><b>${R.stats.issues}</b><span>Issues raised</span></div>
      <div class="k warn"><b>${R.stats.high}</b><span>High severity</span></div>
      <div class="k"><b>${R.stats.fuImplemented}/${R.stats.fuTotal}</b><span>Q4 implemented</span></div>
      <div class="k"><b>${R.stats.responded}/${R.stats.issues}</b><span>Responses in</span></div>
    </div>
    ${missing.length ? `<div class="banner warn"><b>${missing.length} entry/entries still to complete:</b>
      <ul class="flaglist" style="color:var(--warn)">${missing.slice(0, 12).map(m => `<li>${esc(m)}</li>`).join('')}</ul>
      ${missing.length > 12 ? `<div class="muted">…and ${missing.length - 12} more.</div>` : ''}</div>`
      : '<div class="banner ok">All recorded items are complete. The report is ready to be issued.</div>'}
    <div class="btnrow" style="margin-top:12px">
      <button class="btn" data-act="expDocx">Download Word (.docx)</button>
      <button class="btn sec" data-act="printPdf">Print / save as PDF</button>
      <button class="btn sec" data-act="expXlsx">Download tracker (.xlsx)</button>
      ${canEdit() ? '<button class="btn sec" data-act="editWayForward">Edit the way forward</button>' : ''}
      ${isManager() && !S.locked ? '<button class="btn gold" data-act="issueReport">Issue to responsible offices →</button>' : ''}
      ${isManager() && S.locked ? '<button class="btn sec" data-act="reopenReport">Reopen for editing</button>' : ''}
    </div></div>
    <div class="doc" id="docPreview">${reportHtml(R)}</div>`;
}

function validate() {
  const out = [];
  if (!S.session.dateFrom || !S.session.dateTo) out.push('Audit dates not recorded');
  if (!S.session.leadAuditor) out.push('Lead auditor not recorded');
  FRAMEWORK.forEach(a => (a.items || []).forEach(it => {
    const r = S.items[it.id]; if (!r || !r.status) return;
    const ref = `${a.code}. ${it.title}`;
    if (r.status === 'C' && !(r.finding || '').trim()) out.push(`${ref} — strength not stated`);
    if (r.status === 'NC' || r.status === 'PC') {
      if (!(r.issue || '').trim()) out.push(`${ref} — issue not described`);
      if (!(r.rec || '').trim()) out.push(`${ref} — recommendation missing`);
      if (!(r.responsible || it.responsible)) out.push(`${ref} — responsible officer not assigned`);
      if (!(r.severity || '').trim()) out.push(`${ref} — severity not classified`);
      const d = runDerive(it);
      if (!(r.quant || '').trim() && !d.quant) out.push(`${ref} — extent not quantified`);
      if (!(r.affected || '').trim() && !(d.affected && d.affected.length))
        out.push(`${ref} — affected items not listed`);
    }
    if (r.status === 'NA' && !(r.na || '').trim()) out.push(`${ref} — justification missing`);
    if (r.status === 'NV' && !(r.nv || '').trim()) out.push(`${ref} — reason for non-verification missing`);
  }));
  followUpRecs().forEach(p => {
    const f = S.followUp[p.id];
    if (f && f.status && f.status !== 'IMP' && f.status !== 'SUP' && !(f.reason || '').trim())
      out.push(`Follow-up ${p.sourceRef} — reason for non-implementation missing`);
  });
  return out;
}

/* The affected items, one per line, as a numbered list so nothing is vague. */
function affectedHtml(s) {
  const items = String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
  if (!items.length) return '';
  return '<ol style="margin:2px 0 0;padding-left:18px">' +
    items.map(x => `<li>${esc(x)}</li>`).join('') + '</ol>';
}
function affectedLines(s) {
  return String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
}

function listSentence(a) {
  if (!a.length) return '';
  return a.length === 1 ? a[0] : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
}
function methodologyDocs() {
  const ids = activeAspects().map(a => a.id), d = [];
  if (ids.includes('A')) d.push('moderation registers, post-moderation reports, signed mark sheets, external examiner reports and COSIS extracts');
  if (ids.includes('B')) d.push('coursework mark sheets and departmental submission registers');
  if (ids.includes('C')) d.push('approved curricula, NACTVET validation records, timetables, workload allocation reports and Moodle activity reports');
  if (ids.includes('D')) d.push('asset registers, maintenance schedules and ICT status reports');
  if (ids.includes('E')) d.push('library procurement plans, accession registers, subscription agreements and usage statistics');
  d.push('management circulars, departmental progress reports and minutes of the relevant committees');
  return listSentence(d);
}

function reportHtml(R) {
  const s = R.session, c = R.campus;
  const resp = ref => (S.responses[ref] || {});
  let h = `<div class="cover">
    <div class="l">MINISTRY OF INDUSTRY AND TRADE</div>
    <div class="l" style="font-size:19px;margin:6px 0">COLLEGE OF BUSINESS EDUCATION</div>
    <div class="l">${esc(c.full || c.name)}</div>
    <div class="l" style="margin:20px 0 8px;font-size:17px">QUALITY ASSURANCE AUDIT REPORT FOR THE ${esc((s.quarter || 'FIRST').toUpperCase())} QUARTER<br>OF THE ${esc(s.academicYear)} ACADEMIC YEAR</div>
    <div class="l" style="margin-top:16px">SUBMITTED TO ${esc((s.submittedTo || '').toUpperCase())}</div></div>`;

  h += `<h2>1.0 Introduction</h2>
  <p>This report presents the findings of the Quality Assurance Audit conducted at ${esc(c.name)} Campus from
  ${esc(dateRange())}. The audit assessed compliance with institutional policies and quality standards in
  ${esc(listSentence(activeAspects().map(a => a.noun || a.short.toLowerCase())))}.</p>
  <p>The report is organised as follows: Section 3.0 lists the areas of strength;
  Section 4.0 tabulates each issue observed with its extent and the specific items affected, the recommendation
  and the responsible officer, together with the Management Response recorded in the Quality Audit System; Section 5.0 reports the implementation status of the
  recommendations issued in the Fourth Quarter audit of the 2025/2026 academic year; Section 6.0 sets out the
  limitations of the audit; and Section 7.0 sets out the way forward. Supporting evidence is provided in the Appendices.</p>`;
  if (s.team) h += `<p>The audit was conducted by ${esc(s.team)}${s.leadAuditor ? `, led by ${esc(s.leadAuditor)}` : ''}.</p>`;

  h += `<h2>2.0 Methodology</h2>
  <p>The audit combined document review, physical verification, data reconciliation and interviews with responsible
  officers. Document review covered ${esc(methodologyDocs())}. Physical verification covered teaching and learning
  facilities, library facilities and the custody of examination materials. Data reconciliation compared COSIS records
  with signed mark sheets, external examiner inputs and moderation reports in order to identify discrepancies and
  confirm consistency.</p>
  <p>${esc(S.general.samplingBasis || `Where full verification was not feasible, a sample of not less than ${S.standards.minSamplingPct}% of the target population was drawn.`)}</p>`;
  if (S.general.entranceDate || S.general.exitDate)
    h += `<p>An entrance meeting was held on ${esc(fmtDate(S.general.entranceDate) || 'the first day of the audit')} to introduce the scope,
    objectives, methodology and expected deliverables, and an exit meeting was held on
    ${esc(fmtDate(S.general.exitDate) || 'the final day of the audit')} to present the findings to Management.</p>`;

  h += `<h2>3.0 Areas of Strength</h2>`;
  if (!R.strengths.length) h += `<p>No area was assessed as meeting the standard in full in this audit cycle.</p>`;
  else {
    h += `<p>The audit established the following areas of strength.</p>`;
    R.strengths.forEach(g => {
      h += `<h3>${g.ref} ${esc(g.title)}</h3><ol class="roman" type="i">`;
      g.rows.forEach(r => h += `<li>${nl2br(r.finding)}</li>`);
      h += `</ol>`;
    });
  }

  h += `<h2>4.0 Issues Observed and Recommendations</h2>`;
  if (!R.issues.length) h += `<p>No issue was raised in this audit cycle.</p>`;
  else {
    h += `<p>The issues observed are presented in the table that follows. Management Responses are recorded by the
    responsible offices in the Quality Audit System and appear here as they are received.</p>
    <table><thead><tr><th style="width:6%">#</th><th style="width:15%">Audit Area</th><th style="width:27%">Issue Observed</th>
      <th style="width:24%">Recommendation</th><th style="width:12%">Responsible Officer</th><th style="width:16%">Management Response</th></tr></thead><tbody>`;
    R.issues.forEach(g => {
      h += `<tr><td colspan="6" style="background:#f0f3f8"><b>${g.ref} ${esc(g.title)}</b></td></tr>`;
      g.rows.forEach(r => {
        const rp = resp(r.ref);
        h += `<tr><td><b>${r.ref}</b></td><td>${esc(r.area)}</td>
          <td>${nl2br(r.issue)}
            ${r.quant ? `<div style="margin-top:6px"><b>Extent:</b> ${nl2br(r.quant)}</div>` : ''}
            ${r.affected ? `<div style="margin-top:6px"><b>Affected:</b><br>${affectedHtml(r.affected)}</div>` : ''}</td>
          <td>${nl2br(r.rec)}</td>
          <td>${esc(r.responsible)}</td><td class="blank">${rp.response ? nl2br(rp.response) +
            `<div style="font-size:10px;color:#555;margin-top:4px">${esc(rp.status || '')}${rp.by ? ' — ' + esc(rp.by) : ''}${rp.date ? ', ' + esc(fmtDate(rp.date)) : ''}</div>` : ''}</td></tr>`;
      });
    });
    h += `</tbody></table>`;
  }

  h += `<h2>5.0 Implementation of the Fourth Quarter Audit Recommendations</h2>`;
  if (!R.followUp.length) h += `<p>The implementation status of the Fourth Quarter recommendations was not assessed in this audit.</p>`;
  else {
    h += `<p>Of ${R.stats.fuTotal} recommendation(s) issued in the Fourth Quarter audit, ${R.stats.fuImplemented} had been fully
    implemented and ${R.stats.fuNot} had not been implemented at the time of this audit. The position on each recommendation is set out below.</p>
    <table><thead><tr><th style="width:6%">#</th><th style="width:8%">Q4 Ref.</th><th style="width:18%">Audit Area</th>
      <th style="width:26%">Recommendation Issued</th><th style="width:13%">Status</th><th>Evidence / Remarks</th></tr></thead><tbody>`;
    R.followUp.forEach(f => h += `<tr><td><b>${f.ref}</b></td><td>${esc(f.sourceRef)}</td><td>${esc(f.area)}</td>
      <td>${nl2br(f.recommendation)}</td><td>${esc(f.status)}</td>
      <td>${nl2br([f.evidence, f.reason, f.remarks, f.revisedTarget ? 'Revised target: ' + fmtDate(f.revisedTarget) : ''].filter(Boolean).join('\n'))}</td></tr>`);
    h += `</tbody></table>`;
  }

  h += `<h2>6.0 Limitations of the Audit</h2>`;
  if (!R.limitations.length && !R.notApplicable.length && (S.general.docAccess || 'Yes') === 'Yes')
    h += `<p>The audit team was granted access to all records, documents and systems requested, and no limitation affected
    the conduct or conclusions of the audit.</p>`;
  else {
    if (S.general.docAccess && S.general.docAccess !== 'Yes')
      h += `<p>Access to records was ${esc(String(S.general.docAccess).toLowerCase())} granted. ${esc(S.general.accessLimits || '')}</p>`;
    if (R.limitations.length) {
      h += `<table><thead><tr><th style="width:34%">Item not verified</th><th>Reason and effect on the audit</th></tr></thead><tbody>`;
      R.limitations.forEach(l => h += `<tr><td>${esc(l.area)}</td><td>${nl2br(l.reason)}</td></tr>`);
      h += `</tbody></table>`;
    }
    if (R.notApplicable.length) {
      h += `<p>The following items were assessed as not applicable to this campus:</p>
      <table><thead><tr><th style="width:34%">Item</th><th>Justification</th></tr></thead><tbody>`;
      R.notApplicable.forEach(l => h += `<tr><td>${esc(l.area)}</td><td>${nl2br(l.reason)}</td></tr>`);
      h += `</tbody></table>`;
    }
  }

  h += `<h2>7.0 Way Forward</h2><p>The following matters are submitted for Management's scrutiny and direction:</p>
  <ol class="roman" type="i">${R.wayForward.map(w => `<li>${esc(w)}</li>`).join('')}</ol>`;
  if (S.general.campusStrengths) h += `<h3>Good practice observed</h3><p>${nl2br(S.general.campusStrengths)}</p>`;

  h += `<div class="sig"><p>I submit.</p><p style="margin-top:34px">…………………………………………<br>
    <b>${esc((S.session.leadAuditor || 'GORDIAN BWEMELO').toUpperCase())}</b><br>QUALITY ASSURANCE UNIT<br>
    Date: ${esc(fmtDate(new Date().toISOString().slice(0, 10)))}</p>
    <p style="margin-top:18px">Copy to:<br>Rector<br>Deputy Rector – Planning, Finance and Administration<br>
    Director of Academics<br>Director of Academic Support Services<br>Campus Director – ${esc(c.name)}<br>Quality Assurance Coordinators</p></div>`;

  R.appendices.forEach((ap, i) => {
    h += `<h2 style="page-break-before:always">Appendix ${i + 1}: ${esc(ap.title)}</h2>
      <table><thead><tr>${ap.cols.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>`;
    ap.rows.forEach(r => h += `<tr>${r.map(x => `<td>${esc(x == null ? '' : x)}</td>`).join('')}</tr>`);
    h += `</tbody></table>`;
  });
  return h;
}

/* ------------------------------- exports --------------------------------- */
function reportTitle(R) {
  const c = (R || buildReport()).campus;
  return `QA AUDIT REPORT_Q1_${S.session.academicYear.replace('/', '-')}_${c.name.replace(/\s+/g, '_')}`;
}
function viewExports() {
  const R = buildReport(), byOffice = {};
  R.allIssues.forEach(i => { (byOffice[i.responsible || 'Unassigned'] = byOffice[i.responsible || 'Unassigned'] || []).push(i); });
  return `<div class="card">
    <h2>Issue the report and download the documents</h2>
    ${S.locked ? `<div class="banner ok">This report was issued on ${esc(fmtDate((S.issuedAt || '').slice(0, 10)))}.
      The responsible offices below can now see their issues and record responses when they sign in.</div>`
      : `<div class="banner warn">The report has not yet been issued. Responsible offices cannot see their issues until it is.
      ${isManager() ? '' : 'Only the Quality Assurance Manager can issue it.'}</div>`}
    <div class="btnrow" style="margin-top:12px">
      ${isManager() && !S.locked ? '<button class="btn gold" data-act="issueReport">Issue to responsible offices</button>' : ''}
      ${isManager() && S.locked ? '<button class="btn sec" data-act="reopenReport">Reopen for editing</button>' : ''}
      <button class="btn" data-act="expDocx">Word report (.docx)</button>
      <button class="btn sec" data-act="printPdf">PDF (print dialogue)</button>
      <button class="btn sec" data-act="expXlsx">Issues tracker (.xlsx)</button>
      <button class="btn sec" data-act="expMemos">Covering memoranda (.docx)</button>
    </div>
  </div>
  <div class="card">
    <h3>Who has to respond</h3>
    <p class="muted">Each office signs in with its own access code and sees only the issues addressed to it.</p>
    <table class="plain"><thead><tr><th>Responsible office</th><th style="width:90px">Issues</th>
      <th style="width:110px">Responded</th><th style="width:130px">Outstanding</th></tr></thead><tbody>
    ${Object.keys(byOffice).sort().map(o => {
      const list = byOffice[o];
      const done = list.filter(i => (S.responses[i.ref] || {}).response).length;
      return `<tr><td>${esc(o)}</td><td>${list.length}</td><td>${done}</td>
        <td>${list.length - done ? `<span class="badge b-pc">${list.length - done}</span>` : '<span class="badge b-c">None</span>'}</td></tr>`;
    }).join('') || '<tr><td colspan="4" class="muted">No issues raised yet.</td></tr>'}
    </tbody></table>
  </div>`;
}

async function exportActions(act, el) {
  switch (act) {
    case 'expDocx':  exportDocx(buildReport()); return;
    case 'printPdf': if (UI.screen !== 'report') { UI.screen = 'report'; render(); setTimeout(() => window.print(), 400); } else window.print(); return;
    case 'expXlsx':  exportXlsx(buildReport()); return;
    case 'expMemos': exportMemos(buildReport()); return;
    case 'editWayForward': editWayForward(buildReport()); return;
    case 'issueReport':   await issueReport(); return;
    case 'reopenReport':  await API.post(`/api/audit/${S.auditId}/issue`, { locked: false }); S.locked = false; await loadAudits(); render(); toast('Report reopened for editing.'); return;
    case 'resetAudit':    await resetAudit(); return;
    case 'submitResp':    await submitResponse(el.dataset.ref, el.dataset.aid); return;
    case 'newCode':       await newCode(); return;
    case 'toggleCode':    await API.patch('/api/codes/' + encodeURIComponent(el.dataset.code), { active: el.dataset.on !== '1' }); await loadCodes(); return;
    case 'copyCode':      navigator.clipboard.writeText(el.dataset.code).then(() => toast('Access code copied.')); return;
    case 'doBackup':      window.location = '/api/backup'; toast('Backup downloading…'); return;
    case 'doRestore':     restoreBackup(); return;
    case 'consolDocx':    consolidateDocx(); return;
    case 'consolXlsx':    consolidateXlsx(); return;
  }
}

/* Persist the report reference on each issue, then lock the audit. */
async function issueReport() {
  const R = buildReport();
  if (!R.allIssues.length && !confirm('No issues have been raised. Issue the report anyway?')) return;
  const miss = validate();
  if (miss.length && !confirm(`${miss.length} entry/entries are still incomplete. Issue the report anyway?`)) return;
  for (const [itemId, ref] of Object.entries(R.refMap)) {
    if (S.items[itemId].reportRef !== ref) {
      S.items[itemId].reportRef = ref;
      await API.post(`/api/audit/${S.auditId}/item`, { itemId, data: S.items[itemId] });
    }
  }
  await API.post(`/api/audit/${S.auditId}/issue`, { locked: true });
  S.locked = true; S.issuedAt = new Date().toISOString();
  await loadAudits(); render();
  toast('Report issued. Responsible offices can now see and answer their issues.', 5000);
}

function editWayForward(R) {
  const m = $('#modal');
  m.querySelector('.box').innerHTML = `<h3>Way forward — Section 7.0</h3>
    <p class="muted">One point per line. These were drafted from the findings; edit freely.</p>
    <textarea id="wfBox" style="min-height:260px">${esc(R.wayForward.join('\n'))}</textarea>
    <div class="btnrow" style="margin-top:12px"><button class="btn" id="wfSave">Save</button>
    <button class="btn sec" id="wfReset">Restore the drafted text</button>
    <button class="btn sec" data-close>Cancel</button></div>`;
  m.classList.add('show');
  m.querySelector('#wfSave').onclick = () => {
    S.wayForward = m.querySelector('#wfBox').value.split('\n').map(x => x.trim()).filter(Boolean);
    m.classList.remove('show'); saveSession(); render(); toast('Way forward updated.');
  };
  m.querySelector('#wfReset').onclick = () => { S.wayForward = []; m.classList.remove('show'); saveSession(); render(); };
  m.querySelectorAll('[data-close]').forEach(b => b.onclick = () => m.classList.remove('show'));
}

/* ------------------------------ WORD ------------------------------------- */
function exportDocx(R) {
  const s = R.session, c = R.campus, W = 9360;
  let b = '';
  const P = (t, o) => b += wPara(t, o);
  const H = t => b += wPara(t, { style: 'Heading1', size: 13, b: true });
  const resp = ref => (S.responses[ref] || {});

  P('MINISTRY OF INDUSTRY AND TRADE', { b: true, align: 'center', size: 12 });
  P('COLLEGE OF BUSINESS EDUCATION', { b: true, align: 'center', size: 15 });
  P(c.full || c.name, { b: true, align: 'center', size: 12 }); P('', {});
  P(`QUALITY ASSURANCE AUDIT REPORT FOR THE ${(s.quarter || 'FIRST').toUpperCase()} QUARTER OF THE ${s.academicYear} ACADEMIC YEAR`, { b: true, align: 'center', size: 13 });
  P('', {}); P(`SUBMITTED TO ${(s.submittedTo || '').toUpperCase()}`, { b: true, align: 'center', size: 12 }); P('', {});

  H('1.0 Introduction');
  P(`This report presents the findings of the Quality Assurance Audit conducted at ${c.name} Campus from ${dateRange()}. The audit assessed compliance with institutional policies and quality standards in ${listSentence(activeAspects().map(a => a.noun || a.short.toLowerCase()))}.`, { align: 'both' });
  P('The report is organised as follows: Section 3.0 lists the areas of strength; Section 4.0 tabulates each issue observed with its extent and the specific items affected, the recommendation and the responsible officer, together with the Management Response recorded in the Quality Audit System; Section 5.0 reports the implementation status of the recommendations issued in the Fourth Quarter audit of the 2025/2026 academic year; Section 6.0 sets out the limitations of the audit; and Section 7.0 sets out the way forward. Supporting evidence is provided in the Appendices.', { align: 'both' });
  if (s.team) P(`The audit was conducted by ${s.team}${s.leadAuditor ? `, led by ${s.leadAuditor}` : ''}.`, { align: 'both' });

  H('2.0 Methodology');
  P(`The audit combined document review, physical verification, data reconciliation and interviews with responsible officers. Document review covered ${methodologyDocs()}. Physical verification covered teaching and learning facilities, library facilities and the custody of examination materials. Data reconciliation compared COSIS records with signed mark sheets, external examiner inputs and moderation reports in order to identify discrepancies and confirm consistency.`, { align: 'both' });
  P(S.general.samplingBasis || `Where full verification was not feasible, a sample of not less than ${S.standards.minSamplingPct}% of the target population was drawn.`, { align: 'both' });
  if (S.general.entranceDate || S.general.exitDate)
    P(`An entrance meeting was held on ${fmtDate(S.general.entranceDate) || 'the first day of the audit'} to introduce the scope, objectives, methodology and expected deliverables, and an exit meeting was held on ${fmtDate(S.general.exitDate) || 'the final day of the audit'} to present the findings to Management.`, { align: 'both' });

  H('3.0 Areas of Strength');
  if (!R.strengths.length) P('No area was assessed as meeting the standard in full in this audit cycle.', {});
  else {
    P('The audit established the following areas of strength.', { align: 'both' });
    const rom = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv'];
    R.strengths.forEach(g => {
      P(`${g.ref} ${g.title}`, { b: true, size: 11 });
      g.rows.forEach((r, i) => P(`(${rom[i] || i + 1})\t${r.finding}`, { align: 'both', indent: 567, hanging: 340 }));
    });
  }

  H('4.0 Issues Observed and Recommendations');
  if (!R.issues.length) P('No issue was raised in this audit cycle.', {});
  else {
    P('The issues observed are presented in the table that follows. Management Responses are recorded by the responsible offices in the Quality Audit System and appear here as they are received.', { align: 'both' });
    const rows = [['#', 'Audit Area', 'Issue Observed', 'Recommendation', 'Responsible Officer', 'Management Response']];
    R.issues.forEach(g => {
      rows.push([{ text: `${g.ref} ${g.title}`, b: true, span: 6, fill: 'EDF0F5' }]);
      g.rows.forEach(r => {
        const rp = resp(r.ref);
        const cell = [r.issue];
        if (r.quant) cell.push('Extent: ' + r.quant);
        if (r.affected) {
          cell.push('Affected:');
          affectedLines(r.affected).forEach((x, i) => cell.push(`${i + 1}. ${x}`));
        }
        rows.push([{ text: r.ref, b: true }, r.area, cell, r.rec, r.responsible,
          rp.response ? `${rp.response}\n${[rp.status, rp.by, rp.date ? fmtDate(rp.date) : ''].filter(Boolean).join(' — ')}` : '']);
      });
    });
    b += wTable(rows, [640, 1250, 2950, 1950, 1180, 1390], { total: W, size: 8 });
  }

  H('5.0 Implementation of the Fourth Quarter Audit Recommendations');
  if (!R.followUp.length) P('The implementation status of the Fourth Quarter recommendations was not assessed in this audit.', {});
  else {
    P(`Of ${R.stats.fuTotal} recommendation(s) issued in the Fourth Quarter audit, ${R.stats.fuImplemented} had been fully implemented and ${R.stats.fuNot} had not been implemented at the time of this audit. The position on each recommendation is set out below.`, { align: 'both' });
    const rows = [['#', 'Q4 Ref.', 'Audit Area', 'Recommendation Issued', 'Status', 'Evidence / Remarks']];
    R.followUp.forEach(f => rows.push([{ text: f.ref, b: true }, f.sourceRef, f.area, f.recommendation, f.status,
      [f.evidence, f.reason, f.remarks, f.revisedTarget ? 'Revised target: ' + fmtDate(f.revisedTarget) : ''].filter(Boolean).join(' ')]));
    b += wTable(rows, [640, 800, 1700, 2600, 1300, 2320], { total: W, size: 8 });
  }

  H('6.0 Limitations of the Audit');
  if (!R.limitations.length && !R.notApplicable.length && (S.general.docAccess || 'Yes') === 'Yes')
    P('The audit team was granted access to all records, documents and systems requested, and no limitation affected the conduct or conclusions of the audit.', { align: 'both' });
  else {
    if (S.general.docAccess && S.general.docAccess !== 'Yes')
      P(`Access to records was ${String(S.general.docAccess).toLowerCase()} granted. ${S.general.accessLimits || ''}`, { align: 'both' });
    if (R.limitations.length)
      b += wTable([['Item not verified', 'Reason and effect on the audit']].concat(R.limitations.map(l => [l.area, l.reason])), [3200, 6160], { total: W });
    if (R.notApplicable.length) {
      P('The following items were assessed as not applicable to this campus:', {});
      b += wTable([['Item', 'Justification']].concat(R.notApplicable.map(l => [l.area, l.reason])), [3200, 6160], { total: W });
    }
  }

  H('7.0 Way Forward');
  P("The following matters are submitted for Management's scrutiny and direction:", { align: 'both' });
  const rom = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];
  R.wayForward.forEach((w, i) => P(`(${rom[i] || i + 1})\t${w}`, { align: 'both', indent: 567, hanging: 340 }));
  if (S.general.campusStrengths) { P('Good practice observed', { b: true }); P(S.general.campusStrengths, { align: 'both' }); }

  P('', {}); P('I submit.', {}); P('', {}); P('', {});
  P('…………………………………………', {});
  P((S.session.leadAuditor || 'GORDIAN BWEMELO').toUpperCase(), { b: true });
  P('QUALITY ASSURANCE UNIT', {});
  P('Date: ' + fmtDate(new Date().toISOString().slice(0, 10)), {}); P('', {});
  P('Copy to:', { b: true });
  ['Rector', 'Deputy Rector – Planning, Finance and Administration', 'Director of Academics',
   'Director of Academic Support Services', `Campus Director – ${c.name}`, 'Quality Assurance Coordinators']
    .forEach(x => P(x, { spaceAfter: 0 }));

  R.appendices.forEach((ap, i) => {
    b += wPara(`Appendix ${i + 1}: ${ap.title}`, { style: 'Heading1', b: true, size: 12, pageBreakBefore: true });
    b += wTable([ap.cols].concat(ap.rows.map(r => r.map(x => x == null ? '' : String(x)))),
      ap.cols.map(() => Math.floor(W / ap.cols.length)), { total: W, size: 8 });
  });
  saveBlob(docxBuild(b, { footer: `CBE Quality Assurance Audit — ${c.name} Campus — ${s.quarter} Quarter ${s.academicYear}` }),
    reportTitle(R) + '.docx');
  toast('Word report downloaded.');
}

function exportMemos(R) {
  const offices = [...new Set(R.allIssues.map(i => i.responsible))].filter(Boolean);
  if (!offices.length) { toast('No issues to circulate.'); return; }
  const c = R.campus;
  let b = '';
  const P = (t, o) => b += wPara(t, o);
  offices.forEach((office, idx) => {
    const rows = R.allIssues.filter(i => i.responsible === office);
    if (idx) b += wPara('', { pageBreakBefore: true });
    P('COLLEGE OF BUSINESS EDUCATION', { b: true, align: 'center', size: 14 });
    P('Dar es Salaam | Dodoma | Mwanza | Mbeya', { align: 'center', size: 10 });
    P('INTERNAL MEMORANDUM', { b: true, align: 'center', size: 13 }); P('');
    P(`TO:\t${office}`, { b: true });
    P('FROM:\tQuality Assurance Manager', { b: true });
    P(`DATE:\t${fmtDate(new Date().toISOString().slice(0, 10))}`, { b: true });
    P(`RE:\tMANAGEMENT RESPONSE REQUIRED — QUALITY AUDIT REPORT FOR THE ${(R.session.quarter || 'FIRST').toUpperCase()} QUARTER OF THE ${R.session.academicYear} ACADEMIC YEAR, ${(c.full || c.name)}`, { b: true });
    P('');
    P(`The Quality Assurance Unit conducted the academic quality audit at ${c.name} Campus from ${dateRange()}. ${rows.length} issue(s) arising from that audit fall within your office's responsibility and are tabulated below.`, { align: 'both' });
    P(`You are requested to record your response in the Quality Audit System within twenty-one (21) days of the date of this memorandum. Sign in at the College's Quality Audit System using the access code issued to your office; the issues below will be waiting for you, and your response is saved the moment you submit it.`, { align: 'both' });
    P('');
    b += wTable([['#', 'Audit Area', 'Issue Observed', 'Recommendation', 'Target Date']]
      .concat(rows.map(r => [r.ref, r.area, r.issue, r.rec, r.target ? fmtDate(r.target) : ''])),
      [640, 1500, 3100, 2900, 1180], { total: 9320, size: 8 });
    P(''); P('Sincerely,'); P(''); P('');
    P(S.session.leadAuditor || 'Gordian Bwemelo', { b: true });
    P('Quality Assurance Manager');
  });
  saveBlob(docxBuild(b, { footer: 'CBE Quality Assurance Unit' }),
    `MEMORANDA_RESPONSE-REQUEST_${c.name.replace(/\s+/g, '_')}.docx`);
  toast('Covering memoranda downloaded — one per office.');
}

/* ------------------------------ EXCEL ------------------------------------ */
function exportXlsx(R) {
  const c = R.campus;
  const issues = [['#', 'Campus', 'Audit Aspect', 'Audit Area', 'Issue Observed', 'Extent (quantified)',
    'Affected Items', 'Recommendation', 'Responsible Officer', 'Severity', 'Root Cause', 'Target Date', 'Status',
    'Management Response', 'Response Status', 'Responded By', 'Date Responded']];
  R.issues.forEach(g => g.rows.forEach(r => {
    const rp = S.responses[r.ref] || {};
    issues.push([r.ref, c.name, g.title, r.area, r.issue, r.quant,
      affectedLines(r.affected).map((x, i) => `${i + 1}. ${x}`).join('\n'),
      r.rec, r.responsible, r.severity, r.rootCause,
      r.target ? fmtDate(r.target) : '', r.status === 'NC' ? 'Non-compliant' : 'Partially compliant',
      rp.response || '', rp.status || 'Awaiting response', rp.by || '', rp.date ? fmtDate(rp.date) : '']);
  }));
  const comp = [['Ref.', 'Audit Area', 'Item Assessed', 'Strength Established', 'Evidence']];
  R.strengths.forEach(g => g.rows.forEach(r => comp.push([g.ref, g.area, r.tested, r.finding, r.evidence])));
  const fu = [['#', 'Q4 Ref.', 'Audit Area', 'Recommendation', 'Responsible Officer', 'Implementation Status',
    'Evidence', 'Reason Outstanding', 'Revised Target', 'Re-issued?', 'Remarks']];
  R.followUp.forEach(f => fu.push([f.ref, f.sourceRef, f.area, f.recommendation, f.responsible, f.status,
    f.evidence, f.reason, f.revisedTarget ? fmtDate(f.revisedTarget) : '', f.reissue, f.remarks]));
  const summary = [[`CBE QUALITY ASSURANCE AUDIT — ${R.session.quarter} QUARTER ${R.session.academicYear}`, ''],
    ['Campus', c.name], ['Audit dates', dateRange()], ['Lead auditor', R.session.leadAuditor],
    ['Audit team', R.session.team], ['Report issued', S.issuedAt ? fmtDate(S.issuedAt.slice(0, 10)) : 'Not yet issued'],
    ['Generated', new Date().toLocaleString('en-GB')], ['', ''],
    ['Items assessed', R.stats.itemsRecorded], ['Strengths established', R.stats.compliant],
    ['Issues raised', R.stats.issues], ['— non-compliant', R.stats.nc], ['— partially compliant', R.stats.pc],
    ['High severity issues', R.stats.high], ['Responses received', R.stats.responded],
    ['Items not verified', R.limitations.length],
    ['Q4 recommendations followed up', R.stats.fuTotal], ['— fully implemented', R.stats.fuImplemented],
    ['— not implemented', R.stats.fuNot]];
  const sheets = [
    { name: 'Summary', rows: summary, widths: [42, 60] },
    { name: 'Issues Tracker', rows: issues, freeze: 1, widths: [8, 12, 26, 24, 55, 30, 40, 50, 22, 14, 20, 14, 16, 45, 18, 18, 14] },
    { name: 'Strengths', rows: comp, freeze: 1, widths: [8, 24, 34, 60, 30] },
    { name: 'Q4 Follow-up', rows: fu, freeze: 1, widths: [8, 10, 24, 55, 22, 20, 40, 34, 15, 22, 34] }
  ];
  R.appendices.forEach((ap, i) => sheets.push({ name: ('Appx ' + (i + 1) + ' ' + ap.title).substring(0, 31),
    rows: [ap.cols].concat(ap.rows.map(r => r.map(v => v == null ? '' : v))), freeze: 1, widths: ap.cols.map(() => 22) }));
  Object.keys(S.grids).forEach(gid => {
    const g = findGrid(gid), rows = S.grids[gid];
    if (!g || !rows.length) return;
    sheets.push({ name: ('Data ' + g.title).substring(0, 31), freeze: 1,
      rows: [g.cols.map(x => x.label)].concat(rows.map(r => g.cols.map(x => r[x.k] == null ? '' : r[x.k]))),
      widths: g.cols.map(x => Math.min(46, Math.max(12, Math.round((x.w || 120) / 7)))) });
  });
  saveBlob(xlsxBuild(sheets), reportTitle(R) + '_TRACKER.xlsx');
  toast('Issues tracker downloaded.');
}

/* ======================= MANAGEMENT RESPONSES ============================= */
async function loadMyIssues() {
  UI.busy = true; render();
  try { MY_ISSUES = (await API.get('/api/my-issues')).issues || []; }
  catch (e) { MY_ISSUES = []; toast(e.message); }
  UI.busy = false; render();
}
function viewMyResponses() {
  const outstanding = MY_ISSUES.filter(i => !(i.response && i.response.response));
  if (!ME) return '';
  let h = `<div class="card">
    <h2>Management response — ${esc(ME.office || ME.roleLabel)}</h2>
    <p class="muted">These are the audit issues for which your office is the responsible officer. Type your response
      and submit it; it is recorded immediately and appears in the Quality Assurance Unit's report.</p>
    <div class="kpi" style="margin:12px 0">
      <div class="k"><b>${MY_ISSUES.length}</b><span>Issues addressed to you</span></div>
      <div class="k ok"><b>${MY_ISSUES.length - outstanding.length}</b><span>Responded</span></div>
      <div class="k warn"><b>${outstanding.length}</b><span>Outstanding</span></div>
    </div>
    ${MY_ISSUES.length ? '' : '<div class="banner">No issues are currently addressed to your office. If an audit is still in progress its findings will appear here once the report has been issued.</div>'}
  </div>`;
  MY_ISSUES.forEach(i => {
    const r = i.response || RESP_DRAFT[i.ref] || {};
    const done = i.response && i.response.response;
    h += `<div class="card">
      <h3>${esc(i.ref)} — ${esc(i.area)} <span class="badge ${done ? 'b-c' : 'b-pc'}" style="margin-left:8px">${done ? 'Responded' : 'Awaiting your response'}</span></h3>
      <div class="muted" style="margin-bottom:8px">${esc(i.campus)} Campus${i.severity ? ' · ' + esc(i.severity) : ''}</div>
      <table class="plain" style="margin-bottom:12px"><tbody>
        <tr><th style="width:170px">Issue observed</th><td>${nl2br(i.issue)}</td></tr>
        <tr><th>Recommendation</th><td>${nl2br(i.rec)}</td></tr>
        ${i.target ? `<tr><th>Target date</th><td>${esc(fmtDate(i.target))}</td></tr>` : ''}
      </tbody></table>
      <div class="field"><label class="req">Action taken or planned</label>
        <textarea data-pk="${esc(i.ref)}" data-pf="response">${esc(r.response || '')}</textarea></div>
      <div class="grid3">
        <div class="field"><label>Implementation status</label>
          <select data-pk="${esc(i.ref)}" data-pf="status"><option value=""></option>
            ${['Implemented', 'Implementation in progress', 'Planned — not yet started', 'Not accepted', 'Requires further discussion']
              .map(o => `<option ${r.status === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>
        <div class="field"><label>Expected completion date</label>
          <input type="date" data-pk="${esc(i.ref)}" data-pf="due" value="${esc(r.due || '')}"></div>
        <div class="field"><label>Responded by</label>
          <input type="text" data-pk="${esc(i.ref)}" data-pf="by" value="${esc(r.by || ME.name)}"></div>
      </div>
      <div class="btnrow"><button class="btn" data-act="submitResp" data-ref="${esc(i.ref)}" data-aid="${i.auditId}">
        ${done ? 'Update my response' : 'Submit response'}</button>
        ${done ? `<span class="muted">Recorded ${esc(fmtDate(i.response.date))}${i.response.by ? ' by ' + esc(i.response.by) : ''}</span>` : ''}</div>
    </div>`;
  });
  return h;
}
/* Discard everything recorded against this campus and start the file again.
   Deliberately awkward: the campus name has to be typed out in full. */
async function resetAudit() {
  const name = campusObj().name;
  const typed = prompt(`This will delete every finding, evidence sheet, follow-up and response recorded for ${name} Campus. It cannot be undone.\n\nType the campus name to confirm:`);
  if (typed == null) return;
  if (typed.trim().toLowerCase() !== name.toLowerCase()) { toast('Name did not match — nothing was deleted.'); return; }
  await API.post(`/api/audit/${S.auditId}/reset`, {});
  await openAudit(S.auditId);
  toast(`${name} Campus audit file cleared.`);
}

async function submitResponse(ref, auditId) {
  const d = RESP_DRAFT[ref] || {};
  const cur = MY_ISSUES.find(i => i.ref === ref);
  const payload = Object.assign({}, (cur && cur.response) || {}, d);
  if (!(payload.response || '').trim()) { toast('Please type your response before submitting.'); return; }
  await API.post(`/api/audit/${auditId}/response`, { issueRef: ref, data: payload });
  delete RESP_DRAFT[ref];
  await loadMyIssues();
  toast('Response recorded. Thank you.');
}

function viewResponseRegister() {
  const R = buildReport();
  const rows = R.allIssues;
  const withResp = rows.filter(i => (S.responses[i.ref] || {}).response);
  return `<div class="card">
    <h2>Management response register</h2>
    <p class="muted">Responses arrive here the moment a responsible office submits them in the system —
      nothing needs to be merged or emailed.</p>
    <div class="kpi" style="margin:12px 0">
      <div class="k"><b>${rows.length}</b><span>Issues issued</span></div>
      <div class="k ok"><b>${withResp.length}</b><span>Responses received</span></div>
      <div class="k warn"><b>${rows.length - withResp.length}</b><span>Outstanding</span></div>
    </div>
    ${S.locked ? '' : '<div class="banner warn">This report has not been issued yet, so responsible offices cannot see their issues.</div>'}
    <table class="plain"><thead><tr><th style="width:60px">#</th><th style="width:18%">Audit area</th>
      <th style="width:17%">Responsible officer</th><th>Management response</th><th style="width:150px">Status</th></tr></thead><tbody>
    ${rows.map(i => { const r = S.responses[i.ref] || {};
      return `<tr><td><b>${i.ref}</b></td><td>${esc(i.area)}</td><td>${esc(i.responsible)}</td>
        <td>${r.response ? nl2br(r.response) + `<div class="muted">${esc(r.by || '')}${r.date ? ' · ' + esc(fmtDate(r.date)) : ''}</div>` : '<span class="muted">Awaiting response</span>'}</td>
        <td>${r.status ? `<span class="badge ${/^Implemented/.test(r.status) ? 'b-c' : 'b-pc'}">${esc(r.status)}</span>` : '<span class="badge b-na">Outstanding</span>'}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="muted">No issues raised yet.</td></tr>'}
    </tbody></table>
  </div>`;
}

/* ========================== CONSOLIDATION ================================= */
async function loadConsolidated() {
  UI.busy = true; render();
  try {
    const d = await API.get('/api/consolidated');
    CONSOL = (d.campuses || []).map(x => {
      const st = { auditId: x.audit.id, session: Object.assign({}, x.audit.session, { campus: x.audit.campus,
          academicYear: x.audit.academicYear, quarter: x.audit.quarter }),
        general: x.audit.general || {}, standards: Object.assign({ ...DEFAULT_STANDARDS }, x.audit.standards || {}),
        wayForward: x.audit.wayForward || [], items: x.items, grids: x.grids,
        followUp: x.followUp, responses: x.responses, locked: x.audit.locked, issuedAt: x.audit.issuedAt };
      const savedPrior = PRIOR_RECS;
      PRIOR_RECS = x.priorRecs || [];
      const R = buildReport(st);
      PRIOR_RECS = savedPrior;
      return { R, state: st };
    }).filter(x => x.R.stats.itemsRecorded > 0 || x.R.stats.fuTotal > 0);
  } catch (e) { toast(e.message); CONSOL = []; }
  UI.busy = false; render();
}
function viewConsolidate() {
  if (!CONSOL.length) return `<div class="card"><h2>Consolidated report</h2>
    <p class="muted">No campus has recorded findings yet. Once the campus audits are under way this screen
    compares them and produces a College-wide report.</p></div>`;
  const themes = {};
  CONSOL.forEach(x => x.R.allIssues.forEach(i => { (themes[i.area] = themes[i.area] || new Set()).add(x.R.campus.name); }));
  const common = Object.keys(themes).filter(k => themes[k].size > 1).sort();
  return `<div class="card">
    <h2>Consolidated position across the campuses</h2>
    <div class="btnrow" style="margin:10px 0">
      <button class="btn" data-act="consolDocx">Consolidated Word report</button>
      <button class="btn sec" data-act="consolXlsx">Consolidated tracker (.xlsx)</button>
    </div>
    <table class="plain"><thead><tr><th>Indicator</th>${CONSOL.map(x => `<th>${esc(x.R.campus.name)}</th>`).join('')}</tr></thead><tbody>
    ${[['Items assessed', 'itemsRecorded'], ['Strengths established', 'compliant'], ['Issues raised', 'issues'],
       ['High severity', 'high'], ['Responses received', 'responded'], ['Q4 recommendations', 'fuTotal'],
       ['Q4 implemented', 'fuImplemented'], ['Q4 not implemented', 'fuNot']]
      .map(([lab, k]) => `<tr><td>${lab}</td>${CONSOL.map(x => `<td>${x.R.stats[k]}</td>`).join('')}</tr>`).join('')}
    </tbody></table>
  </div>
  <div class="card"><h3>Issues recurring at more than one campus</h3>
    ${common.length ? `<table class="plain"><thead><tr><th>Audit area</th><th>Campuses affected</th></tr></thead><tbody>
      ${common.map(k => `<tr><td>${esc(k)}</td><td>${esc(Array.from(themes[k]).join(', '))}</td></tr>`).join('')}</tbody></table>`
      : '<p class="muted">No issue has yet been recorded at more than one campus.</p>'}
  </div>
  <div class="card"><h3>Combined issues register</h3>
    <table class="plain"><thead><tr><th style="width:60px">#</th><th style="width:90px">Campus</th>
      <th style="width:20%">Audit area</th><th>Issue observed</th><th style="width:15%">Responsible officer</th></tr></thead><tbody>
    ${CONSOL.flatMap(x => x.R.allIssues.map(i => `<tr><td>${i.ref}</td><td>${esc(x.R.campus.name)}</td>
      <td>${esc(i.area)}</td><td>${esc((i.issue || '').substring(0, 220))}${(i.issue || '').length > 220 ? '…' : ''}</td>
      <td>${esc(i.responsible)}</td></tr>`)).join('')}
    </tbody></table></div>`;
}
function consolidateXlsx() {
  const issues = [['#', 'Campus', 'Audit Aspect', 'Audit Area', 'Issue Observed', 'Recommendation',
    'Responsible Officer', 'Severity', 'Target Date', 'Management Response', 'Response Status']];
  CONSOL.forEach(x => x.R.issues.forEach(g => g.rows.forEach(r => {
    const rp = x.state.responses[r.ref] || {};
    issues.push([r.ref, x.R.campus.name, g.title, r.area, r.issue, r.rec, r.responsible, r.severity,
      r.target ? fmtDate(r.target) : '', rp.response || '', rp.status || 'Awaiting response']);
  })));
  const cmp = [['Metric'].concat(CONSOL.map(x => x.R.campus.name))];
  [['Items assessed', 'itemsRecorded'], ['Strengths established', 'compliant'], ['Issues raised', 'issues'],
   ['High severity', 'high'], ['Non-compliant', 'nc'], ['Partially compliant', 'pc'], ['Responses received', 'responded'],
   ['Q4 recommendations', 'fuTotal'], ['Q4 implemented', 'fuImplemented'], ['Q4 not implemented', 'fuNot']]
    .forEach(([lab, k]) => cmp.push([lab].concat(CONSOL.map(x => x.R.stats[k]))));
  const themes = {};
  CONSOL.forEach(x => x.R.allIssues.forEach(i => { (themes[i.area] = themes[i.area] || {})[x.R.campus.name] = 'Yes'; }));
  const th = [['Audit area'].concat(CONSOL.map(x => x.R.campus.name)).concat(['Campuses affected'])];
  Object.keys(themes).sort().forEach(k => th.push([k].concat(CONSOL.map(x => themes[k][x.R.campus.name] || '')).concat([Object.keys(themes[k]).length])));
  saveBlob(xlsxBuild([
    { name: 'Campus comparison', rows: cmp, freeze: 1, widths: [30].concat(CONSOL.map(() => 16)) },
    { name: 'All issues', rows: issues, freeze: 1, widths: [8, 14, 26, 24, 60, 55, 22, 14, 14, 45, 18] },
    { name: 'Common themes', rows: th, freeze: 1, widths: [46].concat(CONSOL.map(() => 14)).concat([18]) }
  ]), `QA_CONSOLIDATED_TRACKER_${META.year.replace('/', '-')}.xlsx`);
  toast('Consolidated tracker downloaded.');
}
function consolidateDocx() {
  let b = '';
  const P = (t, o) => b += wPara(t, o);
  const yr = META.year;
  P('MINISTRY OF INDUSTRY AND TRADE', { b: true, align: 'center', size: 12 });
  P('COLLEGE OF BUSINESS EDUCATION', { b: true, align: 'center', size: 15 }); P('');
  P(`CONSOLIDATED QUALITY ASSURANCE AUDIT REPORT FOR THE ${META.quarter.toUpperCase()} QUARTER OF THE ${yr} ACADEMIC YEAR`, { b: true, align: 'center', size: 13 });
  P(`COVERING ${CONSOL.map(x => x.R.campus.name.toUpperCase()).join(', ')} CAMPUS${CONSOL.length > 1 ? 'ES' : ''}`, { b: true, align: 'center', size: 11 });
  P('');
  P('1.0 Introduction', { style: 'Heading1', b: true, size: 13 });
  P(`This consolidated report brings together the findings of the ${META.quarter} Quarter academic quality audits conducted at ${listSentence(CONSOL.map(x => x.R.campus.name))} Campus${CONSOL.length > 1 ? 'es' : ''}. It compares performance across the campuses, identifies the issues common to more than one campus, and sets out the College-wide matters requiring the direction of Management.`, { align: 'both' });

  P('2.0 Comparative Position', { style: 'Heading1', b: true, size: 13 });
  const rows = [['Indicator'].concat(CONSOL.map(x => x.R.campus.name))];
  [['Items assessed', 'itemsRecorded'], ['Strengths established', 'compliant'], ['Issues raised', 'issues'],
   ['— of which high severity', 'high'], ['Management responses received', 'responded'],
   ['Q4 recommendations followed up', 'fuTotal'], ['— fully implemented', 'fuImplemented'], ['— not implemented', 'fuNot']]
    .forEach(([lab, k]) => rows.push([lab].concat(CONSOL.map(x => String(x.R.stats[k])))));
  b += wTable(rows, [3000].concat(CONSOL.map(() => Math.floor(6360 / CONSOL.length))), { total: 9360 });

  P('3.0 Issues Common to More Than One Campus', { style: 'Heading1', b: true, size: 13 });
  const themes = {};
  CONSOL.forEach(x => x.R.allIssues.forEach(i => { (themes[i.area] = themes[i.area] || new Set()).add(x.R.campus.name); }));
  const common = Object.keys(themes).filter(k => themes[k].size > 1).sort();
  if (!common.length) P('No issue was recorded at more than one campus.', {});
  else b += wTable([['Audit area', 'Campuses affected', 'No.']].concat(
    common.map(k => [k, Array.from(themes[k]).join(', '), String(themes[k].size)])), [4800, 3400, 1160], { total: 9360 });

  P('4.0 Consolidated Issues Register', { style: 'Heading1', b: true, size: 13 });
  const reg = [['#', 'Campus', 'Audit Area', 'Issue Observed', 'Recommendation', 'Responsible Officer', 'Management Response']];
  CONSOL.forEach(x => x.R.allIssues.forEach(r => reg.push([r.ref, x.R.campus.name, r.area, r.issue, r.rec, r.responsible,
    (x.state.responses[r.ref] || {}).response || ''])));
  b += wTable(reg, [700, 900, 1600, 2900, 2600, 1500, 2160], { total: 12360, size: 8 });

  P('5.0 Matters for the Direction of Management', { style: 'Heading1', b: true, size: 13 });
  const rom = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
  const pts = [];
  if (common.length) pts.push(`${common.length} issue area(s) recur at more than one campus and warrant a College-wide instruction rather than campus-by-campus correction, namely: ${common.slice(0, 6).join('; ')}.`);
  const totalHigh = CONSOL.reduce((a, x) => a + x.R.stats.high, 0);
  if (totalHigh) pts.push(`${totalHigh} issue(s) across the College are classified as high severity and require action before the next quarter.`);
  const notImp = CONSOL.reduce((a, x) => a + x.R.stats.fuNot, 0);
  if (notImp) pts.push(`${notImp} recommendation(s) from the Fourth Quarter audit remain unimplemented across the College.`);
  const outstanding = CONSOL.reduce((a, x) => a + (x.R.stats.issues - x.R.stats.responded), 0);
  if (outstanding) pts.push(`${outstanding} issue(s) are still awaiting a Management Response in the Quality Audit System.`);
  pts.push('Responsible officers are requested to record their responses in the Quality Audit System within twenty-one (21) days of receipt of this report.');
  pts.forEach((w, i) => P(`(${rom[i] || i + 1})\t${w}`, { align: 'both', indent: 567, hanging: 340 }));
  P(''); P('I submit.', {}); P(''); P('');
  P('…………………………………………', {}); P('GORDIAN BWEMELO', { b: true }); P('QUALITY ASSURANCE MANAGER', {});
  saveBlob(docxBuild(b, { landscape: true, footer: `CBE Consolidated QA Audit Report — ${META.quarter} Quarter ${yr}` }),
    `QA_CONSOLIDATED_REPORT_${yr.replace('/', '-')}.docx`);
  toast('Consolidated report downloaded.');
}

/* ========================= ADMINISTRATION ================================= */
async function loadCodes() {
  UI.busy = true; render();
  try { CODES = (await API.get('/api/codes')).codes || []; } catch (e) { toast(e.message); }
  UI.busy = false; render();
}
function viewCodes() {
  const byRole = {};
  CODES.forEach(c => (byRole[c.role] = byRole[c.role] || []).push(c));
  const roleName = { qa_manager: 'Quality Assurance Manager', auditor: 'Audit teams', office: 'Responsible offices', viewer: 'Viewers' };
  return `<div class="card">
    <h2>Access codes</h2>
    <p class="muted">Give each person or office the code for their role. A code determines what they can see and do.
      Deactivate a code at any time and it stops working immediately.</p>
    <div class="btnrow" style="margin-top:10px">
      <button class="btn sec" data-act="newCode" data-role="auditor">+ New auditor code</button>
      <button class="btn sec" data-act="newCode" data-role="office">+ New office code</button>
      <button class="btn sec" data-act="newCode" data-role="viewer">+ New viewer code</button>
    </div>
  </div>
  ${['qa_manager', 'auditor', 'office', 'viewer'].filter(r => byRole[r]).map(r => `<div class="card">
    <h3>${roleName[r]}</h3>
    <table class="plain"><thead><tr><th style="width:210px">Code</th><th>Issued to</th>
      <th style="width:110px">Used</th><th style="width:150px">Last used</th><th style="width:170px"></th></tr></thead><tbody>
    ${byRole[r].map(c => `<tr>
      <td><code style="font-weight:700;letter-spacing:.04em">${esc(c.code)}</code></td>
      <td>${esc(c.label || '')}${c.campus ? ` <span class="tag">${esc(c.campus)}</span>` : ''}</td>
      <td>${c.use_count}</td>
      <td>${c.last_used ? esc(new Date(c.last_used).toLocaleDateString('en-GB')) : '—'}</td>
      <td><button class="btn sm sec" data-act="copyCode" data-code="${esc(c.code)}">Copy</button>
        <button class="btn sm ${c.active ? 'danger' : 'sec'}" data-act="toggleCode" data-code="${esc(c.code)}" data-on="${c.active ? 1 : 0}">
          ${c.active ? 'Deactivate' : 'Reactivate'}</button></td></tr>`).join('')}
    </tbody></table></div>`).join('')}`;
}
async function newCode() {
  const m = $('#modal');
  m.querySelector('.box').innerHTML = `<h3>Create an access code</h3>
    <div class="field"><label>Role</label><select id="ncRole">
      <option value="auditor">Auditor — records findings for one campus</option>
      <option value="office">Responsible office — answers its own issues</option>
      <option value="viewer">Viewer — read only</option>
      <option value="qa_manager">Quality Assurance Manager — full control</option></select></div>
    <div class="field" id="ncCampusWrap"><label>Campus</label><select id="ncCampus">
      ${CAMPUSES.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
    <div class="field hide" id="ncOfficeWrap"><label>Office</label><select id="ncOffice">
      ${OFFICES.filter(o => o !== 'Other (specify)').map(o => `<option>${esc(o)}</option>`).join('')}</select></div>
    <div class="field"><label>Label (what this code is for)</label><input type="text" id="ncLabel"></div>
    <div class="btnrow"><button class="btn" id="ncGo">Create code</button><button class="btn sec" data-close>Cancel</button></div>`;
  m.classList.add('show');
  const sync = () => {
    const r = m.querySelector('#ncRole').value;
    m.querySelector('#ncCampusWrap').classList.toggle('hide', r !== 'auditor');
    m.querySelector('#ncOfficeWrap').classList.toggle('hide', r !== 'office');
  };
  m.querySelector('#ncRole').onchange = sync; sync();
  m.querySelector('#ncGo').onclick = async () => {
    const role = m.querySelector('#ncRole').value;
    const campus = m.querySelector('#ncCampus').value;
    const office = m.querySelector('#ncOffice').value;
    const label = m.querySelector('#ncLabel').value ||
      (role === 'auditor' ? `Audit team — ${campus}` : role === 'office' ? office : role);
    try {
      const d = await API.post('/api/codes', { role, campus: role === 'auditor' ? campus : null,
        office: role === 'office' ? office : null, label });
      m.classList.remove('show'); await loadCodes();
      toast('Code created: ' + d.code, 6000);
    } catch (e) { toast(e.message); }
  };
  m.querySelectorAll('[data-close]').forEach(b => b.onclick = () => m.classList.remove('show'));
}

async function loadActivity() {
  UI.busy = true; render();
  try { ACTIVITY = (await API.get('/api/activity')).activity || []; } catch (e) { toast(e.message); }
  UI.busy = false; render();
}
function viewActivity() {
  return `<div class="card">
    <h2>Activity log</h2>
    <p class="muted">Who did what, and when. Useful for confirming that every campus team and office has engaged.</p>
    <table class="plain"><thead><tr><th style="width:160px">When</th><th style="width:170px">Person</th>
      <th style="width:130px">Role</th><th>Action</th></tr></thead><tbody>
    ${ACTIVITY.map(a => `<tr><td>${esc(new Date(a.at).toLocaleString('en-GB'))}</td><td>${esc(a.actor)}</td>
      <td>${esc(a.role)}</td><td>${esc(a.action)}${a.detail ? ' — <span class="muted">' + esc(a.detail) + '</span>' : ''}</td></tr>`).join('')
      || '<tr><td colspan="4" class="muted">Nothing recorded yet.</td></tr>'}
    </tbody></table></div>`;
}

function viewBackup() {
  return `<div class="card">
    <h2>Backup and restore</h2>
    <p class="muted">The whole database — every campus audit, evidence sheet, follow-up, response and access code —
      in a single file. Download one at the end of each audit and keep it with the Unit's records. This also protects
      you if the hosting database is ever replaced or expires.</p>
    <div class="btnrow" style="margin-top:12px">
      <button class="btn" data-act="doBackup">Download a backup now</button>
      <button class="btn danger" data-act="doRestore">Restore from a backup</button>
    </div>
    <div class="banner warn" style="margin-top:14px">Restoring replaces every audit record currently in the system with
      the contents of the backup file. Take a fresh backup before you restore.</div>
  </div>`;
}
function restoreBackup() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    if (!confirm('Restoring will replace every audit record now in the system. Continue?')) return;
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        await API.post('/api/restore', JSON.parse(rd.result));
        toast('Database restored. Reloading…'); setTimeout(() => location.reload(), 1200);
      } catch (e) { toast(e.message, 6000); }
    };
    rd.readAsText(f);
  };
  inp.click();
}
