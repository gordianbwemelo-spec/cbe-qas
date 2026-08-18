/* ==========================================================================
   AUTO-ANALYSIS ENGINE
   Each derive function reads the structured grid rows (or probe answers) for
   an item and returns:
     metrics  – headline figures shown to the auditor as they type
     flags    – breaches of the institutional standards
     suggest  – the status the evidence implies ('C' | 'PC' | 'NC')
     issue    – a drafted issue statement the auditor may accept or rewrite
     rec      – a drafted recommendation
     appendix – rows to be carried into the report appendices
   ========================================================================== */

const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const has = v => v !== undefined && v !== null && String(v).trim() !== '';
const pct = (a, b) => b ? (a / b) * 100 : 0;
const words = n => {
  const w = ['zero','one','two','three','four','five','six','seven','eight','nine','ten',
    'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
  return n <= 20 ? w[n] : String(n);
};
const nw = n => `${words(n)} (${n})`;
const listOf = (arr, max) => {
  max = max || 8;
  const a = arr.filter(has);
  if (!a.length) return '';
  return a.length <= max ? a.join(', ') : a.slice(0, max).join(', ') + `, and ${a.length - max} other(s)`;
};
const empty = () => ({ metrics: [], flags: [], suggest: null, issue: '', rec: '', appendix: null });
/* Every evidence sheet holds EXCEPTIONS ONLY — the auditor records what
   failed, never what passed. The extent of an issue is therefore the number
   of rows recorded and the affected items are the rows themselves. An empty
   sheet is not evidence of compliance, so nothing is suggested until the
   auditor either records an exception or marks the item Compliant. */
const rowsWith = (rows, keys) => (rows || []).filter(x => keys.some(k => has(x[k])));
const s = (n, one, many) => (n === 1 ? one : many);

function excBuild(list, o) {
  const r = empty();
  r.metrics.push({ label: o.metric, value: list.length, flag: list.length > 0 });
  (o.extra || []).forEach(m => r.metrics.push(m));
  if (!list.length) return r;
  r.suggest = o.status || 'NC';
  r.flags.push(o.flag);
  r.issue = o.issue;
  r.rec = o.rec;
  if (o.cols) r.appendix = { title: o.title, cols: o.cols, rows: list.map(o.row) };
  return r;
}

const DERIVE = {

/* ---- A1 : modules not moderated ------------------------------------- */
deriveNotModerated(rows) {
  const L = rowsWith(rows, ['code', 'name']);
  const n = L.length;
  const names = L.map(x => `${x.name || x.code}${x.nta ? ' (NTA Level ' + x.nta + ')' : ''}`);
  return excBuild(L, {
    metric: 'Modules not moderated',
    flag: `${n} module(s) examined were not moderated.`,
    issue: `${nw(n)} ${s(n, 'module was', 'modules were')} examined but not moderated, namely ${listOf(names)}.`,
    rec: 'Enforce moderation of all modules examined, and require the Examinations Office to confirm 100% moderation coverage before results are tabled at DAEC.',
    title: 'Modules examined but not moderated',
    cols: ['Module code', 'Module name', 'NTA level', 'Programme', 'Department', 'Candidates', 'Reason given'],
    row: x => [x.code, x.name, x.nta, x.prog, x.dept, x.cand, x.reason]
  });
},

/* ---- A2 : modules below the sample threshold ------------------------ */
deriveSample(rows, S) {
  const L = rowsWith(rows, ['code', 'name']).map(x => ({ ...x, p: pct(num(x.scripts), num(x.cand)) }))
    .sort((a, b) => a.p - b.p);
  const n = L.length;
  const lowest = n ? L[0].p.toFixed(1) + '%' : '';
  return excBuild(L, {
    metric: `Modules below ${S.sampleSizePct}%`,
    flag: `${n} module(s) were moderated below the required ${S.sampleSizePct}% sample threshold.`,
    issue: `The moderation sample size for ${nw(n)} ${s(n, 'module was', 'modules was')} below the required ${S.sampleSizePct}% threshold, the lowest being ${lowest}. Affected modules: ${listOf(L.map(x => x.name || x.code))}.`,
    rec: `Ensure moderators are allocated time proportional to module volume so that the ${S.sampleSizePct}% sample threshold is met, and require the sample size to be recorded on every moderation report.`,
    title: `Modules moderated below the ${S.sampleSizePct}% sample threshold`,
    cols: ['Module code', 'Module name', 'Candidates', 'Scripts moderated', 'Sample %', 'Moderator'],
    row: x => [x.code, x.name, x.cand, x.scripts, x.p.toFixed(1) + '%', x.modname]
  });
},

/* ---- A3 : moderators over the ceiling -------------------------------- */
deriveModeratorLoad(rows, S) {
  const L = rowsWith(rows, ['name']).sort((a, b) => num(b.nmod) - num(a.nmod));
  const n = L.length;
  const worst = n ? num(L[0].nmod) : 0;
  return excBuild(L, {
    metric: `Moderators exceeding ${S.maxModulesModerator} modules`,
    flag: `${n} moderator(s) exceeded the ${S.maxModulesModerator}-module ceiling (heaviest: ${worst}).`,
    issue: `${nw(n)} ${s(n, 'moderator', 'moderators')} moderated more than ${S.maxModulesModerator} modules${s(n, '', ' each')}, exceeding the manageable workload ceiling. The heaviest allocation was ${worst} modules, carried by ${L[0] ? L[0].name : ''}.`,
    rec: `Recruit additional moderators so that no moderator exceeds ${S.maxModulesModerator} modules per cycle, and require the Examinations Office to reject any allocation schedule that breaches the ceiling before it is issued.`,
    title: `Moderators moderating more than ${S.maxModulesModerator} modules`,
    cols: ['Moderator', 'Institution / Department', 'Modules moderated', 'Remarks'],
    row: x => [x.name, x.inst, x.nmod, x.remark]
  });
},

/* ---- A4 : moderator qualification / specialisation ------------------- */
deriveModeratorQual(rows) {
  const L = rowsWith(rows, ['name']);
  const r = empty();
  const nonPhd9 = L.filter(x => x.nta9 === 'Yes');
  const misaligned = L.filter(x => x.align === 'No' || x.align === 'Partly');
  r.metrics.push({ label: 'Qualification / specialisation exceptions', value: L.length, flag: L.length > 0 });
  if (!L.length) return r;
  const parts = [];
  if (nonPhd9.length) parts.push(`${nw(nonPhd9.length)} ${s(nonPhd9.length, 'moderator who is', 'moderators who are')} not a PhD holder post-moderated NTA Level 9 (Master's) modules, namely ${listOf(nonPhd9.map(x => `${x.name} (${x.qual})`))}`);
  if (misaligned.length) parts.push(`${nw(misaligned.length)} moderator ${s(misaligned.length, 'allocation was', 'allocations were')} not aligned with the moderator's declared area of specialisation (${listOf(misaligned.map(x => x.name))})`);
  if (!parts.length) parts.push(`${nw(L.length)} moderator ${s(L.length, 'allocation was', 'allocations were')} recorded as an exception to the qualification and specialisation requirement (${listOf(L.map(x => x.name))})`);
  r.suggest = 'NC';
  r.flags = parts.slice();
  r.issue = parts.join('. ') + '.';
  r.rec = 'Restrict moderation of NTA Level 9 modules to PhD holders and require Heads of Department to certify specialisation alignment on the moderator allocation schedule before appointment letters are issued.';
  r.appendix = { title: 'Moderator qualification and specialisation exceptions',
    cols: ['Moderator', 'Highest qualification', 'Specialisation', 'Modules allocated', 'Moderated NTA 9?', 'Alignment'],
    rows: L.map(x => [x.name, x.qual, x.spec, x.mods, x.nta9, x.align]) };
  return r;
},

/* ---- A5 : unsigned mark sheets --------------------------------------- */
deriveUnsigned(rows) {
  const L = rowsWith(rows, ['code', 'name']);
  const n = L.length;
  const both = L.filter(x => x.missing === 'Both').length;
  return excBuild(L, {
    metric: 'Mark sheets not fully signed',
    flag: `${n} mark sheet(s) were not signed by the responsible examiners.`,
    issue: `${nw(n)} mark ${s(n, 'sheet was', 'sheets were')} not signed by the responsible internal and/or external examiners${both ? `, of which ${nw(both)} carried neither signature` : ''}. Affected modules: ${listOf(L.map(x => x.name || x.code))}.`,
    rec: 'Heads of Department to obtain the outstanding signatures on the affected mark sheets and to verify that every page is signed by both examiners at the point of receipt.',
    title: 'Mark sheets not fully signed',
    cols: ['Module code', 'Module name', 'Department', 'Signature missing', 'Remarks'],
    row: x => [x.code, x.name, x.dept, x.missing, x.remark]
  });
},

/* ---- A6 : external examiners' scores --------------------------------- */
deriveExternal(rows) {
  const L = rowsWith(rows, ['code', 'name']);
  const n = L.length;
  const students = L.reduce((a, b) => a + num(b.nstud), 0);
  return excBuild(L, {
    metric: 'Modules with scores outstanding',
    extra: [{ label: 'Students affected', value: students, flag: students > 0 }],
    flag: `${students} student record(s) across ${n} module(s) are missing external examiners' scores in COSIS.`,
    issue: `External Examiners' scores had not been incorporated into COSIS for ${nw(n)} ${s(n, 'module', 'modules')}${students ? `, affecting ${nw(students)} ${s(students, 'student', 'students')}` : ''}. Affected modules: ${listOf(L.map(x => x.name || x.code))}.`,
    rec: `Relevant Heads of Department to review and update the affected records by uploading the External Examiners' scores into COSIS, and to confirm completion in writing to the Directorate of Academics.`,
    title: "Modules with external examiners' scores not incorporated into COSIS",
    cols: ['Module code', 'Module name', 'Department', 'Students affected', 'Status'],
    row: x => [x.code, x.name, x.dept, x.nstud, x.inc]
  });
},

/* ---- A7 : COSIS reconciliation --------------------------------------- */
deriveDiscrepancy(rows) {
  const L = rowsWith(rows, ['reg', 'code']);
  const n = L.length;
  const maxGap = n ? Math.max(...L.map(x => Math.abs(num(x.sheet) - num(x.cosis)))) : 0;
  return excBuild(L, {
    metric: 'Discrepancies recorded',
    flag: `${n} score discrepancy/ies between signed mark sheets and COSIS; largest variance ${maxGap} marks.`,
    issue: `${nw(n)} ${s(n, 'discrepancy was', 'discrepancies were')} identified between the scores on the signed mark sheets and those posted in COSIS, the largest variance being ${maxGap} marks. Affected modules: ${listOf([...new Set(L.map(x => x.code))])}.`,
    rec: 'Correct the affected records in COSIS against the signed mark sheets, and institute a mandatory reconciliation of COSIS entries against signed mark sheets, certified by the Head of Department, before results are tabled at DAEC.',
    title: 'Discrepancies between signed mark sheets and COSIS',
    cols: ['Module code', 'Registration no.', 'Score on mark sheet', 'Score in COSIS', 'Variance', 'Nature of discrepancy'],
    row: x => [x.code, x.reg, x.sheet, x.cosis, num(x.sheet) - num(x.cosis), x.nature]
  });
},

/* ---- A11 : printed result records ------------------------------------ */
deriveNoRecords(rows) {
  const L = rowsWith(rows, ['dept']);
  const n = L.length;
  return excBuild(L, {
    metric: 'Departments not retaining records',
    flag: `${n} department(s) do not retain complete printed result records.`,
    issue: `${nw(n)} ${s(n, 'department does', 'departments do')} not retain complete printed and signed student result records at departmental level, namely ${listOf(L.map(x => x.dept))}.`,
    rec: 'Heads of Department to print, sign and file the semester result records for every module, and the Campus Academic Officer to verify the departmental files at the close of each semester.',
    title: 'Departments not retaining printed result records',
    cols: ['Department', 'What was missing', 'Remarks'],
    row: x => [x.dept, x.nature, x.remark]
  });
},

/* ---- A12 : examination material anomalies ---------------------------- */
deriveExamAnomaly(rows, S, ctx) {
  const L = rowsWith(rows, ['area', 'detail']);
  const p = (ctx && ctx.probes) || {};
  const r = empty();
  const regBad = p.printRegister === 'No' || p.printRegister === 'Partly';
  r.metrics.push({ label: 'Anomalies recorded', value: L.length, flag: L.length > 0 });
  if (!L.length && !regBad) return r;
  const parts = [];
  if (L.length) parts.push(`${nw(L.length)} ${s(L.length, 'anomaly was', 'anomalies were')} observed in the handling of examination materials, namely ${listOf(L.map(x => `${x.area}${x.detail ? ' — ' + x.detail : ''}`))}`);
  if (regBad) parts.push('the printing/photocopying register does not capture module-specific details (module code and name, assessment type, pages per paper and copies printed), limiting verification and accountability');
  r.suggest = 'NC';
  r.flags = parts.slice();
  r.issue = parts.join('; ') + '.';
  r.rec = 'The Examinations Officer to institute documented controls at every stage of examination material handling, and the Printing Unit In-charge to redesign the printing register to capture the module code and name, assessment type, pages per paper and quantity printed.';
  if (L.length) r.appendix = { title: 'Anomalies in the handling of examination materials',
    cols: ['Area', 'Anomaly observed', 'Remarks'], rows: L.map(x => [x.area, x.detail, x.remark]) };
  return r;
},

/* ---- B1 : coursework mark sheets not submitted ----------------------- */
deriveCASub(rows) {
  const L = rowsWith(rows, ['code', 'name']);
  const n = L.length;
  const depts = [...new Set(L.map(x => x.dept).filter(has))];
  return excBuild(L, {
    metric: 'Mark sheets not submitted',
    flag: `${n} coursework mark sheet(s) had not been submitted to the Head of Department.`,
    issue: `${nw(n)} coursework mark ${s(n, 'sheet had', 'sheets had')} not been submitted to the respective Heads of Department. Affected modules: ${listOf(L.map(x => x.name || x.code))}${depts.length ? `; affected departments: ${listOf(depts)}` : ''}.`,
    rec: 'Heads of Department to obtain the outstanding coursework mark sheets from the module instructors concerned and to institute a signed submission register that is closed at the end of each semester.',
    title: 'Coursework mark sheets not submitted to Heads of Department',
    cols: ['Module code', 'Module name', 'Department', 'Instructor', 'Remarks'],
    row: x => [x.code, x.name, x.dept, x.instr, x.remark]
  });
},

/* ---- B2 : format ----------------------------------------------------- */
deriveCAFormat(rows) {
  const L = rowsWith(rows, ['code', 'name']);
  const n = L.length;
  return excBuild(L, {
    metric: 'Mark sheets not in the prescribed format',
    flag: `${n} coursework mark sheet(s) did not adhere to the prescribed College format.`,
    issue: `${nw(n)} coursework mark ${s(n, 'sheet did', 'sheets did')} not adhere to the prescribed College format. Affected modules: ${listOf(L.map(x => x.name || x.code))}.`,
    rec: 'Circulate the standard coursework mark sheet template to all instructors and require Heads of Department to reject mark sheets that do not conform to it.',
    title: 'Coursework mark sheets not in the prescribed format',
    cols: ['Module code', 'Module name', 'Department', 'What was omitted', 'Remarks'],
    row: x => [x.code, x.name, x.dept, x.missing, x.remark]
  });
},

/* ---- B3 : signatures ------------------------------------------------- */
deriveCASigned(rows) {
  const L = rowsWith(rows, ['code', 'name']);
  const n = L.length;
  return excBuild(L, {
    metric: 'Mark sheets not signed',
    flag: `${n} coursework mark sheet(s) were not signed by the module instructor.`,
    issue: `${nw(n)} coursework mark ${s(n, 'sheet was', 'sheets were')} not signed by the module instructor, weakening accountability for the scores awarded. Affected modules: ${listOf(L.map(x => x.name || x.code))}.`,
    rec: 'Heads of Department to return the unsigned mark sheets to the instructors concerned for signature, and to verify signatures at the point of receipt.',
    title: 'Coursework mark sheets not signed by the module instructor',
    cols: ['Module code', 'Module name', 'Department', 'Instructor', 'Remarks'],
    row: x => [x.code, x.name, x.dept, x.instr, x.remark]
  });
},

/* ---- B4 : uploading -------------------------------------------------- */
deriveCAUpload(rows) {
  const L = rowsWith(rows, ['code', 'name']);
  const n = L.length;
  const students = L.reduce((a, b) => a + num(b.nstud), 0);
  return excBuild(L, {
    metric: 'Modules not uploaded to COSIS',
    extra: [{ label: 'Students affected', value: students, flag: students > 0 }],
    flag: `Coursework scores for ${n} module(s) had not been uploaded to COSIS.`,
    issue: `Coursework scores for ${nw(n)} ${s(n, 'module', 'modules')} had not been uploaded to COSIS at the time of the audit${students ? `, affecting ${nw(students)} ${s(students, 'student', 'students')}` : ''}. Affected modules: ${listOf(L.map(x => x.name || x.code))}.`,
    rec: 'Upload the outstanding coursework scores to COSIS and set a departmental cut-off date for uploading, monitored by the Campus Academic Officer.',
    title: 'Coursework scores not uploaded to COSIS',
    cols: ['Module code', 'Module name', 'Department', 'Students affected', 'Remarks'],
    row: x => [x.code, x.name, x.dept, x.nstud, x.remark]
  });
},

/* ---- B5 : CA components --------------------------------------------- */
deriveCAComponents(rows) {
  const L = rowsWith(rows, ['code', 'name']);
  const n = L.length;
  return excBuild(L, {
    metric: 'Modules with components missing',
    flag: `${n} module(s) did not have all prescribed continuous assessment components.`,
    issue: `${nw(n)} ${s(n, 'module did', 'modules did')} not carry all four prescribed continuous assessment components. Affected modules: ${listOf(L.map(x => `${x.name || x.code} (${x.missing || 'component missing'})`))}.`,
    rec: 'Heads of Department to require instructors to administer and score all four prescribed continuous assessment components, and to verify completeness against the assessment plan before results are compiled.',
    title: 'Modules with continuous assessment components missing',
    cols: ['Module code', 'Module name', 'Department', 'Component missing', 'Remarks'],
    row: x => [x.code, x.name, x.dept, x.missing, x.remark]
  });
},

/* ---- B6 : coursework variance --------------------------------------- */
deriveCAVariance(rows) {
  const L = rowsWith(rows, ['reg', 'code']);
  const n = L.length;
  const maxGap = n ? Math.max(...L.map(x => Math.abs(num(x.sheet) - num(x.cosis)))) : 0;
  return excBuild(L, {
    metric: 'Coursework variances recorded',
    flag: `${n} coursework score variance(s) between mark sheets and COSIS; largest ${maxGap} marks.`,
    issue: `${nw(n)} coursework score ${s(n, 'variance was', 'variances were')} identified between the mark sheets and COSIS, the largest being ${maxGap} marks. Affected modules: ${listOf([...new Set(L.map(x => x.code))])}.`,
    rec: 'Correct the affected coursework records in COSIS against the signed mark sheets and require the Head of Department to certify the reconciliation before results are tabled.',
    title: 'Coursework score variances between mark sheets and COSIS',
    cols: ['Module code', 'Registration no.', 'Score on mark sheet', 'Score in COSIS', 'Variance', 'Nature of variance'],
    row: x => [x.code, x.reg, x.sheet, x.cosis, num(x.sheet) - num(x.cosis), x.nature]
  });
},

/* ---- B7 : other coursework anomalies -------------------------------- */
deriveCAAnomaly(rows) {
  const L = rowsWith(rows, ['code', 'type', 'detail']);
  const n = L.length;
  return excBuild(L, {
    metric: 'Coursework anomalies recorded',
    flag: `${n} coursework anomaly/ies recorded.`,
    issue: `${nw(n)} coursework ${s(n, 'anomaly was', 'anomalies were')} identified, namely ${listOf(L.map(x => `${x.code || ''}${x.code ? ' — ' : ''}${x.type || x.detail}`))}.`,
    rec: 'Heads of Department to investigate the affected records, correct them where warranted, and require instructors to determine coursework scores individually and within the prescribed range.',
    title: 'Other coursework anomalies',
    cols: ['Module / department', 'Anomaly', 'Detail', 'Remarks'],
    row: x => [x.code, x.type, x.detail, x.remark]
  });
},

/* ---- C1 : curriculum validity --------------------------------------- */
deriveCurriculum(rows) {
  const L = rowsWith(rows, ['prog']);
  const r = empty();
  const bad = L.filter(x => x.status === 'Expired');
  const pend = L.filter(x => x.status && x.status !== 'Expired');
  r.metrics.push({ label: 'Expired curricula', value: bad.length, flag: bad.length > 0 });
  r.metrics.push({ label: 'Awaiting validation', value: pend.length, flag: pend.length > 0 });
  if (!L.length) return r;
  const parts = [];
  if (bad.length) parts.push(`Expired curricula remain in use for ${nw(bad.length)} ${s(bad.length, 'programme', 'programmes')}, namely ${listOf(bad.map(x => x.prog))}`);
  if (pend.length) parts.push(`${nw(pend.length)} ${s(pend.length, 'curriculum is', 'curricula are')} under review or awaiting NACTVET validation (${listOf(pend.map(x => x.prog))})`);
  r.suggest = bad.length ? 'NC' : 'PC';
  r.flags = parts.slice();
  r.issue = parts.join('; ') + (bad.length ? '. Delivering a programme on an expired curriculum exposes the College to a compliance risk with NACTVET.' : '.');
  r.rec = bad.length
    ? 'Expedite the review and NACTVET validation of the expired curricula, and place a moratorium on new intakes into affected programmes until validation is confirmed.'
    : 'Follow up with NACTVET to secure validation and report the outcome to the next Quality Assurance Committee meeting.';
  r.appendix = { title: 'Programmes with expired or unvalidated curricula',
    cols: ['Programme', 'NTA level', 'Curriculum year', 'Expiry year', 'Status'],
    rows: L.map(x => [x.prog, x.nta, x.year, x.expiry, x.status]) };
  return r;
},

/* ---- C2 : module delivery ------------------------------------------- */
deriveDelivery(rows) {
  const L = rowsWith(rows, ['code', 'name']);
  const n = L.length;
  const notAtAll = L.filter(x => x.nature === 'Not delivered').length;
  return excBuild(L, {
    metric: 'Modules not delivered as approved',
    status: notAtAll ? 'NC' : 'PC',
    flag: `${n} module(s) were not delivered as approved${notAtAll ? `, of which ${notAtAll} were not delivered at all` : ''}.`,
    issue: `${nw(n)} prescribed ${s(n, 'module was', 'modules were')} not delivered in accordance with the approved curriculum and timetable. Affected modules: ${listOf(L.map(x => `${x.name || x.code} (${x.nature || 'variation'})`))}.`,
    rec: 'Heads of Department to deliver the outstanding modules within the recovery schedule and to submit a semester implementation return certifying that every prescribed module was delivered as approved.',
    title: 'Modules not delivered as approved',
    cols: ['Module code', 'Module name', 'Programme', 'Department', 'What happened', 'Remarks'],
    row: x => [x.code, x.name, x.prog, x.dept, x.nature, x.remark]
  });
},

/* ---- C3 : instructor workload --------------------------------------- */
deriveWorkload(rows, S) {
  const L = rowsWith(rows, ['name']).map(x => {
    const tfc = num(x.tfc), tnc = num(x.tnc), nmod = num(x.nmod), tot = tfc + tnc;
    const br = [];
    if (nmod > S.maxModulesLecturer) br.push(`${nmod} modules`);
    if (tfc > S.maxTFC) br.push(`TFC ${tfc} hrs`);
    if (tnc > S.maxTNC) br.push(`TNC ${tnc} hrs`);
    if (tot > S.maxTotalHours) br.push(`total ${tot} hrs`);
    const major = nmod > S.maxModulesLecturer + S.minorModuleVar || tfc > S.maxTFC + S.minorHourVar ||
                  tnc > S.maxTNC + S.minorHourVar || tot > S.maxTotalHours + S.minorHourVar;
    return { ...x, tot, br, major };
  }).sort((a, b) => b.tot - a.tot);
  const n = L.length;
  const major = L.filter(x => x.major).length;
  return excBuild(L, {
    metric: 'Instructors exceeding a ceiling',
    status: major ? 'NC' : 'PC',
    extra: n ? [{ label: 'Heaviest total load', value: L[0].tot + ' hrs/week', flag: true },
                { label: 'Major variation', value: major, flag: major > 0 }] : [],
    flag: `${n} instructor(s) exceed a workload ceiling; ${major} constitute a major variation.`,
    issue: `${nw(n)} ${s(n, 'instructor', 'instructors')} exceeded the prescribed workload ceilings (maximum ${S.maxModulesLecturer} modules; TFC ${S.maxTFC} hrs/week; TNC ${S.maxTNC} hrs/week; combined ${S.maxTotalHours} hrs/week), of which ${nw(major)} ${s(major, 'constitutes', 'constitute')} a major variation. The heaviest load reached ${n ? L[0].tot : 0} hours per week, carried by ${n ? L[0].name : ''}${n && L[0].dept ? ' of the ' + L[0].dept + ' Department' : ''}.`,
    rec: 'Heads of Department to revise the affected timetables to bring TFC and TNC hours within the prescribed ceilings, and the Timetabling Office to block-flag any draft schedule producing a workload above the ceilings before it is published.',
    title: 'Instructors exceeding the prescribed workload ceilings',
    cols: ['Instructor', 'Department', 'Modules', 'TFC hrs/week', 'TNC hrs/week', 'Total hrs/week', 'Ceiling(s) breached', 'Classification'],
    row: x => [x.name, x.dept, x.nmod, x.tfc, x.tnc, x.tot, x.br.join('; '), x.major ? 'Major' : 'Minor']
  });
},

/* ---- C4 : allocation vs specialisation ------------------------------ */
deriveAllocation(rows) {
  const L = rowsWith(rows, ['code', 'name', 'instr']);
  const n = L.length;
  return excBuild(L, {
    metric: 'Allocations not aligned',
    flag: `${n} module allocation(s) are not aligned with the instructor's specialisation.`,
    issue: `${nw(n)} module ${s(n, 'allocation was', 'allocations were')} not aligned with the specialisation of the instructor concerned, namely ${listOf(L.map(x => `${x.name || x.code} (${x.instr || 'instructor not named'})`))}.`,
    rec: 'Heads of Department to reallocate the affected modules to instructors qualified in the field, and to certify specialisation alignment on the teaching allocation schedule before the timetable is published.',
    title: 'Module allocations not aligned with instructor specialisation',
    cols: ['Module code', 'Module name', 'Instructor', "Instructor's specialisation", 'Department', 'Remarks'],
    row: x => [x.code, x.name, x.instr, x.spec, x.dept, x.remark]
  });
},

/* ---- C5 : LMS uploads ------------------------------------------------ */
deriveLMS(rows) {
  const L = rowsWith(rows, ['name']);
  const n = L.length;
  return excBuild(L, {
    metric: 'Instructors who did not upload',
    flag: `${n} instructor(s) had not uploaded course outlines or assessment plans to Moodle.`,
    issue: `${nw(n)} ${s(n, 'instructor had', 'instructors had')} not uploaded the course outline and/or assessment plan to the Learning Management System, namely ${listOf(L.map(x => `${x.name}${x.missing ? ' (' + x.missing + ')' : ''}`))}.`,
    rec: 'Heads of Department to require every instructor to upload the course outline and assessment plan to Moodle in the first week of the semester, and the E-Learning Coordinator to report compliance monthly.',
    title: 'Instructors who did not upload course outlines or assessment plans',
    cols: ['Instructor', 'Department', 'Not uploaded', 'Remarks'],
    row: x => [x.name, x.dept, x.missing, x.remark]
  });
},

/* ---- C6 : module overlap -------------------------------------------- */
deriveOverlap(rows) {
  const L = rowsWith(rows, ['code', 'name']);
  const n = L.length;
  return excBuild(L, {
    metric: 'Modules with overlap or naming issues',
    status: 'PC',
    flag: `${n} module(s) show content overlap or inconsistent naming.`,
    issue: `${nw(n)} ${s(n, 'module was', 'modules were')} found to carry overlapping content or inconsistent naming across programmes and intakes, namely ${listOf(L.map(x => `${x.name || x.code} (${x.nature || 'variation'})`))}.`,
    rec: 'The Directorate of Academics to harmonise module names and content across programmes and intakes at the next curriculum review, and to maintain a single authoritative module catalogue.',
    title: 'Modules with overlapping content or inconsistent naming',
    cols: ['Module code', 'Module name', 'Programme(s)', 'Nature', 'Detail'],
    row: x => [x.code, x.name, x.prog, x.nature, x.detail]
  });
},

/* ---- D1 : room readiness -------------------------------------------- */
deriveRooms(rows) {
  const L = rowsWith(rows, ['room']);
  const r = empty();
  const seatGap = L.reduce((a, b) => a + Math.max(0, num(b.cap) - num(b.seatsOk)), 0);
  r.metrics.push({ label: 'Rooms not ready', value: L.length, flag: L.length > 0 });
  if (seatGap) r.metrics.push({ label: 'Seat shortfall', value: seatGap, flag: true });
  if (!L.length) return r;
  const parts = [];
  const mk = (arr, what) => { if (arr.length) parts.push(`${nw(arr.length)} ${s(arr.length, 'room', 'rooms')} (${listOf(arr.map(x => x.room))}) ${s(arr.length, 'lacks', 'lack')} ${what}`); };
  mk(L.filter(x => has(x.proj)), 'a functional projector');
  mk(L.filter(x => has(x.screen)), 'a serviceable projection screen');
  mk(L.filter(x => has(x.hdmi)), 'an HDMI cable');
  mk(L.filter(x => has(x.board)), 'a serviceable whiteboard');
  mk(L.filter(x => has(x.pa)), 'a functional public address system');
  const badPow = L.filter(x => has(x.power)), badFan = L.filter(x => has(x.fans)), dirty = L.filter(x => x.clean === 'Poor');
  if (badPow.length) parts.push(`${nw(badPow.length)} ${s(badPow.length, 'room has', 'rooms have')} inadequate or faulty power outlets`);
  if (badFan.length) parts.push(`${nw(badFan.length)} ${s(badFan.length, 'room has', 'rooms have')} inadequate or faulty fans or lighting`);
  if (dirty.length) parts.push(`${nw(dirty.length)} ${s(dirty.length, 'room was', 'rooms were')} found in a poor state of cleanliness`);
  if (seatGap > 0) parts.push(`a shortfall of ${seatGap} serviceable seats across the affected rooms`);
  if (!parts.length) parts.push(`${nw(L.length)} teaching ${s(L.length, 'room was', 'rooms were')} found not ready for teaching (${listOf(L.map(x => x.room))})`);
  r.suggest = 'NC';
  r.flags = parts.slice();
  r.issue = `${nw(L.length)} teaching ${s(L.length, 'room was', 'rooms were')} found not ready for the academic year: ` + parts.join('; ') + '.';
  r.rec = 'The Procurement Management Unit and the Estates Unit to procure and install the outstanding equipment and effect the identified repairs before the commencement of the 2026/2027 academic year, and to submit a completion return to the Quality Assurance Unit.';
  r.appendix = { title: 'Rooms not ready for teaching',
    cols: ['Room', 'Type', 'Seats req.', 'Seats OK', 'Projector', 'Screen', 'HDMI', 'Whiteboard', 'P/A', 'Power', 'Fans / lighting', 'Cleanliness', 'Remarks'],
    rows: L.map(x => [x.room, x.type, x.cap, x.seatsOk, x.proj, x.screen, x.hdmi, x.board, x.pa, x.power, x.fans, x.clean, x.remark]) };
  return r;
},

/* ---- D2 : safety and sanitation ------------------------------------- */
deriveSafety(rows) {
  const L = rowsWith(rows, ['area', 'detail']);
  const n = L.length;
  return excBuild(L, {
    metric: 'Deficiencies recorded',
    flag: `${n} safety, cleanliness or sanitation deficiency/ies observed.`,
    issue: `${nw(n)} safety, cleanliness or sanitation ${s(n, 'deficiency was', 'deficiencies were')} observed on the campus, namely ${listOf(L.map(x => `${x.area}${x.location ? ' at ' + x.location : ''}${x.detail ? ' — ' + x.detail : ''}`))}.`,
    rec: 'The Estates and Maintenance Unit to rectify the identified deficiencies before the commencement of the academic year and to institute a scheduled inspection regime for sanitation and safety installations.',
    title: 'Safety, cleanliness and sanitation deficiencies',
    cols: ['Area', 'Location', 'Deficiency observed', 'Remarks'],
    row: x => [x.area, x.location, x.detail, x.remark]
  });
},

/* ---- D3 : outstanding works ----------------------------------------- */
deriveWorks(rows) {
  const L = rowsWith(rows, ['item', 'nature']);
  const n = L.length;
  const unbudgeted = L.filter(x => x.budget === 'No' || x.budget === 'Unknown').length;
  return excBuild(L, {
    metric: 'Works outstanding',
    extra: unbudgeted ? [{ label: 'Not budgeted for', value: unbudgeted, flag: true }] : [],
    flag: `${n} maintenance or repair item(s) remain outstanding${unbudgeted ? `; ${unbudgeted} not budgeted for` : ''}.`,
    issue: `${nw(n)} maintenance or repair ${s(n, 'item remains', 'items remain')} outstanding ahead of the academic year, namely ${listOf(L.map(x => `${x.item}${x.nature ? ' — ' + x.nature : ''}`))}${unbudgeted ? `, of which ${nw(unbudgeted)} ${s(unbudgeted, 'is', 'are')} not budgeted for in the current financial year` : ''}.`,
    rec: 'The Estates and Maintenance Unit to execute the outstanding works before the commencement of teaching and to include any unbudgeted items in the next supplementary budget.',
    title: 'Maintenance and repairs outstanding',
    cols: ['Item / location', 'Work required', 'Quantity', 'Budgeted?', 'Remarks'],
    row: x => [x.item, x.nature, x.qty, x.budget, x.remark]
  });
},

/* ---- D5 : welfare facilities ---------------------------------------- */
deriveWelfare(rows) {
  const L = rowsWith(rows, ['facility', 'gap']);
  const n = L.length;
  return excBuild(L, {
    metric: 'Welfare gaps recorded',
    flag: `${n} welfare facility gap(s) identified.`,
    issue: `${nw(n)} welfare facility ${s(n, 'gap was', 'gaps were')} identified, namely ${listOf(L.map(x => `${x.facility}${x.gap ? ' — ' + x.gap : ''}`))}.`,
    rec: 'The Dean of Students to address the identified welfare gaps before registration and to report the position to Management ahead of the arrival of the incoming cohort.',
    title: 'Welfare facility gaps',
    cols: ['Facility', 'Gap identified', 'Shortfall', 'Remarks'],
    row: x => [x.facility, x.gap, x.qty, x.remark]
  });
},

/* ---- D6 : staffing gaps --------------------------------------------- */
deriveStaff(rows) {
  const L = rowsWith(rows, ['unit']);
  const n = L.length;
  const total = L.reduce((a, b) => a + num(b.nreq), 0);
  return excBuild(L, {
    metric: 'Units with staffing gaps',
    extra: total ? [{ label: 'Staff required', value: total, flag: true }] : [],
    flag: `${n} unit(s) begin the academic year with a staffing gap${total ? `; ${total} staff required` : ''}.`,
    issue: `${nw(n)} ${s(n, 'unit', 'units')} would begin the academic year with a staffing gap${total ? `, requiring ${nw(total)} additional ${s(total, 'member of staff', 'members of staff')}` : ''}. Affected units: ${listOf(L.map(x => `${x.unit}${x.nreq ? ' (' + x.nreq + ')' : ''}`))}.`,
    rec: 'The Campus Director to submit the staffing requirement to the Directorate of Human Resources for recruitment or redeployment before the commencement of teaching.',
    title: 'Units with staffing gaps',
    cols: ['Unit / department', 'Cadre required', 'Number required', 'Remarks'],
    row: x => [x.unit, x.cadre, x.nreq, x.remark]
  });
},

/* ---- E1 : library ICT ------------------------------------------------ */
deriveLibICT(rows) {
  const L = rowsWith(rows, ['item', 'detail']);
  const n = L.length;
  return excBuild(L, {
    metric: 'ICT deficiencies recorded',
    flag: `${n} library ICT deficiency/ies recorded.`,
    issue: `${nw(n)} ICT ${s(n, 'deficiency was', 'deficiencies were')} identified in the library, namely ${listOf(L.map(x => `${x.item}${x.qty ? ' (' + x.qty + ' short/affected)' : ''}${x.detail ? ' — ' + x.detail : ''}`))}.`,
    rec: 'Include the outstanding library ICT requirements in the next procurement plan and extend wireless coverage to all library study areas.',
    title: 'Library ICT deficiencies',
    cols: ['Item', 'Deficiency observed', 'Number short / affected', 'Remarks'],
    row: x => [x.item, x.detail, x.qty, x.remark]
  });
},

/* ---- E2 : acquisition ------------------------------------------------ */
deriveLibAcq(rows) {
  const L = rowsWith(rows, ['cat']);
  const n = L.length;
  const total = L.reduce((a, b) => a + num(b.nshort), 0);
  return excBuild(L, {
    metric: 'Categories short of plan',
    extra: total ? [{ label: 'Items short', value: total, flag: true }] : [],
    flag: `Acquisition fell below plan in ${n} category/ies${total ? `; ${total} items short` : ''}.`,
    issue: `Acquisition of learning resources fell below the approved procurement plan in ${nw(n)} ${s(n, 'category', 'categories')}${total ? `, a shortfall of ${nw(total)} items` : ''}, namely ${listOf(L.map(x => `${x.cat}${x.nshort ? ' (' + x.nshort + ')' : ''}`))}.`,
    rec: 'The Campus Librarian and the Procurement Management Unit to complete the outstanding acquisitions in the current financial year and to report progress quarterly.',
    title: 'Learning resources not acquired as planned',
    cols: ['Resource category', 'Quantity short', 'Available for use', 'Remarks'],
    row: x => [x.cat, x.nshort, x.avail, x.remark]
  });
},

/* ---- E3 : subscriptions ---------------------------------------------- */
deriveSubs(rows) {
  const L = rowsWith(rows, ['name']);
  const n = L.length;
  return excBuild(L, {
    metric: 'Lapsed or inaccessible subscriptions',
    flag: `${n} e-resource subscription(s) lapsed or inaccessible.`,
    issue: `${nw(n)} academic e-resource ${s(n, 'subscription was', 'subscriptions were')} lapsed or inaccessible to users at the time of the audit, namely ${listOf(L.map(x => `${x.name}${x.status ? ' (' + x.status.toLowerCase() + ')' : ''}`))}.`,
    rec: 'Renew the lapsed subscriptions and establish a renewal calendar that triggers procurement action at least two months before expiry.',
    title: 'Lapsed or inaccessible e-resource subscriptions',
    cols: ['Subscription / database', 'Provider', 'Status', 'Expiry date', 'Remarks'],
    row: x => [x.name, x.provider, x.status, x.expiry, x.remark]
  });
},

/* ---- E4 : information literacy --------------------------------------- */
deriveLiteracy(rows) {
  const L = rowsWith(rows, ['group']);
  const n = L.length;
  return excBuild(L, {
    metric: 'Groups untrained',
    flag: `${n} cohort(s) or staff group(s) did not receive information literacy training.`,
    issue: `${nw(n)} ${s(n, 'cohort or staff group', 'cohorts or staff groups')} did not receive information literacy training during the academic year, namely ${listOf(L.map(x => x.group))}.`,
    rec: 'The Campus Librarian to schedule and deliver information literacy sessions for the affected groups and to maintain attendance registers for every session.',
    title: 'Groups that did not receive information literacy training',
    cols: ['Cohort / staff group', 'Reason given', 'Remarks'],
    row: x => [x.group, x.reason, x.remark]
  });
},

/* ---- E5 : usage trend ------------------------------------------------ */
deriveUsage(rows) {
  const L = rowsWith(rows, ['metric']);
  const n = L.length;
  return excBuild(L, {
    metric: 'Metrics that declined',
    status: 'PC',
    flag: `${n} usage metric(s) declined against the previous period.`,
    issue: `Library usage declined against the previous period in ${nw(n)} of the metrics monitored, namely ${listOf(L.map(x => `${x.metric} (${x.prev} to ${x.curr})`))}.`,
    rec: 'The Campus Librarian to analyse the causes of declining usage and to implement targeted user engagement, including scheduled information literacy sessions for each new cohort.',
    title: 'Library usage metrics that declined against the previous period',
    cols: ['Metric', 'Previous period', 'Current period', 'Change', 'Remarks'],
    row: x => [x.metric, x.prev, x.curr, num(x.curr) - num(x.prev), x.remark]
  });
},

/* ---- E6 : repository -------------------------------------------------- */
deriveRepo(rows) {
  const L = rowsWith(rows, ['dept', 'prog']);
  const n = L.length;
  const total = L.reduce((a, b) => a + num(b.ncount), 0);
  return excBuild(L, {
    metric: 'Departments with deposits outstanding',
    extra: total ? [{ label: 'Dissertations outstanding', value: total, flag: true }] : [],
    flag: `${total || n} dissertation(s) had not been deposited in the institutional repository.`,
    issue: `${total ? nw(total) : nw(n)} ${s(total || n, 'dissertation had', 'dissertations had')} not been deposited in the institutional repository, outstanding from ${nw(n)} ${s(n, 'department', 'departments')}, namely ${listOf(L.map(x => `${x.dept}${x.ncount ? ' (' + x.ncount + ')' : ''}`))}.`,
    rec: 'Heads of Department to submit all outstanding dissertations and hard copies to the Directorate of Library Services for deposit in the institutional repository, and the Directorate to confirm receipt in writing.',
    title: 'Dissertations not deposited in the institutional repository',
    cols: ['Department', 'Programme', 'Number outstanding', 'Where currently held', 'Remarks'],
    row: x => [x.dept, x.prog, x.ncount, x.location, x.remark]
  });
},

/* ---- E7 : other library deficiencies --------------------------------- */
deriveLibGap(rows) {
  const L = rowsWith(rows, ['area', 'detail']);
  const n = L.length;
  return excBuild(L, {
    metric: 'Library deficiencies recorded',
    flag: `${n} further library deficiency/ies recorded.`,
    issue: `${nw(n)} further library ${s(n, 'deficiency was', 'deficiencies were')} observed, namely ${listOf(L.map(x => `${x.area}${x.detail ? ' — ' + x.detail : ''}`))}.`,
    rec: 'The Campus Librarian to address the identified deficiencies and to report the position to the Directorate of Library Services.',
    title: 'Other library deficiencies',
    cols: ['Area', 'Deficiency observed', 'Remarks'],
    row: x => [x.area, x.detail, x.remark]
  });
}
};
