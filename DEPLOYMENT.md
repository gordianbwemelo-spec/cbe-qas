# Putting the Quality Audit System online

You will finish with a link such as `https://cbe-qas.onrender.com` to share with
the audit teams and the responsible offices.

You have already created the database (`cbe-qas-db`, Oregon). These steps add
the web service and connect it to that database. Allow about fifteen minutes.

---

## Step 1 — Put the code on GitHub

1. Unzip `CBE-Quality-Audit-System.zip` on your computer. You should see
   `server.js`, `package.json`, `render.yaml`, and folders called `public` and
   `data`.
2. Go to <https://github.com/new>.
3. **Repository name:** `cbe-qas`. Choose **Private**. Do **not** tick "Add a
   README file". Click **Create repository**.
4. On the "Quick setup" page, click the link **uploading an existing file**.
5. Open the unzipped folder, select **everything inside it** — not the folder
   itself — and drag it onto the GitHub page. Include the `public`, `data` and
   `test` folders.
6. Wait for the upload to finish, then click **Commit changes**.

> If GitHub rejects a file for being too large, check you didn't include a
> `node_modules` folder. It isn't needed — Render installs the dependencies.

---

## Step 2 — Create the web service on Render

1. Go to <https://dashboard.render.com>.
2. Click **New +** (top right) → **Web Service**.
3. Choose **Build and deploy from a Git repository**, then connect GitHub if
   asked and select **cbe-qas**.
4. Fill in:

   | Field | Value |
   |---|---|
   | **Name** | `cbe-qas` |
   | **Region** | **Oregon (US West)** — must match the database |
   | **Branch** | `main` |
   | **Runtime** | Node |
   | **Build Command** | `npm ci --omit=dev` |
   | **Start Command** | `node server.js` |
   | **Instance Type** | Free |

   Getting the region wrong is the one mistake worth avoiding — the service
   can only reach the database over Render's fast internal network if both sit
   in the same region.

5. Scroll to **Environment Variables** and click **Add Environment Variable**
   for each of these:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | paste the **Internal Database URL** from `cbe-qas-db` |
   | `SESSION_SECRET` | click **Generate** if offered, or paste a long random string |
   | `NODE_ENV` | `production` |
   | `ACADEMIC_YEAR` | `2026/2027` |
   | `QUARTER` | `First` |

   To get the Internal Database URL: open `cbe-qas-db` in another tab, scroll to
   **Connections**, and copy **Internal Database URL** (not External — internal
   is faster and doesn't leave Render's network).

6. Click **Create Web Service**.

Render builds and starts it. The first build takes three to five minutes.

---

## Step 3 — Open it

When the status reads **Live**, click the service URL at the top of the page —
that is your link.

The database tables and the 59 carried-forward recommendations are created
automatically on first start. You'll see it in the **Logs** tab:

```
Seeded 59 prior recommendations.
CBE Quality Audit System listening on 10000
```

Open the link. You'll get the sign-in screen: cards for the four campus audit
teams, the eighteen responsible offices, and Management. Click **Quality
Assurance Manager**, type your name, and you're in.

---

## Step 4 — Send the link out

Everyone uses the same link and picks their own card. Nothing to issue, nothing
to remember.

| Who | What they click | What they see |
|---|---|---|
| Audit team | Their campus card | That campus's audit file only |
| Responsible office | Their office card | Only the issues addressed to that office, once you have issued the report |
| Management | Quality Assurance Manager | Everything |
| Read-only | Management (read only) | Reports, no editing |

A suggested message to an office:

> The Quality Assurance Unit has completed the academic quality audit at
> [campus] Campus. The issues for which your office is responsible are waiting
> for you at [link]. Open it, click your office, type your name, and record your
> response against each issue. Please do so within 21 days.

**If you later want to restrict access**, the system supports a PIN per role.
Set one in the database and the sign-in screen starts asking for it — for that
role only, with everyone else still clicking straight through:

```sql
UPDATE access_codes SET pin = '4417' WHERE role = 'qa_manager';
```

Run that from the **Connect → PSQL Command** button on the database page.

---

## Running an audit

1. **Open the campus.** From the dashboard, click **Start audit** beside the
   campus. Record the dates, the lead auditor and the team.
2. **Capture the findings.** Work through the six aspects. Fill the evidence
   sheets — type, paste from Excel, or import a CSV — and the system flags the
   breaches and drafts the issue statements for you.
3. **Work in parallel.** Several auditors can be in the same campus file at
   once; entries appear on each other's screens within a few seconds.
4. **Check the report.** The **Generated report** screen lists anything still
   incomplete. Green means ready.
5. **Issue it.** Click **Issue to responsible offices**. This locks the report
   and makes each office's issues visible to them. Download the Word report for
   submission to the Deputy Rector — ARC.
6. **Watch the responses arrive.** They appear in the report automatically.
7. **Consolidate.** When all four campuses are done, **Consolidated report**
   compares them and produces the College-wide report.

---

## Looking after it

**Back up at the end of every audit.** Open **Backup & restore** and click
**Download a backup now**. That file rebuilds the whole system on a fresh
database in one click.

**The free tier sleeps.** After about fifteen minutes idle, the first person to
open the link waits roughly thirty seconds. If that becomes a nuisance during a
campus visit, upgrade the web service to Starter in its **Settings**.

**Render's free PostgreSQL expires after 90 days.** Render emails you first.
When it happens: take a backup, create a new database, change `DATABASE_URL` on
the web service, restore the backup.

**Next quarter.** In the service's **Environment** tab change `QUARTER` to
`Second` and save. A fresh set of campus audit files opens; this quarter's
records stay untouched.

---

## If something goes wrong

| What you see | What to do |
|---|---|
| "Application failed to respond" on first visit | The free service is waking. Wait thirty seconds and reload. |
| Deploy fails with a database error | Check `DATABASE_URL` is set and that the service region is **Oregon**, same as the database. |
| An office says it sees no issues | The report for that campus hasn't been issued yet, or the issues are assigned to a different office. |
| Two people overwrote each other | They can't — each item and evidence sheet saves separately, and the system won't overwrite a field somebody is typing in. Check the **Activity log**. |
