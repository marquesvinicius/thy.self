-- thy.self Database Schema
-- Execute this in the Supabase SQL Editor

-- ============================================================
-- QUESTION CATEGORIES
-- ============================================================
CREATE TABLE question_categories (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(50) UNIQUE NOT NULL,
  name        VARCHAR(100) NOT NULL,
  description TEXT
);

-- ============================================================
-- QUESTIONS
-- ============================================================
CREATE TABLE questions (
  id          SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES question_categories(id),
  text        TEXT NOT NULL,
  context     TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_questions_category ON questions(category_id);
CREATE INDEX idx_questions_active ON questions(is_active);

-- ============================================================
-- ALTERNATIVES
-- ============================================================
CREATE TABLE alternatives (
  id          SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  impact_o    NUMERIC(4,2) NOT NULL DEFAULT 0,
  impact_c    NUMERIC(4,2) NOT NULL DEFAULT 0,
  impact_e    NUMERIC(4,2) NOT NULL DEFAULT 0,
  impact_a    NUMERIC(4,2) NOT NULL DEFAULT 0,
  impact_n    NUMERIC(4,2) NOT NULL DEFAULT 0
);

CREATE INDEX idx_alternatives_question ON alternatives(question_id);

-- ============================================================
-- SESSIONS
-- ============================================================
CREATE TABLE sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname     VARCHAR(100),
  status       VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_sessions_status ON sessions(status);

-- ============================================================
-- ANSWERS
-- ============================================================
CREATE TABLE answers (
  id             SERIAL PRIMARY KEY,
  session_id     UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id    INTEGER NOT NULL REFERENCES questions(id),
  alternative_id INTEGER NOT NULL REFERENCES alternatives(id),
  answered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(session_id, question_id)
);

CREATE INDEX idx_answers_session ON answers(session_id);

-- ============================================================
-- RESULTS
-- ============================================================
CREATE TABLE results (
  id            SERIAL PRIMARY KEY,
  session_id    UUID UNIQUE NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  score_o       NUMERIC(5,2) NOT NULL,
  score_c       NUMERIC(5,2) NOT NULL,
  score_e       NUMERIC(5,2) NOT NULL,
  score_a       NUMERIC(5,2) NOT NULL,
  score_n       NUMERIC(5,2) NOT NULL,
  answer_count  INTEGER NOT NULL,
  raw_impacts   JSONB NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_results_session ON results(session_id);
