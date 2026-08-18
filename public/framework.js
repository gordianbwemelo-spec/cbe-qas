/* ==========================================================================
   CBE QUALITY AUDIT SYSTEM  —  AUDIT FRAMEWORK DEFINITION
   Quarter 1, Academic Year 2026/2027
   Scope derived from: Internal Memorandum 13 Aug 2026 (QA Activities Plan),
   Schedule & Scope of Quality Audit, and the 4th Quarter audit reports.
   ========================================================================== */

const CAMPUSES = [
  { id: 'DSM',    name: 'Dar es Salaam', full: 'DAR ES SALAAM CAMPUS', auditWindow: '14th – 18th September 2026',
    team: 'Dr. Paul Ondiek, Mr. Laban Msoffe, Ms. Edina Richard' },
  { id: 'Dodoma', name: 'Dodoma',        full: 'DODOMA CAMPUS',        auditWindow: '21st – 25th September 2026',
    team: 'Mr. Laban Msoffe, Dr. Mwanaidi Msuya, Dr. Gordian Bwemelo' },
  { id: 'Mwanza', name: 'Mwanza',        full: 'MWANZA CAMPUS',        auditWindow: '17th – 21st August 2026',
    team: 'Dr. Gordian Bwemelo, Mr. Aloyce Nyamwesa' },
  { id: 'Mbeya',  name: 'Mbeya',         full: 'MBEYA CAMPUS',         auditWindow: '1st – 4th September 2026',
    team: 'Dr. Paul Ondiek, Ms. Edina Richard' }
];

/* Offices that can be assigned a recommendation. Used by the response portal
   to split the issues register into per-office response packs. */
const OFFICES = [
  'Deputy Rector – ARC', 'Director of Academics (DAC)',
  'Director of Academic Support Services (DASS)', 'Campus Director',
  'Campus Academic Officer', 'Examinations Officer', 'Head of Department (HoD)',
  'All Heads of Departments', 'Director of Library Services', 'Campus Librarian',
  'ICT Manager', 'Head of Procurement Management Unit (PMU)',
  'Head of Estates / Maintenance Unit', 'Timetabling Office',
  'Printing Unit In-charge', 'Coordinator – E-Learning',
  'Quality Assurance Coordinator', 'Dean of Students', 'Other (specify)'
];

const SEVERITIES = [
  { id: 'High',   label: 'High — systemic / affects credibility of results or accreditation' },
  { id: 'Medium', label: 'Medium — recurring or affects a department / programme' },
  { id: 'Low',    label: 'Low — isolated, easily corrected' }
];

const STATUSES = [
  { id: 'C',  label: 'Compliant',           cls: 'st-c',  hint: 'Standard fully met — listed in Section 3.0 Areas of Strength' },
  { id: 'PC', label: 'Partially compliant', cls: 'st-pc', hint: 'Standard partly met — reported in Section 4.0 with its extent and affected items' },
  { id: 'NC', label: 'Non-compliant',       cls: 'st-nc', hint: 'Standard not met — reported in Section 4.0 with its extent and affected items' },
  { id: 'NA', label: 'Not applicable',      cls: 'st-na', hint: 'Item does not apply to this campus — justification required' },
  { id: 'NV', label: 'Not verified',        cls: 'st-nv', hint: 'Evidence unavailable — goes to Section 6.0 Limitations' }
];

const IMPL_STATUSES = [
  { id: 'IMP',  label: 'Fully implemented' },
  { id: 'PART', label: 'Partially implemented' },
  { id: 'PROG', label: 'In progress' },
  { id: 'NOT',  label: 'Not implemented' },
  { id: 'SUP',  label: 'Superseded / no longer applicable' }
];

/* Institutional standards referenced by the auto-flagging engine. Editable
   from the Standards screen so the system stays correct if policy changes. */
const DEFAULT_STANDARDS = {
  sampleSizePct:        20,   // minimum % of scripts moderated per module
  maxModulesModerator:  20,   // manageable workload ceiling per moderator
  maxCandidatesSup:     10,   // Master's candidates per supervisor
  maxModulesLecturer:   6,    // modules per lecturer per semester
  maxTFC:               28,   // TFC contact hours per week
  maxTNC:               16,   // TNC contact hours per week
  maxTotalHours:        44,   // combined contact hours per week
  minSamplingPct:       40,   // minimum audit sampling rate
  lmsUploadTarget:      100,  // % instructors uploading outlines to Moodle
  printSurplusPct:      20,   // acceptable examination printing surplus
  minorModuleVar:       1,    // modules above ceiling still counted "minor"
  minorHourVar:         2     // hours above ceiling still counted "minor"
};

/* ==========================================================================
   AUDIT ASPECTS
   Each aspect => items. Each item may carry a structured evidence grid whose
   rows are analysed by a derive() function that auto-flags breaches of the
   standards above and drafts the issue statement for the auditor.
   ========================================================================== */

const FRAMEWORK = [
{
  id: 'A', code: '1',
  noun: 'the credibility of marking, grading and moderation of end of semester II examinations',
  title: 'Credibility of Marking, Grading and Moderation of End of Semester II Examinations',
  short: 'Marking, Grading & Moderation',
  intro: 'Assesses whether Semester II examinations of the 2025/2026 academic year were moderated, marked and graded in accordance with the CBE Examination Regulations, and whether examination materials were properly handled.',
  campuses: 'ALL',
  items: [
    { id:'A1', title:'Moderation coverage of examined modules',
      approach:'Review examination records to confirm that every module examined in Semester II was moderated, and that evidence of moderation is documented and retained.',
      standard:'100% of examined modules must be moderated.',
      evidence:'Post-moderation reports; moderation register; list of modules examined.',
      responsible:'Director of Academic Support Services (DASS)',
      grid:{ id:'g_notmod', title:'Modules not moderated', exceptions:true,
        cols:[
          {k:'code',   label:'Module code',   type:'text',   w:120},
          {k:'name',   label:'Module name',   type:'text',   w:210},
          {k:'nta',    label:'NTA level',     type:'select', options:['4','5','6','7','8','9'], w:90},
          {k:'prog',   label:'Programme',     type:'text',   w:150},
          {k:'dept',   label:'Department',    type:'text',   w:160},
          {k:'cand',   label:'Candidates',    type:'number', w:100},
          {k:'reason', label:'Reason given',  type:'text',   w:200},
          {k:'remark', label:'Remarks',       type:'text',   w:170}
        ], derive:'deriveNotModerated' },
      probes:[
        {k:'modSource', label:'Source of the moderation record', type:'select',
          options:['Post-moderation reports','Moderation register','COSIS extract','Departmental records','Combination'], showIf:'always'}
      ]},

    { id:'A2', title:'Adherence to the minimum 20% script moderation sample size',
      approach:'Verify that moderation adhered to a minimum of 20% sample size selection for script moderation in each module.',
      standard:'Minimum 20% of scripts per module must be moderated.',
      evidence:'Moderation sample sheets; candidate registers.',
      responsible:'Director of Academic Support Services (DASS)',
      grid:{ id:'g_lowsample', title:'Modules moderated below the required sample threshold', exceptions:true,
        cols:[
          {k:'code',    label:'Module code',        type:'text',   w:120},
          {k:'name',    label:'Module name',        type:'text',   w:210},
          {k:'cand',    label:'Candidates',         type:'number', w:110},
          {k:'scripts', label:'Scripts moderated',  type:'number', w:140},
          {k:'modname', label:'Moderator',          type:'text',   w:180},
          {k:'remark',  label:'Remarks',            type:'text',   w:180}
        ], derive:'deriveSample' } },

    { id:'A3', title:'Manageability of moderator workload',
      approach:'Review moderator allocation lists against the acceptable workload ceiling and report moderators carrying excessive numbers of modules.',
      standard:'No moderator should exceed 20 modules per moderation cycle.',
      evidence:'Moderator allocation list; appointment letters.',
      responsible:'Director of Academics (DAC)',
      grid:{ id:'g_modload', title:'Moderators exceeding the module ceiling', exceptions:true,
        cols:[
          {k:'name',   label:'Moderator',                 type:'text',   w:200},
          {k:'inst',   label:'Institution / Department',  type:'text',   w:190},
          {k:'nmod',   label:'Modules moderated',         type:'number', w:150},
          {k:'remark', label:'Remarks',                   type:'text',   w:210}
        ], derive:'deriveModeratorLoad' } },

    { id:'A4', title:'Alignment of moderator qualifications and specialisation with allocated modules',
      approach:"Check moderators' profiles and CVs against the modules allocated; confirm that NTA Level 9 modules were moderated by PhD holders.",
      standard:'Moderator specialisation must match the module; NTA Level 9 modules require a PhD holder.',
      evidence:"Moderators' CVs; module allocation records.",
      responsible:'Director of Academics (DAC)',
      grid:{ id:'g_modqual', title:'Moderator qualification and specialisation exceptions', exceptions:true,
        cols:[
          {k:'name',  label:'Moderator',                type:'text',   w:180},
          {k:'qual',  label:'Highest qualification',    type:'select', options:['Masters','Lecturer by publication','Bachelor','Other'], w:180},
          {k:'spec',  label:'Area of specialisation',   type:'text',   w:180},
          {k:'mods',  label:'Modules allocated',        type:'text',   w:220},
          {k:'nta9',  label:'Moderated NTA 9 modules?', type:'select', options:['Yes','No'], w:160},
          {k:'align', label:'Specialisation aligned?',  type:'select', options:['No','Partly'], w:160},
          {k:'remark',label:'Remarks',                  type:'text',   w:180}
        ], derive:'deriveModeratorQual' } },

    { id:'A5', title:'Signing of mark sheets by internal and external examiners',
      approach:'Verify that all mark sheets were signed by the responsible internal and external examiners on every page.',
      standard:'All mark sheets signed by both internal and external examiners.',
      evidence:'Signed mark sheets (sampled at not less than 40%).',
      responsible:'Head of Department (HoD)',
      grid:{ id:'g_unsigned', title:'Mark sheets not fully signed', exceptions:true,
        cols:[
          {k:'code',    label:'Module code',        type:'text',   w:120},
          {k:'name',    label:'Module name',        type:'text',   w:220},
          {k:'dept',    label:'Department',         type:'text',   w:170},
          {k:'missing', label:'Signature missing',  type:'select', options:['Internal examiner','External examiner','Both'], w:180},
          {k:'remark',  label:'Remarks',            type:'text',   w:200}
        ], derive:'deriveUnsigned' } },

    { id:'A6', title:"Incorporation and uploading of external examiners' scores into COSIS",
      approach:"Compare COSIS records, external examination reports and mark sheets to confirm that all external examiners' scores were incorporated and uploaded.",
      standard:"100% of externally examined modules and students reflected in COSIS.",
      evidence:'COSIS extract; external examiner reports; mark sheets.',
      responsible:'Head of Department (HoD)',
      grid:{ id:'g_ext', title:"Modules with external examiners' scores not incorporated", exceptions:true,
        cols:[
          {k:'code',  label:'Module code',       type:'text',   w:120},
          {k:'name',  label:'Module name',       type:'text',   w:220},
          {k:'dept',  label:'Department',        type:'text',   w:170},
          {k:'nstud', label:'Students affected', type:'number', w:150},
          {k:'inc',   label:'Status',            type:'select', options:['Not incorporated','Partly incorporated'], w:180},
          {k:'remark',label:'Remarks',           type:'text',   w:200}
        ], derive:'deriveExternal' } },

    { id:'A7', title:'Reconciliation of COSIS scores with signed mark sheets',
      approach:'Cross-check COSIS records against signed mark sheets to identify discrepancies in scores or grades.',
      standard:'No variance between the signed mark sheet and the score posted in COSIS.',
      evidence:'COSIS printouts; signed mark sheets.',
      responsible:'Campus Academic Officer',
      grid:{ id:'g_disc', title:'Score discrepancies between mark sheets and COSIS', exceptions:true,
        cols:[
          {k:'code',   label:'Module code',           type:'text',   w:130},
          {k:'reg',    label:'Reg. no.',              type:'text',   w:140},
          {k:'sheet',  label:'Score on mark sheet',   type:'number', w:160},
          {k:'cosis',  label:'Score in COSIS',        type:'number', w:140},
          {k:'nature', label:'Nature of discrepancy', type:'text',   w:230}
        ], derive:'deriveDiscrepancy' } },

    { id:'A8', title:'Handling, custody and hand-over of mark sheets',
      approach:'Verify storage procedures — originals retained by HoDs, one compiled bound copy submitted to the Examinations Office — and that moderated mark sheets were handed over with a signed transmittal note.',
      standard:'Signed transmittal note on hand-over; originals with HoDs; bound copy in the Examinations Office.',
      evidence:'Transmittal notes; custody register; physical verification.',
      responsible:'Examinations Officer',
      probes:[
        {k:'transmittal', label:'Signed transmittal notes in place?', type:'select', options:['Yes','No','Partly'], showIf:'always'},
        {k:'boundCopy',   label:'Compiled bound copy in the Examinations Office?', type:'select', options:['Yes','No'], showIf:'always'},
        {k:'strongRoom',  label:'Dedicated strong room for examination materials?', type:'select', options:['Yes','No','Under construction'], showIf:'always'}
      ]},

    { id:'A9', title:'Discussion and approval of examination results by committees',
      approach:'Review departmental and committee minutes to confirm that Semester II results were discussed and approved at DAEC, CAEC and JAEC.',
      standard:'Results discussed and approved at DAEC, CAEC and JAEC before publication.',
      evidence:'Minutes of DAEC, CAEC and JAEC.',
      responsible:'Campus Academic Officer',
      probes:[
        {k:'daec', label:'DAEC minutes available?', type:'select', options:['Yes','No'], showIf:'always'},
        {k:'caec', label:'CAEC minutes available?', type:'select', options:['Yes','No'], showIf:'always'},
        {k:'jaec', label:'JAEC minutes available?', type:'select', options:['Yes','No'], showIf:'always'}
      ]},

    { id:'A10', title:"Moderators' comments requiring management attention",
      approach:'Identify pressing issues raised by moderators during post-moderation that require management attention.',
      standard:"Moderators' recommendations must be actioned and the action documented.",
      evidence:'Post-moderation reports; departmental action notes.',
      responsible:'Director of Academics (DAC)',
      probes:[{k:'commentSummary', label:"Summary of moderators' recurring comments", type:'textarea', showIf:'always'}]},

    { id:'A11', title:'Record-keeping of printed students results in HoD offices',
      approach:'Verify that printed student examination result records are maintained at departmental level for verification and evidence purposes.',
      standard:'Each department retains printed, signed result records for the semester.',
      evidence:'Physical verification in HoD offices.',
      responsible:'Head of Department (HoD)',
      grid:{ id:'g_norecords', title:'Departments not retaining printed result records', exceptions:true,
        cols:[
          {k:'dept',   label:'Department',            type:'text',   w:230},
          {k:'nature', label:'What was missing',      type:'select', options:['No printed records at all','Records incomplete','Records unsigned','Records not filed'], w:220},
          {k:'remark', label:'Remarks',               type:'text',   w:250}
        ], derive:'deriveNoRecords' } },

    { id:'A12', title:'Other anomalies in the handling of examination materials',
      approach:'Identify any anomalies related to examination booklets, mark sheets, attendance records, result records, printing and photocopying registers, and custody arrangements.',
      standard:'Examination materials handled under documented controls at every stage.',
      evidence:'Printing register; attendance records; custody register.',
      responsible:'Examinations Officer',
      probes:[
        {k:'printRegister', label:'Printing register captures module, assessment type, pages and copies?', type:'select', options:['Yes','No','Partly'], showIf:'always'}
      ],
      grid:{ id:'g_examanom', title:'Anomalies in the handling of examination materials', exceptions:true,
        cols:[
          {k:'area',   label:'Area',    type:'select', options:['Examination booklets','Mark sheets','Attendance records','Result records','Printing / photocopying','Custody and storage','Other'], w:200},
          {k:'detail', label:'Anomaly observed', type:'text', w:340},
          {k:'remark', label:'Remarks', type:'text', w:200}
        ], derive:'deriveExamAnomaly' } }
  ]
},

{
  id: 'B', code: '2',
  noun: 'the credibility of continuous assessment',
  title: 'Credibility of Continuous Assessment for Semester II',
  short: 'Continuous Assessment',
  intro: 'Assesses whether continuous assessment for Semester II was administered, recorded, signed and posted in accordance with College requirements.',
  campuses: 'ALL',
  items: [
    { id:'B1', title:'Submission of coursework mark sheets to Heads of Department',
      approach:'Verify that all coursework mark sheets for Semester II were submitted to the respective HoDs.',
      standard:'100% of coursework mark sheets submitted to HoDs.',
      evidence:'Departmental submission registers; mark sheet files.',
      responsible:'Head of Department (HoD)',
      grid:{ id:'g_ca_sub', title:'Coursework mark sheets not submitted', exceptions:true,
        cols:[
          {k:'code',  label:'Module code', type:'text', w:120},
          {k:'name',  label:'Module name', type:'text', w:220},
          {k:'dept',  label:'Department',  type:'text', w:180},
          {k:'instr', label:'Instructor',  type:'text', w:180},
          {k:'remark',label:'Remarks',     type:'text', w:200}
        ], derive:'deriveCASub' } },

    { id:'B2', title:'Adherence of coursework mark sheets to the standard format',
      approach:'Verify that mark sheets were complete and adhered to the recommended format, showing all assessment components and totals.',
      standard:'All mark sheets in the prescribed College format.',
      evidence:'Sampled coursework mark sheets.',
      responsible:'Head of Department (HoD)',
      grid:{ id:'g_ca_fmt', title:'Coursework mark sheets not in the prescribed format', exceptions:true,
        cols:[
          {k:'code',    label:'Module code', type:'text', w:120},
          {k:'name',    label:'Module name', type:'text', w:220},
          {k:'dept',    label:'Department',  type:'text', w:180},
          {k:'missing', label:'What was omitted', type:'select', options:['Assessment components','Computation of totals','Candidate details','Signature block','Other'], w:200},
          {k:'remark',  label:'Remarks',     type:'text', w:200}
        ], derive:'deriveCAFormat' } },

    { id:'B3', title:'Signing of coursework mark sheets by module instructors',
      approach:'Verify that module instructors signed the coursework mark sheets.',
      standard:'All coursework mark sheets signed by the module instructor.',
      evidence:'Sampled coursework mark sheets.',
      responsible:'Head of Department (HoD)',
      grid:{ id:'g_ca_sign', title:'Coursework mark sheets not signed by the instructor', exceptions:true,
        cols:[
          {k:'code',  label:'Module code', type:'text', w:120},
          {k:'name',  label:'Module name', type:'text', w:220},
          {k:'dept',  label:'Department',  type:'text', w:180},
          {k:'instr', label:'Instructor',  type:'text', w:180},
          {k:'remark',label:'Remarks',     type:'text', w:200}
        ], derive:'deriveCASigned' } },

    { id:'B4', title:'Uploading of coursework scores to COSIS',
      approach:'Identify instances where coursework scores have not been uploaded to COSIS.',
      standard:'All coursework scores uploaded to COSIS before the examination board.',
      evidence:'COSIS extract; departmental records.',
      responsible:'Campus Academic Officer',
      grid:{ id:'g_ca_upl', title:'Coursework scores not uploaded to COSIS', exceptions:true,
        cols:[
          {k:'code',  label:'Module code',       type:'text',   w:120},
          {k:'name',  label:'Module name',       type:'text',   w:220},
          {k:'dept',  label:'Department',        type:'text',   w:180},
          {k:'nstud', label:'Students affected', type:'number', w:150},
          {k:'remark',label:'Remarks',           type:'text',   w:200}
        ], derive:'deriveCAUpload' } },

    { id:'B5', title:'Completeness of continuous assessment components',
      approach:'Verify that all prescribed CA components (individual assignment, group assignment, Test 1 and Test 2) were administered and scored.',
      standard:'All four prescribed CA components administered and scored for every module.',
      evidence:'Coursework mark sheets; assessment plans.',
      responsible:'Head of Department (HoD)',
      grid:{ id:'g_ca_comp', title:'Modules with continuous assessment components missing', exceptions:true,
        cols:[
          {k:'code',    label:'Module code', type:'text', w:120},
          {k:'name',    label:'Module name', type:'text', w:220},
          {k:'dept',    label:'Department',  type:'text', w:180},
          {k:'missing', label:'Component missing', type:'select', options:['Individual assignment','Group assignment','Test 1','Test 2','More than one component'], w:220},
          {k:'remark',  label:'Remarks',     type:'text', w:200}
        ], derive:'deriveCAComponents' } },

    { id:'B6', title:'Alignment of coursework scores on mark sheets and COSIS',
      approach:'Identify discrepancies between the coursework scores on mark sheets and those recorded in COSIS.',
      standard:'No variance between mark sheet and COSIS coursework scores.',
      evidence:'COSIS extract; signed mark sheets.',
      responsible:'Campus Academic Officer',
      grid:{ id:'g_ca_var', title:'Coursework score variances between mark sheet and COSIS', exceptions:true,
        cols:[
          {k:'code',   label:'Module code',         type:'text',   w:130},
          {k:'reg',    label:'Reg. no.',            type:'text',   w:140},
          {k:'sheet',  label:'Score on mark sheet', type:'number', w:160},
          {k:'cosis',  label:'Score in COSIS',      type:'number', w:140},
          {k:'nature', label:'Nature of variance',  type:'text',   w:230}
        ], derive:'deriveCAVariance' } },

    { id:'B7', title:'Other coursework anomalies',
      approach:'Identify anomalies such as identical scores across candidates, negative or out-of-range scores, unusually high failure rates, or missing candidates.',
      standard:'Coursework scores must be individually determined and within range.',
      evidence:'COSIS analytics; mark sheets.',
      responsible:'Head of Department (HoD)',
      grid:{ id:'g_ca_anom', title:'Other coursework anomalies', exceptions:true,
        cols:[
          {k:'code',   label:'Module / department', type:'text', w:200},
          {k:'type',   label:'Anomaly', type:'select', options:['Identical scores across candidates','Negative or out-of-range scores','Unusually high failure rate','Missing candidates on mark sheet','Scores altered without countersignature','Other'], w:250},
          {k:'detail', label:'Detail',  type:'text', w:280},
          {k:'remark', label:'Remarks', type:'text', w:180}
        ], derive:'deriveCAAnomaly' } }
  ]
},

{
  id: 'C', code: '3',
  noun: 'the validity of curriculum implementation',
  title: 'Validity of Curriculum Implementation',
  short: 'Curriculum Implementation',
  intro: 'Assesses whether the curricula in use are valid and current, whether all prescribed modules are delivered, and whether teaching allocation complies with the workload policy.',
  campuses: 'ALL',
  items: [
    { id:'C1', title:'Validity of curricula in use',
      approach:'Verify that the curricula in use for all programmes are current and not expired, and confirm NACTVET validation status.',
      standard:'No expired curriculum may be in use; all curricula validated by NACTVET.',
      evidence:'Curriculum documents; NACTVET validation certificates.',
      responsible:'Director of Academics (DAC)',
      grid:{ id:'g_curr', title:'Programmes with expired or unvalidated curricula', exceptions:true,
        cols:[
          {k:'prog',   label:'Programme',       type:'text',   w:250},
          {k:'nta',    label:'NTA level',       type:'select', options:['4','5','6','7','8','9'], w:100},
          {k:'year',   label:'Curriculum year', type:'text',   w:140},
          {k:'expiry', label:'Expiry year',     type:'text',   w:130},
          {k:'status', label:'Status',          type:'select', options:['Expired','Under review','Submitted to NACTVET','Awaiting validation'], w:190},
          {k:'remark', label:'Remarks',         type:'text',   w:200}
        ], derive:'deriveCurriculum' } },

    { id:'C2', title:'Delivery of all modules prescribed in the approved curriculum',
      approach:'Review teaching records and semester implementation reports against approved curricula and timetables to confirm that all modules were delivered within the approved schedule.',
      standard:'All modules in the approved curriculum delivered in the prescribed semester.',
      evidence:'Semester implementation reports; timetables; attendance registers.',
      responsible:'Head of Department (HoD)',
      grid:{ id:'g_notdeliv', title:'Modules not delivered as approved', exceptions:true,
        cols:[
          {k:'code',   label:'Module code', type:'text',   w:120},
          {k:'name',   label:'Module name', type:'text',   w:220},
          {k:'prog',   label:'Programme',   type:'text',   w:180},
          {k:'dept',   label:'Department',  type:'text',   w:170},
          {k:'nature', label:'What happened', type:'select', options:['Not delivered','Partially delivered','Compressed','Taught out of sequence'], w:190},
          {k:'remark', label:'Remarks',     type:'text',   w:200}
        ], derive:'deriveDelivery' } },

    { id:'C3', title:'Compliance of instructor teaching load with the workload policy',
      approach:'Review individual instructor timetables against the workload policy and identify lecturers exceeding the prescribed ceilings.',
      standard:'Maximum 6 modules; TFC 28 hrs/week; TNC 16 hrs/week; combined 44 hrs/week.',
      evidence:'Workload allocation report; published timetables.',
      responsible:'Timetabling Office',
      grid:{ id:'g_wl', title:'Instructors exceeding the workload ceilings', exceptions:true,
        cols:[
          {k:'name',  label:'Instructor',   type:'text',   w:200},
          {k:'dept',  label:'Department',   type:'text',   w:180},
          {k:'nmod',  label:'Modules',      type:'number', w:110},
          {k:'tfc',   label:'TFC hrs/week', type:'number', w:140},
          {k:'tnc',   label:'TNC hrs/week', type:'number', w:140},
          {k:'remark',label:'Remarks',      type:'text',   w:200}
        ], derive:'deriveWorkload' } },

    { id:'C4', title:'Alignment of instructor specialisation with allocated modules',
      approach:"Verify that instructors' specialisations align with the modules allocated, using transcripts and staff qualification lists.",
      standard:'Every module allocated to an instructor qualified in that field.',
      evidence:'Staff qualification list; transcripts; module allocation records.',
      responsible:'Head of Department (HoD)',
      grid:{ id:'g_alloc', title:'Module allocations not aligned with instructor specialisation', exceptions:true,
        cols:[
          {k:'code',  label:'Module code', type:'text', w:120},
          {k:'name',  label:'Module name', type:'text', w:220},
          {k:'instr', label:'Instructor',  type:'text', w:190},
          {k:'spec',  label:"Instructor's specialisation", type:'text', w:210},
          {k:'dept',  label:'Department',  type:'text', w:170},
          {k:'remark',label:'Remarks',     type:'text', w:190}
        ], derive:'deriveAllocation' } },

    { id:'C5', title:'Uploading of course outlines and assessment plans to the LMS (Moodle)',
      approach:'Check the Moodle report to determine which instructors have not uploaded course outlines and assessment plans.',
      standard:'100% of instructors upload course outlines and assessment plans.',
      evidence:'Moodle activity report.',
      responsible:'Coordinator – E-Learning',
      grid:{ id:'g_lms', title:'Instructors who did not upload to the LMS', exceptions:true,
        cols:[
          {k:'name',    label:'Instructor',  type:'text',   w:200},
          {k:'dept',    label:'Department',  type:'text',   w:190},
          {k:'missing', label:'Not uploaded', type:'select', options:['Course outline','Assessment plan','Both'], w:190},
          {k:'remark',  label:'Remarks',     type:'text',   w:220}
        ], derive:'deriveLMS' } },

    { id:'C6', title:'Module content overlap and naming consistency',
      approach:'Compare module content and names across programmes and intakes to identify duplication or inconsistent naming.',
      standard:'Module names and content consistent across programmes and intakes.',
      evidence:'Curriculum documents; module outlines.',
      responsible:'Director of Academics (DAC)',
      grid:{ id:'g_overlap', title:'Modules with overlapping content or inconsistent naming', exceptions:true,
        cols:[
          {k:'code',   label:'Module code', type:'text', w:120},
          {k:'name',   label:'Module name', type:'text', w:220},
          {k:'prog',   label:'Programme(s)', type:'text', w:200},
          {k:'nature', label:'Nature',      type:'select', options:['Content overlap','Inconsistent naming','Duplicated module'], w:180},
          {k:'detail', label:'Detail',      type:'text', w:250}
        ], derive:'deriveOverlap' } },

    { id:'C7', title:'Other curriculum implementation issues',
      approach:'Identify other anomalies such as compressed teaching schedules, unapproved substitutions, or inadequate practical/field components.',
      standard:'Curriculum delivered as approved, without unapproved variation.',
      evidence:'Teaching records; interviews with HoDs and students.',
      responsible:'Director of Academics (DAC)' }
  ]
},

{
  id: 'D', code: '4',
  noun: 'the readiness of infrastructure and facilities for the academic year',
  title: 'Readiness of Infrastructure and Facilities for the 2026/2027 Academic Year',
  short: 'Infrastructure Readiness',
  intro: 'Assesses whether teaching and learning infrastructure, facilities and support systems are ready before the commencement of the 2026/2027 academic year.',
  campuses: 'ALL',
  items: [
    { id:'D1', title:'Classroom teaching and learning resources',
      approach:'Physically verify the availability and functionality of projectors, projection screens, HDMI cables, whiteboards and public address systems in every teaching room.',
      standard:'Every teaching room equipped with a functional projector, screen, whiteboard and, where applicable, a P/A system.',
      evidence:'Physical inspection; asset register.',
      responsible:'Head of Estates / Maintenance Unit',
      grid:{ id:'g_rooms', title:'Rooms not ready for teaching', exceptions:true,
        cols:[
          {k:'room',   label:'Room / facility', type:'text',   w:150},
          {k:'type',   label:'Type',            type:'select', options:['Classroom','Lecture theatre','Laboratory','Workshop','Library space','Office','Other'], w:150},
          {k:'cap',    label:'Seats required',  type:'number', w:130},
          {k:'seatsOk',label:'Seats serviceable',type:'number',w:150},
          {k:'proj',   label:'Projector',       type:'select', options:['Faulty','Absent'], w:120},
          {k:'screen', label:'Screen',          type:'select', options:['Faulty','Absent'], w:110},
          {k:'hdmi',   label:'HDMI cable',      type:'select', options:['Absent'], w:120},
          {k:'board',  label:'Whiteboard',      type:'select', options:['Worn','Absent'], w:120},
          {k:'pa',     label:'P/A system',      type:'select', options:['Faulty','Absent'], w:130},
          {k:'power',  label:'Power / sockets', type:'select', options:['Inadequate','Faulty'], w:140},
          {k:'fans',   label:'Fans / lighting', type:'select', options:['Inadequate','Faulty'], w:140},
          {k:'clean',  label:'Cleanliness',     type:'select', options:['Fair','Poor'], w:120},
          {k:'remark', label:'Remarks',         type:'text',   w:200}
        ], derive:'deriveRooms' } },

    { id:'D2', title:'Campus safety, cleanliness and sanitation',
      approach:'Inspect toilets, the sewage system, walkways, lighting, fire safety equipment and waste management; identify issues requiring intervention before the academic year begins.',
      standard:'Campus safe, clean and sanitary at the commencement of the academic year.',
      evidence:'Physical inspection; maintenance logs.',
      responsible:'Head of Estates / Maintenance Unit',
      grid:{ id:'g_safety', title:'Safety, cleanliness and sanitation deficiencies', exceptions:true,
        cols:[
          {k:'area',     label:'Area', type:'select', options:['Toilets / washrooms','Sewage system','Water supply','Walkways and corridors','External lighting','Fire safety equipment','Waste management','Security / fencing','Drainage','Other'], w:210},
          {k:'location', label:'Location', type:'text', w:190},
          {k:'detail',   label:'Deficiency observed', type:'text', w:320},
          {k:'remark',   label:'Remarks', type:'text', w:190}
        ], derive:'deriveSafety' } },

    { id:'D3', title:'Maintenance and repairs required before the academic year',
      approach:'Identify floors, ceilings, seats, ceiling fans, doors, windows and corridors requiring maintenance or repair.',
      standard:'All identified defects rectified before the academic year commences.',
      evidence:'Physical inspection; outstanding works schedule.',
      responsible:'Head of Estates / Maintenance Unit',
      grid:{ id:'g_works', title:'Maintenance and repairs outstanding', exceptions:true,
        cols:[
          {k:'item',   label:'Item / location', type:'text',   w:210},
          {k:'nature', label:'Work required',   type:'text',   w:300},
          {k:'qty',    label:'Quantity',        type:'number', w:120},
          {k:'budget', label:'Budgeted?',       type:'select', options:['Yes','No','Partly','Unknown'], w:150},
          {k:'remark', label:'Remarks',         type:'text',   w:190}
        ], derive:'deriveWorks' } },

    { id:'D4', title:'ICT infrastructure, internet connectivity and e-learning platform readiness',
      approach:'Verify that the LMS, servers, campus network and internet bandwidth are operational and adequate for the incoming cohort.',
      standard:'LMS and network operational and sized to demand at the start of the academic year.',
      evidence:'ICT status report; bandwidth records; LMS availability logs.',
      responsible:'ICT Manager',
      probes:[
        {k:'lmsUp',      label:'LMS operational and accessible?', type:'select', options:['Yes','No','Intermittent'], showIf:'always'},
        {k:'wifiCover',  label:'Wireless coverage of teaching and study areas', type:'select', options:['Full','Partial','Minimal','None'], showIf:'always'},
        {k:'biometric',  label:'Classroom biometric attendance system status', type:'select', options:['Operational','Piloting','Procured not installed','Not implemented'], showIf:'always'}
      ]},

    { id:'D5', title:'Student accommodation, catering and welfare facilities',
      approach:'Inspect hostels, cafeteria, sports and health facilities for readiness and capacity against expected enrolment.',
      standard:'Welfare facilities functional and sized to expected enrolment.',
      evidence:'Physical inspection; enrolment projections.',
      responsible:'Dean of Students',
      campuses:'ALL',
      grid:{ id:'g_welfare', title:'Welfare facility gaps', exceptions:true,
        cols:[
          {k:'facility', label:'Facility', type:'select', options:['Hostels','Cafeteria','Sports facilities','Health facility','Counselling space','Water and sanitation','Other'], w:190},
          {k:'gap',      label:'Gap identified', type:'text', w:330},
          {k:'qty',      label:'Shortfall (number)', type:'number', w:170},
          {k:'remark',   label:'Remarks', type:'text', w:190}
        ], derive:'deriveWelfare' } },

    { id:'D6', title:'Staffing readiness of academic and support units',
      approach:'Verify that teaching and support units are staffed to the establishment required for the incoming academic year.',
      standard:'No teaching unit begins the academic year with a critical staffing gap.',
      evidence:'Staff establishment returns; recruitment records.',
      responsible:'Campus Director',
      grid:{ id:'g_staff', title:'Units with staffing gaps', exceptions:true,
        cols:[
          {k:'unit',   label:'Unit / department', type:'text',   w:220},
          {k:'cadre',  label:'Cadre required',    type:'text',   w:200},
          {k:'nreq',   label:'Number required',   type:'number', w:160},
          {k:'remark', label:'Remarks',           type:'text',   w:230}
        ], derive:'deriveStaff' } },

    { id:'D7', title:'Other infrastructure and facility deficiencies',
      approach:'Record any further deficiency observed that would impair the commencement of teaching.',
      standard:'Campus fully ready for the commencement of teaching.',
      evidence:'Physical inspection.',
      responsible:'Campus Director' }
  ]
},

{
  id: 'E', code: '5',
  noun: 'library services',
  title: 'Library Services',
  short: 'Library Services',
  intro: 'Assesses the adequacy of library ICT infrastructure, learning resources, e-resource subscriptions, information literacy training and usage.',
  campuses: 'ALL',
  items: [
    { id:'E1', title:'ICT infrastructure supporting digital learning and research',
      approach:'Inspect physical ICT facilities in the library; verify computer workstations, internet connectivity and bandwidth against user demand.',
      standard:'Workstations and connectivity adequate for the registered user population.',
      evidence:'Physical inspection; asset register; bandwidth records.',
      responsible:'Campus Librarian',
      grid:{ id:'g_libict', title:'Library ICT deficiencies', exceptions:true,
        cols:[
          {k:'item',   label:'Item', type:'select', options:['Computer workstations','Internet bandwidth','Wireless coverage','Printers / scanners','Power backup','Other'], w:200},
          {k:'detail', label:'Deficiency observed', type:'text', w:320},
          {k:'qty',    label:'Number short / affected', type:'number', w:190},
          {k:'remark', label:'Remarks', type:'text', w:190}
        ], derive:'deriveLibICT' } },

    { id:'E2', title:'Acquisition of learning resources',
      approach:'Compare procurement records against the approved procurement plan; identify categories where planned acquisitions were not delivered or are not available for use.',
      standard:'Acquisitions executed in line with the approved procurement plan.',
      evidence:'Procurement plan; delivery notes; accession register.',
      responsible:'Campus Librarian',
      grid:{ id:'g_lib', title:'Learning resources not acquired as planned', exceptions:true,
        cols:[
          {k:'cat',    label:'Resource category', type:'select', options:['Textbooks','Reference materials','E-books','Digital journals','Databases','Periodicals','Other'], w:200},
          {k:'nshort', label:'Quantity short',    type:'number', w:160},
          {k:'avail',  label:'Available for use?',type:'select', options:['No','Partly'], w:170},
          {k:'remark', label:'Remarks',           type:'text',   w:250}
        ], derive:'deriveLibAcq' } },

    { id:'E3', title:'Subscriptions to academic e-resources',
      approach:'Review subscription agreements and payment records; identify subscriptions that have lapsed or are inaccessible to users.',
      standard:'Subscriptions current, paid and accessible to users.',
      evidence:'Subscription agreements; payment vouchers; access tests.',
      responsible:'Director of Library Services',
      grid:{ id:'g_subs', title:'Lapsed or inaccessible e-resource subscriptions', exceptions:true,
        cols:[
          {k:'name',     label:'Subscription / database', type:'text', w:240},
          {k:'provider', label:'Provider', type:'text', w:180},
          {k:'status',   label:'Status',   type:'select', options:['Lapsed','Payment outstanding','Inaccessible'], w:190},
          {k:'expiry',   label:'Expiry date', type:'text', w:150},
          {k:'remark',   label:'Remarks',  type:'text', w:200}
        ], derive:'deriveSubs' } },

    { id:'E4', title:'Information literacy training',
      approach:'Review training schedules and attendance records; identify cohorts or staff groups that did not receive information literacy training.',
      standard:'Information literacy training delivered each academic year to students and staff.',
      evidence:'Training schedule; attendance registers.',
      responsible:'Campus Librarian',
      grid:{ id:'g_lit', title:'Groups that did not receive information literacy training', exceptions:true,
        cols:[
          {k:'group',  label:'Cohort / staff group', type:'text', w:250},
          {k:'reason', label:'Reason given', type:'text', w:280},
          {k:'remark', label:'Remarks', type:'text', w:220}
        ], derive:'deriveLiteracy' } },

    { id:'E5', title:'Library usage statistics',
      approach:'Analyse usage data — book check-outs, database logins and physical attendance — and record any metric that declined against the previous period.',
      standard:'Usage monitored, reported and trending against previous periods.',
      evidence:'Circulation system reports; gate counts; database analytics.',
      responsible:'Campus Librarian',
      grid:{ id:'g_usage', title:'Usage metrics that declined against the previous period', exceptions:true,
        cols:[
          {k:'metric', label:'Metric', type:'select', options:['Physical attendance','Book check-outs','Database logins','E-book downloads','Reference queries','Other'], w:200},
          {k:'prev',   label:'Previous period', type:'number', w:160},
          {k:'curr',   label:'Current period',  type:'number', w:160},
          {k:'remark', label:'Remarks',         type:'text',   w:250}
        ], derive:'deriveUsage' } },

    { id:'E6', title:'Deposit of dissertations and research outputs in the institutional repository',
      approach:'Reconcile dissertations deposited in the College repository against graduating cohorts; identify departments with outstanding deposits.',
      standard:'All dissertations of the completed academic year deposited in the repository.',
      evidence:'Repository record; departmental submission registers.',
      responsible:'Director of Library Services',
      grid:{ id:'g_repo', title:'Dissertations not deposited in the institutional repository', exceptions:true,
        cols:[
          {k:'dept',     label:'Department', type:'text', w:200},
          {k:'prog',     label:'Programme',  type:'text', w:200},
          {k:'ncount',   label:'Number outstanding', type:'number', w:170},
          {k:'location', label:'Where currently held', type:'select', options:['Retained in department','Not submitted by candidate','Unknown'], w:220},
          {k:'remark',   label:'Remarks', type:'text', w:190}
        ], derive:'deriveRepo' } },

    { id:'E7', title:'Other library deficiencies',
      approach:'Identify shortfalls such as malfunctioning equipment, inadequate user support, non-compliance with the opening and closing schedule, or staff shortage.',
      standard:'Library operates to the published schedule with adequate staffing and functional equipment.',
      evidence:'Physical inspection; staff establishment; user interviews.',
      responsible:'Campus Librarian',
      grid:{ id:'g_libgap', title:'Other library deficiencies', exceptions:true,
        cols:[
          {k:'area',   label:'Area', type:'select', options:['Malfunctioning equipment','Inadequate user support','Opening hours not observed','Staff shortage','Inadequate study space','Poor lighting or ventilation','Weak wireless coverage','Other'], w:230},
          {k:'detail', label:'Deficiency observed', type:'text', w:330},
          {k:'remark', label:'Remarks', type:'text', w:200}
        ], derive:'deriveLibGap' } }
  ]
},
{
  id: 'F', code: '6',
  noun: 'the implementation of the fourth quarter audit recommendations',
  title: 'Implementation of Fourth Quarter Audit Recommendations',
  short: 'Follow-up on 4th Quarter',
  intro: 'Establishes the implementation status of each recommendation issued in the Fourth Quarter audit of the 2025/2026 academic year, based on institutional records, management circulars, departmental progress reports and physical verification.',
  campuses: 'ALL',
  followUp: true,
  items: []
}
];

/* Cross-cutting checks appended to every campus report regardless of aspect. */
const GENERAL_QUESTIONS = [
  {k:'entranceDate',  label:'Date of entrance meeting', type:'date'},
  {k:'exitDate',      label:'Date of exit meeting', type:'date'},
  {k:'entranceAttend',label:'Entrance meeting attendance (names and designations)', type:'textarea'},
  {k:'docAccess',     label:'Was the audit team granted timely access to all requested documents and systems?', type:'select', options:['Yes','Partly','No']},
  {k:'accessLimits',  label:'Documents, records or systems that could not be accessed (and effect on the audit)', type:'textarea'},
  {k:'samplingBasis', label:'Sampling basis applied', type:'textarea',
    def:'Where full verification was not feasible, a sample of not less than 40% of the target population was drawn.'},
  {k:'campusStrengths', label:'Notable good practice observed at this campus', type:'textarea'}
];
