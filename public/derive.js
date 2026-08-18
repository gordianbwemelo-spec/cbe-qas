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

const DERIVE = {

/* ---- A1 : moderation coverage -------------------------------------- */
deriveModeration(rows, S, ctx) {
  const r = empty();
  const filled = rows.filter(x => has(x.code) || has(x.name));
  if (!filled.length) return r;
  const notMod = filled.filter(x => x.moder === 'No');
  const declared = num((ctx.probes || {}).totalExamined);
  const covered = filled.length;
  r.metrics.push({ label: 'Modules captured', value: covered });
  if (declared) r.metrics.push({ label: 'Modules examined (declared)', value: declared });
  r.metrics.push({ label: 'Modules not moderated', value: notMod.length, flag: notMod.length > 0 });
  if (declared && covered < declared)
    r.flags.push(`Only ${covered} of ${declared} examined modules have been captured in the register — coverage is incomplete.`);
  if (notMod.length) {
    r.suggest = 'NC';
    r.flags.push(`${notMod.length} module(s) were not moderated.`);
    const names = notMod.map(x => `${x.name || x.code}${x.nta ? ' (NTA Level ' + x.nta + ')' : ''}`);
    r.issue = `${nw(notMod.length)} module${notMod.length > 1 ? 's were' : ' was'} not moderated, namely ${listOf(names)}. This was established during post-moderation.`;
    r.rec = 'Enforce moderation of all modules examined, and require the Examinations Office to confirm 100% moderation coverage before results are tabled at DAEC.';
    r.appendix = { title: 'Modules examined but not moderated',
      cols: ['Module code', 'Module name', 'NTA level', 'Programme', 'Candidates'],
      rows: notMod.map(x => [x.code, x.name, x.nta, x.prog, x.cand]) };
  } else { r.suggest = 'C'; }
  return r;
},

/* ---- A2 : 20% sample size ------------------------------------------ */
deriveSample(rows, S) {
  const r = empty();
  const filled = rows.filter(x => (x.moder === 'Yes') && num(x.cand) > 0);
  if (!filled.length) return r;
  const withPct = filled.map(x => ({ ...x, p: pct(num(x.scripts), num(x.cand)) }));
  const below = withPct.filter(x => x.p < S.sampleSizePct);
  const avg = withPct.reduce((a, b) => a + b.p, 0) / withPct.length;
  r.metrics.push({ label: 'Moderated modules assessed', value: filled.length });
  r.metrics.push({ label: 'Average sample size', value: avg.toFixed(1) + '%' });
  r.metrics.push({ label: `Modules below ${S.sampleSizePct}%`, value: below.length, flag: below.length > 0 });
  if (below.length) {
    r.suggest = 'NC';
    r.flags.push(`${below.length} module(s) were moderated below the required ${S.sampleSizePct}% sample threshold.`);
    r.issue = `The moderation sample size for ${nw(below.length)} module${below.length > 1 ? 's was' : ' was'} below the required ${S.sampleSizePct}% threshold, the lowest being ${Math.min(...below.map(x => x.p)).toFixed(1)}%. Average sample size across moderated modules was ${avg.toFixed(1)}%.`;
    r.rec = `Ensure moderators are allocated time proportional to module volume so that the ${S.sampleSizePct}% sample threshold is met, and require the sample size to be recorded on every moderation report.`;
    r.appendix = { title: `Modules moderated below the ${S.sampleSizePct}% sample threshold`,
      cols: ['Module code', 'Module moderated', 'Total candidates', 'Scripts moderated', 'Sample %', 'Moderator'],
      rows: below.sort((a, b) => a.p - b.p).map(x => [x.code, x.name, x.cand, x.scripts, x.p.toFixed(1) + '%', x.modname]) };
  } else { r.suggest = 'C'; }
  return r;
},

/* ---- A3 : moderator workload --------------------------------------- */
deriveModeratorLoad(rows, S) {
  const r = empty();
  const filled = rows.filter(x => has(x.name));
  if (!filled.length) return r;
  const over = filled.filter(x => num(x.nmod) > S.maxModulesModerator).sort((a, b) => num(b.nmod) - num(a.nmod));
  r.metrics.push({ label: 'Moderators assessed', value: filled.length });
  r.metrics.push({ label: `Exceeding ${S.maxModulesModerator} modules`, value: over.length, flag: over.length > 0 });
  if (over.length) {
    const worst = num(over[0].nmod);
    r.suggest = 'NC';
    r.flags.push(`${over.length} of ${filled.length} moderators exceeded the ${S.maxModulesModerator}-module ceiling (heaviest: ${worst}).`);
    r.issue = `${nw(over.length)} of ${nw(filled.length)} moderators (${pct(over.length, filled.length).toFixed(0)}%) moderated more than ${S.maxModulesModerator} modules each, exceeding the manageable workload ceiling. The heaviest allocation was ${worst} modules, carried by ${over[0].name}.`;
    r.rec = `Recruit additional moderators so that no moderator exceeds ${S.maxModulesModerator} modules per cycle, and require the Examinations Office to reject any allocation schedule that breaches the ceiling before it is issued.`;
    r.appendix = { title: `Moderators moderating more than ${S.maxModulesModerator} modules`,
      cols: ['#', 'Moderator', 'Institution / Department', 'Total modules moderated'],
      rows: over.map((x, i) => [i + 1, x.name, x.inst, x.nmod]) };
  } else { r.suggest = 'C'; }
  return r;
},

/* ---- A4 : moderator qualification / specialisation ------------------ */
deriveModeratorQual(rows, S) {
  const r = empty();
  const filled = rows.filter(x => has(x.name));
  if (!filled.length) return r;
  const nonPhd9 = filled.filter(x => x.nta9 === 'Yes' && x.qual && x.qual !== 'PhD');
  const misaligned = filled.filter(x => x.align === 'No' || x.align === 'Partly');
  r.metrics.push({ label: 'Non-PhD moderators on NTA 9', value: nonPhd9.length, flag: nonPhd9.length > 0 });
  r.metrics.push({ label: 'Specialisation not aligned', value: misaligned.length, flag: misaligned.length > 0 });
  const parts = [];
  if (nonPhd9.length) parts.push(`${nw(nonPhd9.length)} moderator${nonPhd9.length > 1 ? 's who are' : ' who is'} not a PhD holder post-moderated NTA Level 9 (Master's) modules, namely ${listOf(nonPhd9.map(x => `${x.name} (${x.qual})`))}`);
  if (misaligned.length) parts.push(`${nw(misaligned.length)} moderator allocation${misaligned.length > 1 ? 's were' : ' was'} not aligned with the moderator's declared area of specialisation (${listOf(misaligned.map(x => x.name))})`);
  if (parts.length) {
    r.suggest = 'NC';
    r.flags = parts.slice();
    r.issue = parts.join('. ') + '.';
    r.rec = 'Restrict moderation of NTA Level 9 modules to PhD holders and require Heads of Department to certify specialisation alignment on the moderator allocation schedule before appointment letters are issued.';
    r.appendix = { title: 'Moderator qualification and specialisation exceptions',
      cols: ['Moderator', 'Qualification', 'Specialisation', 'Moderated NTA 9?', 'Alignment'],
      rows: [...new Set([...nonPhd9, ...misaligned])].map(x => [x.name, x.qual, x.spec, x.nta9, x.align]) };
  } else { r.suggest = 'C'; }
  return r;
},

/* ---- A6 : external examiners' scores -------------------------------- */
deriveExternal(rows) {
  const r = empty();
  const filled = rows.filter(x => has(x.code) || has(x.name));
  if (!filled.length) return r;
  const out = filled.filter(x => x.inc === 'No' || x.inc === 'Partly');
  const students = out.reduce((a, b) => a + num(b.nstud), 0);
  r.metrics.push({ label: 'Modules with scores outstanding', value: out.length, flag: out.length > 0 });
  r.metrics.push({ label: 'Students affected', value: students, flag: students > 0 });
  if (out.length) {
    r.suggest = 'NC';
    r.flags.push(`${students} student record(s) across ${out.length} module(s) are missing external examiners' scores in COSIS.`);
    r.issue = `External Examiners' scores for ${nw(students)} student${students > 1 ? 's' : ''} had not been incorporated into COSIS. Affected modules: ${listOf(out.map(x => x.name || x.code))}.`;
    r.rec = `Relevant Heads of Department to review and update the records of the affected ${students} student(s) by uploading the External Examiners' scores into COSIS, and to confirm completion in writing to the Directorate of Academics.`;
    r.appendix = { title: "Modules with external examiners' scores not incorporated into COSIS",
      cols: ['Module code', 'Module name', 'Department', 'Students affected', 'Status'],
      rows: out.map(x => [x.code, x.name, x.dept, x.nstud, x.inc]) };
  } else { r.suggest = 'C'; }
  return r;
},

/* ---- A7 : COSIS reconciliation -------------------------------------- */
deriveDiscrepancy(rows) {
  const r = empty();
  const filled = rows.filter(x => has(x.reg) || has(x.code));
  r.metrics.push({ label: 'Discrepancies recorded', value: filled.length, flag: filled.length > 0 });
  if (!filled.length) return r;
  const maxGap = Math.max(...filled.map(x => Math.abs(num(x.sheet) - num(x.cosis))));
  r.suggest = 'NC';
  r.flags.push(`${filled.length} score discrepancy/ies between signed mark sheets and COSIS; largest variance ${maxGap} marks.`);
  r.issue = `${nw(filled.length)} discrepanc${filled.length > 1 ? 'ies were' : 'y was'} identified between the scores on the signed mark sheets and those posted in COSIS, the largest variance being ${maxGap} marks. Affected modules: ${listOf([...new Set(filled.map(x => x.code))])}.`;
  r.rec = 'Correct the affected records in COSIS against the signed mark sheets, and institute a mandatory reconciliation of COSIS entries against signed mark sheets, certified by the Head of Department, before results are tabled at DAEC.';
  r.appendix = { title: 'Discrepancies between signed mark sheets and COSIS',
    cols: ['Module code', 'Registration no.', 'Score on mark sheet', 'Score in COSIS', 'Variance', 'Nature of discrepancy'],
    rows: filled.map(x => [x.code, x.reg, x.sheet, x.cosis, (num(x.sheet) - num(x.cosis)), x.nature]) };
  return r;
},

/* ---- A12 : printing variance ---------------------------------------- */
derivePrintVariance(rows, S, ctx) {
  const r = empty();
  const p = ctx.probes || {};
  const printed = num(p.printedCopies), actual = num(p.actualCands);
  if (printed && actual) {
    const v = printed - actual, vp = pct(v, actual);
    r.metrics.push({ label: 'Printing variance', value: `${v} copies (${vp.toFixed(1)}%)`, flag: vp > S.printSurplusPct });
    if (vp > S.printSurplusPct) {
      r.suggest = 'NC';
      r.flags.push(`Printing surplus of ${vp.toFixed(1)}% exceeds the ${S.printSurplusPct}% guidance threshold.`);
      r.issue = `A surplus of ${v} examination copies (${vp.toFixed(1)}% above the ${actual} candidates who sat) was printed, exceeding the acceptable variance threshold of ${S.printSurplusPct}%.`;
      r.rec = 'Base printing quantities on confirmed candidate registers, record the approved and actual quantities in the printing register, and require the Examinations Officer to account for any surplus exceeding the approved tolerance.';
    }
  }
  if (p.printRegister === 'No' || p.printRegister === 'Partly') {
    r.suggest = 'NC';
    r.flags.push('The printing/photocopying register does not capture the required module-level detail.');
    r.issue = (r.issue ? r.issue + ' ' : '') + 'The printing/photocopying register does not capture module-specific details (module name, assessment type, pages per paper, copies printed), limiting verification and accountability.';
    r.rec = (r.rec ? r.rec + ' ' : '') + 'The Printing Unit In-charge to redesign the printing register to capture the module code and name, assessment type (test or end-of-semester examination), number of pages per paper, approved quantity and actual quantity printed.';
  }
  return r;
},

/* ---- B1..B4 : continuous assessment --------------------------------- */
_caCore(rows, key, label) {
  const r = empty();
  const filled = rows.filter(x => has(x.dept));
  if (!filled.length) return r;
  const exp = filled.reduce((a, b) => a + num(b.expected), 0);
  const got = filled.reduce((a, b) => a + num(b[key]), 0);
  const gap = exp - got;
  const shortDepts = filled.filter(x => num(x[key]) < num(x.expected));
  r.metrics.push({ label: 'Modules taught', value: exp });
  r.metrics.push({ label: label, value: got });
  r.metrics.push({ label: 'Shortfall', value: gap, flag: gap > 0 });
  r.metrics.push({ label: 'Compliance', value: pct(got, exp).toFixed(1) + '%' });
  if (gap > 0) {
    r.suggest = gap / (exp || 1) > 0.25 ? 'NC' : 'PC';
    r.flags.push(`${gap} of ${exp} outstanding — ${label.toLowerCase()} stands at ${pct(got, exp).toFixed(1)}%.`);
  } else { r.suggest = 'C'; }
  return { r, exp, got, gap, shortDepts };
},
deriveCA(rows, S) {
  const { r, exp, got, gap, shortDepts } = DERIVE._caCore(rows, 'submitted', 'Mark sheets submitted');
  if (gap > 0) {
    r.issue = `${nw(gap)} coursework mark sheet${gap > 1 ? 's' : ''} out of ${exp} modules taught had not been submitted to the respective Heads of Department, representing a compliance level of ${pct(got, exp).toFixed(1)}%. The shortfall is concentrated in the ${listOf(shortDepts.map(x => x.dept))} department(s).`;
    r.rec = 'Heads of Department to obtain the outstanding coursework mark sheets from the module instructors concerned and to institute a signed submission register that is closed at the end of each semester.';
  }
  /* one combined appendix covers every continuous-assessment item */
  const filled = rows.filter(x => has(x.dept));
  if (filled.length && (gap > 0 || filled.some(x => num(x.signed) < num(x.expected) || num(x.uploaded) < num(x.expected) || num(x.standard) < num(x.expected))))
    r.appendix = { title: 'Departmental position on coursework mark sheets',
      cols: ['Department', 'Modules taught', 'Mark sheets submitted', 'In prescribed format', 'Signed by instructor', 'Uploaded to COSIS', 'Submission %'],
      rows: filled.map(x => [x.dept, x.expected, x.submitted, x.standard, x.signed, x.uploaded,
        pct(num(x.submitted), num(x.expected)).toFixed(1) + '%']) };
  return r;
},
deriveCAFormat(rows, S) {
  const { r, exp, got, gap, shortDepts } = DERIVE._caCore(rows, 'standard', 'In prescribed format');
  if (gap > 0) {
    r.issue = `${nw(gap)} coursework mark sheet${gap > 1 ? 's did' : ' did'} not adhere to the prescribed College format, most commonly by omitting one or more assessment components or the computation of totals. Affected departments: ${listOf(shortDepts.map(x => x.dept))}.`;
    r.rec = 'Circulate the standard coursework mark sheet template to all instructors and require Heads of Department to reject mark sheets that do not conform to it.';
  }
  return r;
},
deriveCASigned(rows, S) {
  const { r, exp, got, gap, shortDepts } = DERIVE._caCore(rows, 'signed', 'Signed by instructor');
  if (gap > 0) {
    r.issue = `${nw(gap)} coursework mark sheet${gap > 1 ? 's were' : ' was'} not signed by the module instructor, weakening accountability for the scores awarded. Affected departments: ${listOf(shortDepts.map(x => x.dept))}.`;
    r.rec = 'Heads of Department to return unsigned mark sheets to the instructors concerned for signature, and to verify signatures at the point of receipt.';
  }
  return r;
},
deriveCAUpload(rows, S) {
  const { r, exp, got, gap, shortDepts } = DERIVE._caCore(rows, 'uploaded', 'Uploaded to COSIS');
  if (gap > 0) {
    r.issue = `Coursework scores for ${nw(gap)} module${gap > 1 ? 's' : ''} had not been uploaded to COSIS at the time of the audit (${pct(got, exp).toFixed(1)}% uploaded). Affected departments: ${listOf(shortDepts.map(x => x.dept))}.`;
    r.rec = 'Upload the outstanding coursework scores to COSIS and set a departmental cut-off date for uploading, monitored by the Campus Academic Officer.';
  }
  return r;
},

/* ---- C1 : curriculum validity --------------------------------------- */
deriveCurriculum(rows) {
  const r = empty();
  const filled = rows.filter(x => has(x.prog));
  if (!filled.length) return r;
  const bad = filled.filter(x => x.status === 'Expired');
  const pend = filled.filter(x => x.status === 'Under review' || x.status === 'Submitted to NACTVET' || x.status === 'Awaiting validation');
  r.metrics.push({ label: 'Programmes assessed', value: filled.length });
  r.metrics.push({ label: 'Expired curricula', value: bad.length, flag: bad.length > 0 });
  r.metrics.push({ label: 'Awaiting validation', value: pend.length, flag: pend.length > 0 });
  if (bad.length) {
    r.suggest = 'NC';
    r.flags.push(`${bad.length} programme(s) are being delivered on an expired curriculum.`);
    r.issue = `Expired curricula remain in use for ${nw(bad.length)} programme${bad.length > 1 ? 's' : ''}, namely ${listOf(bad.map(x => x.prog))}. Delivering a programme on an expired curriculum exposes the College to a compliance risk with NACTVET.`;
    r.rec = 'Expedite the review and NACTVET validation of the expired curricula, and place a moratorium on new intakes into affected programmes until validation is confirmed.';
  } else if (pend.length) {
    r.suggest = 'PC';
    r.issue = `${nw(pend.length)} curricul${pend.length > 1 ? 'a are' : 'um is'} under review or awaiting NACTVET validation (${listOf(pend.map(x => x.prog))}); validation had not been confirmed at the time of the audit.`;
    r.rec = 'Follow up with NACTVET to secure validation and report the outcome to the next Quality Assurance Committee meeting.';
  } else { r.suggest = 'C'; }
  if (bad.length || pend.length)
    r.appendix = { title: 'Curriculum validity status',
      cols: ['Programme', 'NTA level', 'Curriculum year', 'Expiry year', 'Status'],
      rows: [...bad, ...pend].map(x => [x.prog, x.nta, x.year, x.expiry, x.status]) };
  return r;
},

/* ---- C3 : instructor workload --------------------------------------- */
deriveWorkload(rows, S) {
  const r = empty();
  const filled = rows.filter(x => has(x.name));
  if (!filled.length) return r;
  const ann = filled.map(x => {
    const tfc = num(x.tfc), tnc = num(x.tnc), nmod = num(x.nmod), tot = tfc + tnc;
    const br = [];
    if (nmod > S.maxModulesLecturer) br.push(`${nmod} modules`);
    if (tfc > S.maxTFC) br.push(`TFC ${tfc} hrs`);
    if (tnc > S.maxTNC) br.push(`TNC ${tnc} hrs`);
    if (tot > S.maxTotalHours) br.push(`total ${tot} hrs`);
    const major = nmod > S.maxModulesLecturer + S.minorModuleVar || tfc > S.maxTFC + S.minorHourVar ||
                  tnc > S.maxTNC + S.minorHourVar || tot > S.maxTotalHours + S.minorHourVar;
    return { ...x, tot, br, major, breach: br.length > 0 };
  });
  const over = ann.filter(x => x.breach).sort((a, b) => b.tot - a.tot);
  const major = over.filter(x => x.major);
  r.metrics.push({ label: 'Instructors assessed', value: filled.length });
  r.metrics.push({ label: 'Exceeding a ceiling', value: over.length, flag: over.length > 0 });
  r.metrics.push({ label: 'Major variation', value: major.length, flag: major.length > 0 });
  if (over.length) {
    r.metrics.push({ label: 'Heaviest total load', value: over[0].tot + ' hrs/week', flag: true });
    r.suggest = major.length ? 'NC' : 'PC';
    r.flags.push(`${over.length} instructor(s) exceed a workload ceiling; ${major.length} constitute a major variation.`);
    r.issue = `${nw(over.length)} instructor${over.length > 1 ? 's' : ''} exceeded the prescribed workload ceilings (maximum ${S.maxModulesLecturer} modules; TFC ${S.maxTFC} hrs/week; TNC ${S.maxTNC} hrs/week; combined ${S.maxTotalHours} hrs/week), of which ${nw(major.length)} constitute${major.length === 1 ? 's' : ''} a major variation. The heaviest load reached ${over[0].tot} hours per week, carried by ${over[0].name} of the ${over[0].dept} Department.`;
    r.rec = `Heads of Department to revise the affected timetables to bring TFC and TNC hours within the prescribed ceilings, and the Timetabling Office to block-flag any draft schedule producing a workload above the ceilings before it is published.`;
    r.appendix = { title: 'Instructors exceeding the prescribed workload ceilings',
      cols: ['#', 'Instructor', 'Department', 'Modules', 'TFC hrs/week', 'TNC hrs/week', 'Total hrs/week', 'Ceiling(s) breached', 'Classification'],
      rows: over.map((x, i) => [i + 1, x.name, x.dept, x.nmod, x.tfc, x.tnc, x.tot, x.br.join('; '), x.major ? 'Major' : 'Minor']) };
  } else { r.suggest = 'C'; }
  return r;
},

/* ---- C5 : LMS uploads ------------------------------------------------ */
deriveLMS(rows, S, ctx) {
  const r = empty(); const p = ctx.probes || {};
  const tot = num(p.instrTotal), up = num(p.instrUpload);
  if (!tot) return r;
  const rate = pct(up, tot);
  r.metrics.push({ label: 'Upload compliance', value: rate.toFixed(0) + '%', flag: rate < S.lmsUploadTarget });
  if (rate < S.lmsUploadTarget) {
    r.suggest = rate < 80 ? 'NC' : 'PC';
    r.flags.push(`Only ${up} of ${tot} instructors (${rate.toFixed(0)}%) uploaded course outlines and assessment plans to Moodle against the ${S.lmsUploadTarget}% target.`);
    r.issue = `Only ${nw(up)} of ${nw(tot)} instructors (${rate.toFixed(0)}%) had uploaded course outlines and assessment plans to the Learning Management System, against the institutional target of ${S.lmsUploadTarget}%.`;
    r.rec = 'Heads of Department to require every instructor to upload the course outline and assessment plan to Moodle in the first week of the semester, and the E-Learning Coordinator to report compliance monthly.';
  } else { r.suggest = 'C'; }
  return r;
},

/* ---- D1 : room readiness -------------------------------------------- */
deriveRooms(rows) {
  const r = empty();
  const filled = rows.filter(x => has(x.room));
  if (!filled.length) return r;
  const noProj  = filled.filter(x => x.proj === 'Absent' || x.proj === 'Faulty');
  const noScr   = filled.filter(x => x.screen === 'Absent' || x.screen === 'Faulty');
  const noHdmi  = filled.filter(x => x.hdmi === 'Absent');
  const noBoard = filled.filter(x => x.board === 'Absent' || x.board === 'Worn');
  const noPa    = filled.filter(x => x.pa === 'Absent' || x.pa === 'Faulty');
  const badPow  = filled.filter(x => x.power && x.power !== 'Adequate');
  const badFan  = filled.filter(x => x.fans && x.fans !== 'Adequate');
  const dirty   = filled.filter(x => x.clean === 'Poor');
  const seatGap = filled.reduce((a, b) => a + Math.max(0, num(b.cap) - num(b.seatsOk)), 0);
  r.metrics.push({ label: 'Rooms inspected', value: filled.length });
  r.metrics.push({ label: 'Without a working projector', value: noProj.length, flag: noProj.length > 0 });
  r.metrics.push({ label: 'Seat shortfall', value: seatGap, flag: seatGap > 0 });
  const parts = [];
  const mk = (arr, what) => { if (arr.length) parts.push(`${nw(arr.length)} room${arr.length > 1 ? 's' : ''} (${listOf(arr.map(x => x.room))}) ${arr.length > 1 ? 'lack' : 'lacks'} ${what}`); };
  mk(noProj, 'a functional projector'); mk(noScr, 'a serviceable projection screen');
  mk(noHdmi, 'an HDMI cable'); mk(noBoard, 'a serviceable whiteboard');
  mk(noPa, 'a functional public address system');
  if (badPow.length) parts.push(`${nw(badPow.length)} room${badPow.length > 1 ? 's have' : ' has'} inadequate or faulty power outlets`);
  if (badFan.length) parts.push(`${nw(badFan.length)} room${badFan.length > 1 ? 's have' : ' has'} inadequate or faulty fans or lighting`);
  if (dirty.length) parts.push(`${nw(dirty.length)} room${dirty.length > 1 ? 's were' : ' was'} found in a poor state of cleanliness`);
  if (seatGap > 0) parts.push(`a shortfall of ${seatGap} serviceable seats across the inspected rooms`);
  if (parts.length) {
    const critical = noProj.length + seatGap;
    r.suggest = critical > 0 ? 'NC' : 'PC';
    r.flags = parts.slice();
    r.issue = `Physical inspection of ${nw(filled.length)} teaching room${filled.length > 1 ? 's' : ''} established that: ` + parts.join('; ') + '.';
    r.rec = 'The Procurement Management Unit and the Estates Unit to procure and install the outstanding equipment and effect the identified repairs before the commencement of the 2026/2027 academic year, and to submit a completion return to the Quality Assurance Unit.';
    r.appendix = { title: 'Room-by-room readiness inspection', cols: ['Room', 'Type', 'Seats req.', 'Seats OK', 'Projector', 'Screen', 'HDMI', 'Whiteboard', 'P/A', 'Power', 'Fans / lighting', 'Cleanliness', 'Remarks'],
      rows: filled.map(x => [x.room, x.type, x.cap, x.seatsOk, x.proj, x.screen, x.hdmi, x.board, x.pa, x.power, x.fans, x.clean, x.remark]) };
  } else { r.suggest = 'C'; }
  return r;
},

/* ---- E1 : library ICT ------------------------------------------------ */
deriveLibICT(rows, S, ctx) {
  const r = empty(); const p = ctx.probes || {};
  const have = num(p.workstations), need = num(p.workstationsReq);
  if (!need) return r;
  const gap = need - have;
  r.metrics.push({ label: 'Workstation gap', value: gap, flag: gap > 0 });
  if (gap > 0) {
    r.suggest = gap / need > 0.3 ? 'NC' : 'PC';
    r.flags.push(`${gap} workstations short of the ${need} required.`);
    r.issue = `The library has ${nw(have)} functional computer workstations against a requirement of ${nw(need)}, a shortfall of ${nw(gap)}${p.libWifi && p.libWifi !== 'Full' ? `, and wireless connectivity within the library is ${String(p.libWifi).toLowerCase()}` : ''}.`;
    r.rec = 'Include the additional workstations in the next procurement plan and extend wireless coverage to all library study areas.';
  } else { r.suggest = 'C'; }
  return r;
},

/* ---- E2 : acquisition against plan ---------------------------------- */
deriveLibAcq(rows) {
  const r = empty();
  const filled = rows.filter(x => has(x.cat));
  if (!filled.length) return r;
  const short = filled.filter(x => num(x.acquired) < num(x.planned));
  const tp = filled.reduce((a, b) => a + num(b.planned), 0);
  const ta = filled.reduce((a, b) => a + num(b.acquired), 0);
  r.metrics.push({ label: 'Plan execution', value: pct(ta, tp).toFixed(0) + '%', flag: ta < tp });
  if (short.length) {
    r.suggest = pct(ta, tp) < 70 ? 'NC' : 'PC';
    r.flags.push(`Acquisition below plan in ${short.length} category/ies (${pct(ta, tp).toFixed(0)}% overall).`);
    r.issue = `Acquisition of learning resources fell below the approved procurement plan, with ${ta} of ${tp} planned items acquired (${pct(ta, tp).toFixed(0)}%). Shortfalls were recorded in ${listOf(short.map(x => x.cat))}.`;
    r.rec = 'The Campus Librarian and the Procurement Management Unit to complete the outstanding acquisitions in the current financial year and to report progress quarterly.';
    r.appendix = { title: 'Acquisition of learning resources against the approved plan',
      cols: ['Resource category', 'Planned', 'Acquired', 'Shortfall', 'Available for use'],
      rows: filled.map(x => [x.cat, x.planned, x.acquired, num(x.planned) - num(x.acquired), x.avail]) };
  } else { r.suggest = 'C'; }
  return r;
},

/* ---- E3 : subscriptions ---------------------------------------------- */
deriveSubs(rows, S, ctx) {
  const r = empty(); const p = ctx.probes || {};
  const tot = num(p.subsTotal), act = num(p.subsActive);
  if (!tot) return r;
  const lapsed = tot - act;
  r.metrics.push({ label: 'Active subscriptions', value: `${act} of ${tot}`, flag: lapsed > 0 });
  if (lapsed > 0) {
    r.suggest = 'NC';
    r.flags.push(`${lapsed} e-resource subscription(s) lapsed or inaccessible.`);
    r.issue = `${nw(lapsed)} of ${nw(tot)} academic e-resource subscriptions were lapsed or inaccessible to users at the time of the audit.`;
    r.rec = 'Renew the lapsed subscriptions and establish a renewal calendar that triggers procurement action at least two months before expiry.';
  } else { r.suggest = 'C'; }
  return r;
},

/* ---- E5 : usage trend ------------------------------------------------ */
deriveUsage(rows) {
  const r = empty();
  const filled = rows.filter(x => has(x.metric));
  if (!filled.length) return r;
  const down = filled.filter(x => num(x.curr) < num(x.prev));
  filled.forEach(x => r.metrics.push({
    label: x.metric, value: `${x.curr} (prev ${x.prev}, ${num(x.prev) ? (pct(num(x.curr) - num(x.prev), num(x.prev))).toFixed(0) : '—'}%)`,
    flag: num(x.curr) < num(x.prev) }));
  if (down.length) {
    r.suggest = 'PC';
    r.flags.push(`${down.length} usage metric(s) declined against the previous period.`);
    r.issue = `Library usage declined against the previous period in ${nw(down.length)} of the metrics monitored, namely ${listOf(down.map(x => `${x.metric} (${x.prev} to ${x.curr})`))}.`;
    r.rec = 'The Campus Librarian to analyse the causes of declining usage and to implement targeted user engagement, including scheduled information literacy sessions for each new cohort.';
    r.appendix = { title: 'Library usage statistics against the previous period',
      cols: ['Metric', 'Previous period', 'Current period', 'Change', 'Remarks'],
      rows: filled.map(x => [x.metric, x.prev, x.curr, num(x.curr) - num(x.prev), x.remark]) };
  } else { r.suggest = 'C'; }
  return r;
},

/* ---- E6 : repository ------------------------------------------------- */
deriveRepo(rows, S, ctx) {
  const r = empty(); const p = ctx.probes || {};
  const exp = num(p.dissExpected), dep = num(p.dissDeposited), ret = num(p.dissRetained);
  if (!exp) return r;
  const gap = exp - dep;
  r.metrics.push({ label: 'Deposited', value: `${dep} of ${exp}`, flag: gap > 0 });
  r.metrics.push({ label: 'Hard copies retained in departments', value: ret, flag: ret > 0 });
  if (gap > 0 || ret > 0) {
    r.suggest = 'NC';
    if (gap > 0) r.flags.push(`${gap} dissertation(s) not deposited in the institutional repository.`);
    if (ret > 0) r.flags.push(`${ret} hard copies still retained in departments.`);
    r.issue = [
      gap > 0 ? `Only ${nw(dep)} of ${nw(exp)} dissertations for the completed academic year had been deposited in the institutional repository, leaving ${nw(gap)} outstanding.` : '',
      ret > 0 ? `${nw(ret)} hard copies were still being retained in the respective departments and had not been transferred to the Library.` : ''
    ].filter(Boolean).join(' ');
    r.rec = 'Heads of Department to submit all outstanding dissertations and hard copies to the Directorate of Library Services for deposit in the institutional repository, and the Directorate to confirm receipt in writing.';
  } else { r.suggest = 'C'; }
  return r;
}
};
