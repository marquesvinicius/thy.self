-- thy.self Database Schema — snapshot canônico
--
-- Estado consolidado após migrations 001–006:
--   001: llm_interpretation + consistency em results
--   002: answer_type + user_observation em answers; alternative_id nullable
--        (rank_position/slider_value foram removidas pela 006)
--   003: tabela archetypes + função find_closest_archetype
--   004: dual-core em questions (kind, trait, reverse_key, external_id)
--   005: remoção das colunas de public share (RF008 revogado)
--   006: remoção de rank_position/slider_value (nunca consumidas)
--   007: UNIQUE (question_id, sort_order) em alternatives + dedupe
--
-- Uso: setup limpo de um projeto Supabase novo — execute este arquivo inteiro
-- no SQL Editor. Para bancos existentes, as migrations numeradas continuam
-- sendo a fonte histórica; aplique-as em ordem.

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
-- QUESTIONS (Dual-Core)
--
-- kind = 'objective'      → itens BFI-2-S validados (Soto & John, 2017).
--                           Somente estes alimentam o cálculo OCEAN.
--                           Devem declarar trait + reverse_key.
-- kind = 'interpretative' → itens autorais (dilemas, paradoxos, interesses).
--                           Não influenciam o escore; contexto qualitativo
--                           para a narrativa da LLM.
-- external_id             → chave natural para reseed idempotente
--                           (BFI2S: E1…O30; interpretativas: INT_MD_01…).
-- ============================================================
CREATE TABLE questions (
  id          SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES question_categories(id),
  text        TEXT NOT NULL,
  context     TEXT,
  type        VARCHAR(30) DEFAULT 'multiple_choice',
  kind        VARCHAR(20) NOT NULL DEFAULT 'interpretative',
  trait       CHAR(1),
  reverse_key BOOLEAN NOT NULL DEFAULT false,
  external_id VARCHAR(50),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT questions_kind_check
    CHECK (kind IN ('objective', 'interpretative')),
  CONSTRAINT questions_trait_check
    CHECK (trait IS NULL OR trait IN ('O', 'C', 'E', 'A', 'N')),
  -- Objetivas DEVEM declarar trait; interpretativas NÃO podem declarar
  -- trait nem reverse_key.
  CONSTRAINT questions_kind_trait_consistency
    CHECK (
      (kind = 'objective'      AND trait IS NOT NULL) OR
      (kind = 'interpretative' AND trait IS NULL AND reverse_key = false)
    ),
  -- UNIQUE real (não índice parcial) para o ON CONFLICT do PostgREST.
  -- NULLs múltiplos são distintos — interpretativas legadas podem ficar NULL.
  CONSTRAINT questions_external_id_key UNIQUE (external_id)
);

CREATE INDEX idx_questions_category ON questions(category_id);
CREATE INDEX idx_questions_active   ON questions(is_active);
CREATE INDEX idx_questions_kind     ON questions(kind);
CREATE INDEX idx_questions_trait    ON questions(trait) WHERE trait IS NOT NULL;

-- ============================================================
-- ALTERNATIVES
--
-- Para itens objetivos, exatamente UMA coluna impact_* (a do trait do item)
-- carrega o valor Likert em [-2, +2]; as demais ficam 0.
-- Para itens interpretativos, todos os impact_* são 0 (nunca pontuam).
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
  impact_n    NUMERIC(4,2) NOT NULL DEFAULT 0,

  -- Chave natural para o upsert idempotente do seed (migration_007).
  CONSTRAINT alternatives_question_sort_key UNIQUE (question_id, sort_order)
);

CREATE INDEX idx_alternatives_question ON alternatives(question_id);

-- ============================================================
-- SESSIONS (RN013: status é 'active' ou 'completed')
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
--
-- alternative_id é nullable: respostas 'reflection' não escolhem alternativa
-- (a "voz" da resposta é user_observation).
-- ============================================================
CREATE TABLE answers (
  id               SERIAL PRIMARY KEY,
  session_id       UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id      INTEGER NOT NULL REFERENCES questions(id),
  alternative_id   INTEGER REFERENCES alternatives(id),
  answer_type      VARCHAR(30) DEFAULT 'alternative_id',
  user_observation TEXT,
  answered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(session_id, question_id)
);

CREATE INDEX idx_answers_session ON answers(session_id);

-- ============================================================
-- RESULTS
--
-- RN012: os escores OCEAN são imutáveis após o cálculo. A única coluna
-- atualizável é llm_interpretation (re-geração de referências/obras).
-- ============================================================
CREATE TABLE results (
  id                 SERIAL PRIMARY KEY,
  session_id         UUID UNIQUE NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  score_o            NUMERIC(5,2) NOT NULL,
  score_c            NUMERIC(5,2) NOT NULL,
  score_e            NUMERIC(5,2) NOT NULL,
  score_a            NUMERIC(5,2) NOT NULL,
  score_n            NUMERIC(5,2) NOT NULL,
  answer_count       INTEGER NOT NULL,
  raw_impacts        JSONB NOT NULL,
  consistency        JSONB,
  llm_interpretation JSONB,
  calculated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_results_session ON results(session_id);

-- ============================================================
-- ARCHETYPES (catálogo OSPP — carregado por npm run seed)
-- ============================================================
CREATE TABLE archetypes (
  id         VARCHAR(50) PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  universe   VARCHAR(255) NOT NULL,
  o_score    DECIMAL(4,1) NOT NULL,
  c_score    DECIMAL(4,1) NOT NULL,
  e_score    DECIMAL(4,1) NOT NULL,
  a_score    DECIMAL(4,1) NOT NULL,
  n_score    DECIMAL(4,1) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Distância euclidiana pentadimensional calculada nativamente no Postgres.
-- RF005: em caso de empate na distância, o desempate é determinístico pelo
-- identificador do registro (id ASC).
CREATE OR REPLACE FUNCTION find_closest_archetype(user_o float, user_c float, user_e float, user_a float, user_n float)
RETURNS TABLE (id varchar, name varchar, universe varchar, distance float)
LANGUAGE sql
AS $$
  SELECT
    id,
    name,
    universe,
    SQRT(POWER(o_score - user_o, 2) + POWER(c_score - user_c, 2) + POWER(e_score - user_e, 2) + POWER(a_score - user_a, 2) + POWER(n_score - user_n, 2)) as distance
  FROM archetypes
  ORDER BY distance ASC, id ASC
  LIMIT 1;
$$;
