-- ==========================================================================
-- CBE Quality Audit System — database schema (PostgreSQL)
-- Every write stamps a row with the next value of rev_seq. Clients poll with
-- the highest rev they have seen, so several auditors stay in step without
-- websockets and without overwriting one another.
-- ==========================================================================

CREATE SEQUENCE IF NOT EXISTS rev_seq;

CREATE TABLE IF NOT EXISTS audits (
  id            SERIAL PRIMARY KEY,
  campus        TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  quarter       TEXT NOT NULL,
  session       JSONB NOT NULL DEFAULT '{}'::jsonb,
  general       JSONB NOT NULL DEFAULT '{}'::jsonb,
  standards     JSONB NOT NULL DEFAULT '{}'::jsonb,
  way_forward   JSONB NOT NULL DEFAULT '[]'::jsonb,
  locked        BOOLEAN NOT NULL DEFAULT FALSE,
  issued_at     TIMESTAMPTZ,
  rev           BIGINT NOT NULL DEFAULT nextval('rev_seq'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campus, academic_year, quarter)
);

CREATE TABLE IF NOT EXISTS audit_items (
  audit_id   INTEGER NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  item_id    TEXT NOT NULL,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  rev        BIGINT NOT NULL DEFAULT nextval('rev_seq'),
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (audit_id, item_id)
);

CREATE TABLE IF NOT EXISTS audit_grids (
  audit_id   INTEGER NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  grid_id    TEXT NOT NULL,
  rows       JSONB NOT NULL DEFAULT '[]'::jsonb,
  rev        BIGINT NOT NULL DEFAULT nextval('rev_seq'),
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (audit_id, grid_id)
);

CREATE TABLE IF NOT EXISTS audit_followups (
  audit_id   INTEGER NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  rec_id     TEXT NOT NULL,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  rev        BIGINT NOT NULL DEFAULT nextval('rev_seq'),
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (audit_id, rec_id)
);

CREATE TABLE IF NOT EXISTS audit_responses (
  audit_id   INTEGER NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  issue_ref  TEXT NOT NULL,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  rev        BIGINT NOT NULL DEFAULT nextval('rev_seq'),
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (audit_id, issue_ref)
);

-- Recommendations carried forward from an earlier audit, for the follow-up module
CREATE TABLE IF NOT EXISTS prior_recs (
  id                  TEXT PRIMARY KEY,
  campus              TEXT NOT NULL,
  source_ref          TEXT,
  source_label        TEXT,
  area                TEXT,
  issue               TEXT,
  recommendation      TEXT,
  responsible_officer TEXT,
  prior_response      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prior_recs_campus_idx ON prior_recs(campus);

-- Shared access codes. role: qa_manager | auditor | office | viewer
CREATE TABLE IF NOT EXISTS access_codes (
  code       TEXT PRIMARY KEY,
  role       TEXT NOT NULL,
  campus     TEXT,
  office     TEXT,
  label      TEXT,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_used  TIMESTAMPTZ,
  use_count  INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity (
  id       BIGSERIAL PRIMARY KEY,
  audit_id INTEGER,
  actor    TEXT,
  role     TEXT,
  action   TEXT,
  detail   TEXT,
  at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_audit_idx ON activity(audit_id, at DESC);

-- Who is currently working where (for the presence strip)
CREATE TABLE IF NOT EXISTS presence (
  token    TEXT PRIMARY KEY,
  audit_id INTEGER,
  actor    TEXT,
  role     TEXT,
  screen   TEXT,
  seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Optional PIN per identity. Normally empty: sign-in is by choosing your role.
-- Put a value here for an identity and the server starts demanding it for that
-- identity only.
ALTER TABLE access_codes ADD COLUMN IF NOT EXISTS pin TEXT;
