# CBE Quality Audit System

Academic quality audit capture, reporting and management responses for the
**College of Business Education** — Quality Assurance Unit.

Everything happens inside the system: the audit team records findings on any
device, the evidence is analysed against the College's standards as it is
entered, the report is generated in the College's own format, and the
responsible offices sign in and record their responses directly. No files are
passed around and nothing has to be merged by hand.

---

## What it does

| | |
|---|---|
| **Six audit aspects** | Marking, grading and moderation of Semester II examinations · Continuous assessment · Validity of curriculum implementation · Readiness of infrastructure and facilities · Library services · Implementation of the Fourth Quarter recommendations |
| **Logical branching** | The campus decides which items and which carried-forward recommendations load. The conclusion recorded against an item decides which fields appear and which section of the report it lands in. |
| **Exceptions-only evidence sheets** | Every sheet records **only what failed** — modules not moderated, modules below the sample threshold, moderators over the ceiling, mark sheets unsigned, instructors over the workload limit, rooms not ready, expired curricula, lapsed subscriptions. Nothing that met the standard is typed in. Type, paste from Excel, or import CSV. |
| **Automatic analysis** | Breaches of the institutional standards are flagged as the evidence is entered, and the issue statement and recommendation are drafted in the language of previous reports. |
| **Report generation** | Cover page, Sections 1.0–7.0, appendices built from the evidence sheets, exported to Word, PDF and Excel. Section 3.0 lists the areas of strength; Section 4.0 carries only issues, each with its extent and its affected items named one by one. |
| **Management responses** | Each responsible office clicks its own card, sees only its own issues, and records its response. It appears in the report immediately. |
| **Consolidation** | A College-wide report comparing all four campuses and identifying issues that recur at more than one. |
| **Administration** | Access codes, activity log, and one-click backup and restore of the whole database. |

## Signing in

Everyone uses the same link and clicks their own card — four campus audit teams,
eighteen responsible offices, Management. They type their name so entries are
attributed, and go straight in. No codes to issue or remember.

A PIN can be switched on per role at any time by setting `access_codes.pin` for
that role; the sign-in screen then asks for it, for that role only.

## Roles

| Role | Can do |
|---|---|
| **Quality Assurance Manager** | Everything: any campus, issue and reopen reports, manage access codes, consolidate, back up |
| **Auditor** | Record findings for the one campus their code covers |
| **Responsible office** | See and answer only the issues addressed to that office, once the report has been issued |
| **Viewer** | Read-only |

## Deployment

See **DEPLOYMENT.md** for the click-by-click. In short: push this repository to
GitHub, then in Render choose **New + → Blueprint** and point it at the repository.
`render.yaml` creates the PostgreSQL database and the web service and connects them.

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string — set automatically by the blueprint |
| `SESSION_SECRET` | Signs the session cookie — generated automatically |
| `QA_MANAGER_CODE` | Not used for sign-in any more; kept for compatibility |
| `ACADEMIC_YEAR` | Defaults to `2026/2027` |
| `QUARTER` | Defaults to `First` |

To run the next quarter's audit, change `QUARTER` (and `ACADEMIC_YEAR` when it
rolls over) and redeploy. The system opens a fresh set of campus audit files and
leaves the previous quarter's records untouched.

## Running locally

```bash
npm install
export DATABASE_URL="postgres://user@localhost/cbe_qas"
export QA_MANAGER_CODE="CBE-QAM-LOCAL"
npm start          # http://localhost:3000
```

The schema is applied and the seed data loaded automatically on first boot:
59 Fourth Quarter recommendations (31 Dar es Salaam, 28 Dodoma) and one access
code per role and office.

## Tests

`test/e2e.mjs` drives a real browser against a real PostgreSQL and covers
sign-in and role restrictions, evidence capture and automatic flagging,
concurrent editing between two auditors, report generation, issuing, the office
response round trip, exports, consolidation, access-code administration, and
backup and restore.

```bash
npm test
```

## Structure

```
server.js            Express app: authentication, data API, backup, restore
db.js                PostgreSQL pool, migration and seeding
schema.sql           Tables; every write is stamped with a revision number
data/                Seed data — prior recommendations and default access codes
public/
  index.html         Shell
  app.css            Styling
  framework.js       The audit framework: aspects, items, evidence sheets, standards
  derive.js          The automatic analysis — flags and drafted statements
  export.js          Offline Word and Excel writers (no external libraries)
  app.js             Client state, server synchronisation, data capture screens
  report.js          Report model, preview, exports, response portal, administration
test/e2e.mjs         End-to-end browser tests
render.yaml          Render blueprint
```

## Notes on the free tier

The free web service sleeps after about 15 minutes of inactivity; the first
request afterwards takes roughly half a minute to wake it. Render's free
PostgreSQL expires after 90 days. **Download a backup from the Backup and
restore screen at the end of every audit** — that file can rebuild the entire
system on a new database in one click.
