/* College reference data shared by the sign-in screen and the seeding script. */

const CAMPUSES = [
  { id: 'DSM',    name: 'Dar es Salaam', auditWindow: '14th – 18th September 2026' },
  { id: 'Dodoma', name: 'Dodoma',        auditWindow: '21st – 25th September 2026' },
  { id: 'Mwanza', name: 'Mwanza',        auditWindow: '17th – 21st August 2026' },
  { id: 'Mbeya',  name: 'Mbeya',         auditWindow: '1st – 4th September 2026' }
];

const OFFICES = [
  'Deputy Rector – ARC', 'Director of Academics (DAC)',
  'Director of Academic Support Services (DASS)', 'Campus Director',
  'Campus Academic Officer', 'Examinations Officer', 'Head of Department (HoD)',
  'All Heads of Departments', 'Director of Library Services', 'Campus Librarian',
  'ICT Manager', 'Head of Procurement Management Unit (PMU)',
  'Head of Estates / Maintenance Unit', 'Timetabling Office',
  'Printing Unit In-charge', 'Coordinator – E-Learning',
  'Quality Assurance Coordinator', 'Dean of Students'
];

/* Everyone who may sign in. The browser sends back only a key from this list,
   and the server resolves the role from here — it never trusts the browser to
   say what role it should have. */
function identityList() {
  return [
    { key: 'mgr', role: 'qa_manager', label: 'Quality Assurance Manager',
      note: 'Full control — every campus, issuing reports, administration' },
    ...CAMPUSES.map(c => ({ key: 'aud:' + c.id, role: 'auditor', campus: c.id,
      label: c.name + ' Campus audit team', note: c.auditWindow })),
    ...OFFICES.map(o => ({ key: 'off:' + o, role: 'office', office: o,
      label: o, note: 'Answer the issues addressed to this office' })),
    { key: 'view', role: 'viewer', label: 'Management (read only)',
      note: 'View reports without editing' }
  ];
}

module.exports = { CAMPUSES, OFFICES, identityList };
