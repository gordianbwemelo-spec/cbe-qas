/* Default access codes created the first time the database is initialised.
   The Quality Assurance Manager can add, rename or deactivate codes from the
   Access codes screen once the system is running.

   Set QA_MANAGER_CODE in the Render environment to choose your own manager
   code; otherwise a random one is generated and printed in the deploy log. */

const CAMPUSES = [
  ['DSM', 'Dar es Salaam'], ['Dodoma', 'Dodoma'], ['Mwanza', 'Mwanza'], ['Mbeya', 'Mbeya']
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

/* A short, readable slug from a label: "Director of Academics (DAC)" -> "DAC" */
function slug(label) {
  const inParens = label.match(/\(([A-Za-z/ ]{2,12})\)/);
  if (inParens) return inParens[1].replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 6);
  const words = label.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(w =>
    w.length > 2 && !/^(of|the|and|for|to|in)$/i.test(w));
  return words.map(w => w[0]).join('').toUpperCase().slice(0, 6) || 'OFF';
}

function rand(n) {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';   // no 0/O/1/I
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

module.exports = function seedCodes(managerCode) {
  const out = [];
  out.push({
    code: (managerCode || `CBE-QAM-${rand(5)}`).toUpperCase(),
    role: 'qa_manager', label: 'Quality Assurance Manager — full control'
  });
  CAMPUSES.forEach(([id, name]) => out.push({
    code: `CBE-AUD-${id.toUpperCase()}-${rand(4)}`,
    role: 'auditor', campus: id, label: `Audit team — ${name} Campus`
  }));
  const used = new Set();
  OFFICES.forEach(o => {
    let s = slug(o), n = 1;
    while (used.has(s)) s = slug(o) + (++n);
    used.add(s);
    out.push({ code: `CBE-${s}-${rand(4)}`, role: 'office', office: o, label: o });
  });
  out.push({ code: `CBE-VIEW-${rand(5)}`, role: 'viewer', label: 'Read-only viewer (Management)' });
  return out;
};
