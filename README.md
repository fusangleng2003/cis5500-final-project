# Board Game Recommendation and Strategy Explorer

CIS 5500 final project, Spring 2026.

A search and analytics web app for board games. Browse a catalog backed by
the BoardGameGeek dataset, drill into per-game review history, and explore
data-driven insights powered by four "complex" SQL queries.

> **Going to grade this?** Start with [`docs/FINAL_REPORT.md`](docs/FINAL_REPORT.md) — it
> indexes everything else (ER diagram, 3NF proof, API spec, performance
> evaluation, challenges).

## Architecture

```
React + Vite (Vercel)  ──HTTPS──▶  Express API (Render, Node 20)  ──pg──▶  PostgreSQL (AWS RDS)
                                              │
                                              ▼
                                        lru-cache (in-process, 24 h TTL)
```

- `frontend/` — React 18 + Vite SPA with five pages (Home, Search,
  Game Detail, Insights, About).
- `backend/` — Node.js + Express API, 13 read-only routes, LRU-cached.
- `sql/` — schema, load scripts, materialized review stats, indexes, the
  10 queries (Q1–Q10), and a performance-eval harness for the 4 complex
  queries.
- `docs/` — final report and supporting documents.

## Documents

| Doc                                                        | What it covers                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| [`docs/FINAL_REPORT.md`](docs/FINAL_REPORT.md)             | The final report — read this first.                             |
| [`docs/api.md`](docs/api.md)                               | All 13 routes: paths, params, response shape, examples.         |
| [`docs/er_diagram.md`](docs/er_diagram.md)                 | Mermaid ER diagram + cardinalities + design rationale.          |
| [`docs/normalization.md`](docs/normalization.md)           | 3NF / BCNF proof for `Game` and `Review`.                       |
| [`docs/performance.md`](docs/performance.md)               | Perf evaluation: indexing + materialization + caching.          |

## How to run

### 1. Database

Once per RDS instance:

```bash
psql $DATABASE_URL -f sql/schema.sql
# Then populate the raw staging tables with the BGG CSVs:
#   \copy raw_boardgames_csv FROM 'boardgames.csv' WITH CSV HEADER
#   \copy raw_reviews_csv    FROM 'boardgames_reviews.csv' WITH CSV HEADER
psql $DATABASE_URL -f sql/load_game.sql
psql $DATABASE_URL -f sql/load_review.sql
psql $DATABASE_URL -f sql/materialized_views.sql
psql $DATABASE_URL -f sql/indexes.sql
```

### 2. Backend (Node/Express)

```bash
cd backend
cp .env.example .env       # fill in PGHOST/PGUSER/PGPASSWORD/PGDATABASE
npm install
npm run dev                # http://localhost:8080/api/health
```

### 3. Frontend (React + Vite)

```bash
cd frontend
cp .env.example .env       # set VITE_API_BASE_URL=http://localhost:8080
npm install
npm run dev                # http://localhost:3000
```

The build command is `npm run build` (output goes to `frontend/build/`).
Vercel is wired up for that exact pipeline via `frontend/vercel.json`.

## Deployment

| Component | Provider | Config file                                     |
| --------- | -------- | ----------------------------------------------- |
| Database  | AWS RDS  | `sql/schema.sql` + `sql/materialized_views.sql` + `sql/indexes.sql` |
| Backend   | Render   | [`backend/render.yaml`](backend/render.yaml)    |
| Frontend  | Vercel   | [`frontend/vercel.json`](frontend/vercel.json)  |

Health check: `GET /api/health` returns `{ "status": "ok", "db": "up" }`
when both Render and RDS are reachable. Render uses this path as its
upstream health probe.

## Key design choices

- **Indexes** ([`sql/indexes.sql`](sql/indexes.sql)): partial B-trees on the
  high-selectivity columns plus a `pg_trgm` GIN index on `Game.name` for
  fuzzy + ILIKE search.
- **Materialized review stats** ([`sql/materialized_views.sql`](sql/materialized_views.sql)):
  precomputes one row per game for Q8..Q10, avoiding repeated full
  aggregations over the 29.6 M-row `Review` table.
- **Application cache** ([`backend/cache.js`](backend/cache.js)): LRU
  (`lru-cache` v10), 500 entries, 24 h TTL, keyed on route + query
  params. Repeats never reach Postgres.
- **Query restructuring**: Q7 uses a `year_stats` CTE; Q8..Q10 use
  `game_review_stats` for interactive cold performance.

## Repository tour

```
backend/             # Express API
backend/server.js    # 13 routes
backend/cache.js     # LRU cache wrapper
backend/db.js        # pg Pool config

frontend/            # React + Vite SPA
frontend/src/        # routes, components, API client

sql/schema.sql       # canonical schema (Game, Review, raw_*)
sql/load_game.sql    # raw → Game with dedup
sql/load_review.sql  # raw → Review with FK enforcement
sql/queries.sql      # Q1..Q10 (with Q7..Q10 marked complex)
sql/materialized_views.sql # per-game review summary for Q8..Q10
sql/indexes.sql      # indexes
sql/perf_eval.sql    # EXPLAIN + \timing harness for Q7..Q10

docs/                # FINAL_REPORT.md and supporting docs
files/               # course rubric / templates (read-only)
```

## Notes

This repository is private and intended only for the CIS 5500 final
project team and course staff.
