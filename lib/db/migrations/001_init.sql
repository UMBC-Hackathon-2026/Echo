-- Initial schema for The Inverse Tutor
-- Tables: sessions, explanations, concept_states, assessment_attempts, question_results

CREATE TABLE IF NOT EXISTS sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS explanations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS concept_states (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  concept_id    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'unknown', -- unknown | shaky | solid
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, concept_id)
);

CREATE TABLE IF NOT EXISTS assessment_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  explanation_id UUID REFERENCES explanations(id) ON DELETE SET NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS question_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id    UUID NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  question_id   TEXT NOT NULL,
  correct       BOOLEAN NOT NULL,
  feedback      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_explanations_session ON explanations(session_id);
CREATE INDEX IF NOT EXISTS idx_concept_states_session ON concept_states(session_id);
CREATE INDEX IF NOT EXISTS idx_attempts_session ON assessment_attempts(session_id);
CREATE INDEX IF NOT EXISTS idx_question_results_attempt ON question_results(attempt_id);
