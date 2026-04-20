# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Two independent Node projects under one repo:

- `backend/` — Express 5 API (Node 20+, ESM). Entry `src/server.js` → `src/app.js`. All routes mount under `/api/v1`.
- `frontend/` — Next.js 16 App Router (React 19, Tailwind v4). Runs on port **3001** by default; calls the API via `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:3000/api/v1`).

Project-level artifacts at the repo root: raw question CSVs (`questions.csv`, `questions2.csv`) and `SWCPQ-Features-Aggregated-Dataset-January2025/`, used as source material for seed generation.

## Commands

### Backend (`cd backend`)
- `npm run dev` — start API with `node --watch` on `env.port` (default 3000).
- `npm start` — production start.
- `npm run seed` — reseed categories, BFI-2-S objective items, and interpretative items from `seed/objective_bfi2s.json` + `seed/interpretative.json` into Supabase. Idempotent via `external_id`.
- `npm test` — run all Node built-in test-runner suites in `test/**/*.test.js`.
- Run a single test file: `node --test test/bigfive-engine.test.js`.
- SQL migrations in `sql/migration_00*.sql` are applied manually against the Supabase project in order (see `migration_004_dual_core.sql` for the current canonical layering).

### Frontend (`cd frontend`)
- `npm run dev` — Next dev server on **port 3001** (not 3000).
- `npm run build` / `npm start` — production build / serve.
- `npm run lint` — ESLint via `eslint.config.mjs` (next config).

### Required env (`backend/.env`)
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` are required — `src/config/environment.js` throws at import time if either is missing. Optional: `PORT`, `NODE_ENV`, `ALLOWED_ORIGINS` (comma-separated), `GEMINI_API_KEY`, `LLM_DAILY_LIMIT`, `MIN_ANSWERS_FOR_ANALYSIS`, `MAX_QUESTIONS_PER_SESSION`.

## Architecture

### Dual-Core question model (the single most important concept)

Questions live in two mutually-exclusive layers enforced at the DB level (`migration_004_dual_core.sql`, check constraint `questions_kind_trait_consistency`):

1. **`kind = 'objective'`** — validated BFI-2-S items (Soto & John, 2017). Each item declares a single `trait` (`O|C|E|A|N`) and a `reverse_key` flag. **Only these answers feed the numeric OCEAN score.** There are exactly 30 items (6 per trait) — this is why `MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS = 30` is hard-coded in `src/config/constants.js`.
2. **`kind = 'interpretative'`** — authorial items (moral dilemmas, paradoxes, interest probes). These **do not influence numeric scores**. They are consumed as qualitative context for the LLM narrative only. Categories are weighted by `INTERPRETATIVE_CATEGORY_WEIGHTS` (moral_dilemma 0.45, paradoxical 0.30, interest 0.25).

When touching the engine or seed, preserve this invariant: objective → scored (single-trait Likert in `[-2, +2]`, sign flipped when reverse-keyed), interpretative → LLM-only. The engine (`src/engine/BigFiveEngine.js`) explicitly `continue`s over any non-objective answer.

### Scoring pipeline
`BigFiveEngine.calculateProfile(answers)` → per-trait raw sum of signed Likert values → `normalizeByTrait` (min-max onto 0–100, neutral = 50) → `classifyScore` bucketing (`muito_baixo` <20, `baixo` <40, `moderado` <60, `alto` <80, `muito_alto` ≥80) → `DIMENSIONS` metadata join.

Theoretical bounds assume 6 items × Likert `[-2, +2]`; `normalization.js` falls back to `ITEMS_PER_TRAIT` when an item is missing so partial fixtures normalize deterministically.

### Request flow (backend)
`app.js` wires: CORS (`config/cors.js`) → `express.json()` → request logger → `/health` → `/api/v1/*` router → 404 → `errorHandler`. Per-feature folders follow `routes → controllers → services → database/queries` with `engine/` reserved for pure scoring math and `utils/` for logger + typed `AppError`. `sessionGuard` (in `middleware/`) validates `session_id` on protected routes; `validateRequest({...})` does shallow field/type/length checks.

Dev-only routes mount under `/api/v1/dev` when `NODE_ENV === 'development'` (currently `POST /dev/quick-analyze` — creates a session, generates random answers, and analyzes, used for exercising the LLM path without the full quiz).

### API surface (for the frontend)
`frontend/services/api.js` is the single client. Endpoints it uses:
- `POST /session` → start quiz
- `GET  /questions?session_id=…` → fetch next batch
- `POST /answer` → submit one answer (objective requires `alternative_id`; reflection text uses a separate field path)
- `POST /analyze` → finalize: computes profile, finds closest archetype, triggers LLM interpretation
- `GET  /result/:session_id`, `POST /result/:session_id/share` → fetch/share saved result
- `POST /interpret` (re-generate) and `POST /interpret/reference-detail` (deep-dive on one cultural reference)
- `GET  /public/result/:token` → read-only public share

### LLM layer
`src/services/llm.service.js` calls Gemini (`gemini-2.5-flash-lite`) with retries + timeout, guarded by `llm-limiter.js` (in-memory daily budget via `LLM_DAILY_LIMIT`, max 3 regenerations per session). Reference images are fetched by `image.service.js`. Fallback work/reference lists in `llm.service.js` are used when the API key is absent or the call fails — keep these fallbacks when editing, because dev environments frequently run without `GEMINI_API_KEY`. Interpretation output carries schema versions (`INTERPRETATION_SCHEMA_VERSION`, `DETAIL_SCHEMA_VERSION`) — bump these when changing the response shape.

### Archetype matching
`archetype.service.js` delegates to the Postgres function `find_closest_archetype(user_o, user_c, user_e, user_a, user_n)` (defined in `migration_003_archetypes.sql`). The math lives in the DB, not in Node.

### Frontend structure (App Router)
- `app/page.js` — landing + start-quiz entry (shows `QUESTION_TYPE_GUIDE` before session creation).
- `app/quiz/`, `app/result/`, `app/r/` (public share), `app/about/`, `app/method/` — main flows.
- `components/` — `QuestionRenderer` dispatches on item `type` (`slider`, `binary`, `ranking`, `reflection`, `multiple_choice`); `ResultView`, `DimensionBar`, `NarrativeBlock`, `WorksBlock`, `CulturalCard`, `ReferenceDetailModal` render the analysis UI; `MysticBackground` + `VibeHero` carry the visual identity.
- `lib/pdf/buildResultPdf.js` — client-side PDF export via `pdfmake`.
- `jsconfig.json` aliases `@/*` to the frontend root (use `@/services/api`, `@/components/...`).

### Key DB tables (see `backend/sql/schema.sql` + migrations)
`question_categories`, `questions` (+ `kind`, `trait`, `reverse_key`, `external_id`), `alternatives` (carry per-trait `impact_o|c|e|a|n` for objective items), `sessions` (status: `active|completed|abandoned`), `answers`, `results`. Migration 005 adds public-share columns on `results`.

## Conventions worth knowing

- ESM everywhere (`"type": "module"`). Use explicit `.js` extensions in relative imports.
- Errors: throw `AppError` from `utils/AppError.js`; the global `errorHandler` shapes them into `{ success: false, error: { message, code } }`.
- Responses: use helpers in `utils/apiResponse.js` for consistent `{ success, data }` envelopes.
- Portuguese (pt-BR) is the user-facing language — dimension names, labels, and LLM prompts are all in pt-BR. Preserve this when editing copy, seed text, or prompts.
- Comments in the scoring engine and the dual-core migration encode non-obvious invariants (BFI-2-S item count, Likert bounds, interpretative-never-scored rule). Read them before refactoring — they exist because prior regressions violated these assumptions.
