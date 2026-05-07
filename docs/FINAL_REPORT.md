# Board Game Recommendation and Strategy Explorer
### CIS 5500 Final Report — Spring 2026

**Team**

| Name          | Penn email                         | GitHub             |
| ------------- | ---------------------------------- | ------------------ |
| Yanru Fang    | fang13@seas.upenn.edu              | Yanru-Fang         |
| Yuming Li     | ming30@seas.upenn.edu              | Yming30            |
| Yunya Huang   | hyunya22@seas.upenn.edu            | hyunya22           |
| Fusang Leng   | lengfs@seas.upenn.edu              | fusangleng2003     |

**Repository**: this directory (private).
**Live demo**: see "Deployment" section below.

---

## 1. Project description

The Board Game Recommendation and Strategy Explorer is a search and analytics
web app for board games. It combines two BoardGameGeek (BGG) datasets — a game
catalog and a community-review export — into one PostgreSQL schema, then
exposes both browsing-style and analytical access on top of it.

A user can:

- **search** the catalog by name, release year, supported player count, and
  minimum rating;
- open a **game detail page** with the description, key facts, the
  distribution of community ratings, the most recent reviews, and a list of
  similar games;
- explore four data-driven **insights** (the four "complex" queries) that
  surface non-obvious patterns: games that beat their year's average; games
  whose reviews disagree with the catalog rating; dormant top-rated games;
  and globally outperforming games.

The app is deliberately scoped to be _useful_ within a domain we know well
(board games) rather than aiming for breadth — the value comes from the
analytical insights rather than a long catalog.

## 2. System architecture

```
React + Vite (Vercel)  ──HTTPS──▶  Express API (Render, Node 20)  ──pg──▶  PostgreSQL (AWS RDS)
                                              │
                                              ▼
                                       lru-cache (in-process, 24 h TTL)
```

- **Database** — PostgreSQL on AWS RDS (`db.t3.micro`). Two business tables
  (`Game`, `Review`), two raw staging tables, and one materialized
  per-game review summary (`game_review_stats`); B-tree + `pg_trgm` GIN
  indexes on the columns used by the slow queries. Schema in
  [`sql/schema.sql`](../sql/schema.sql), summary view in
  [`sql/materialized_views.sql`](../sql/materialized_views.sql), indexes in
  [`sql/indexes.sql`](../sql/indexes.sql).
- **Backend** — Node.js 20 + Express. 13 read-only routes, all queries go
  through a connection pool (`pg`) and an LRU cache.
  [`backend/server.js`](../backend/server.js).
- **Frontend** — React 18 + Vite, deployed on Vercel. Five pages (Home,
  Search, Game detail, Insights, About). The API base URL is a build-time
  env var (`VITE_API_BASE_URL`).

## 3. Data sources

| Source                                          | Used for                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| BoardGameGeek games + ranking dataset (Kaggle)  | One row per game: title, year, BGG metrics (avg rating, geek rating, voters, rank) |
| BoardGameGeek reviews dataset (Kaggle)          | One row per individual user review/rating, with timestamps              |

After load:

- `Game`: **126,266 rows**
- `Review`: **29,592,656 rows** (M5 reload — the M4 measurements
  earlier in this repo were taken on a 9.28 M-row sample of the same
  source)

Original Kaggle URLs are listed in the project proposal (Datasets 1, 2,
and 3).

## 4. Data cleaning and ingestion

Loading is a three-step pipeline:

1. **Stage** the raw CSVs into `raw_boardgames_csv` and `raw_reviews_csv`
   via `psql \copy`. Schema mirrors the CSV column order so no rewrite is
   needed.
2. **Clean + insert into `Game`** ([`sql/load_game.sql`](../sql/load_game.sql)):
   - drop rows with missing `game_id` or empty `title`;
   - `NULLIF(TRIM(...), '')` to normalize empty strings to `NULL`;
   - dedupe on `game_id` with `DISTINCT ON`, keeping the row with the
     lowest BGG `rank` (highest-quality canonical entry).
3. **Clean + insert into `Review`** ([`sql/load_review.sql`](../sql/load_review.sql)):
   - parse the two timestamp columns with explicit format strings;
   - parse `post_date` from the leading 10 characters of `postdate` (the
     CSV stores ISO-like strings with mixed precision);
   - dedupe on `review_id` (BGG can re-emit a review on rating updates);
   - inner-join against `Game(game_id)` so any review pointing at a
     dropped/missing game is excluded — preserves referential integrity.

Per the M2 plan, we additionally treat the union of the two BGG game
exports (Datasets 1 and 2 from the proposal) as a single conceptual
table; entity resolution between them happens at the staging stage by
matching on `game_id` (the BGG canonical identifier), and the
`DISTINCT ON` step picks the better-ranked row.

## 5. ER diagram and entity resolution

The full ER diagram (rendered with Mermaid) is in
[`docs/er_diagram.md`](./er_diagram.md). Summary:

- **GAME** (1) — (0..N) **REVIEW**
- `Game.game_id` is the BGG identifier (also used in URLs).
- `Review.game_id` references `Game.game_id` with `ON DELETE CASCADE`.
- Entity resolution: dedup on `game_id` in `Game` and `review_id` in
  `Review` (see section 4).

### Note on the M2 schema vs. what we built

Our M2 proposal sketched a 9-table schema with explicit `Category`,
`Mechanic`, `Designer`, `Publisher`, and `BGGUser` entities, joined to
`Game` through four junction tables. We deliberately simplified this in
M3 / M4 / M5 to the two-table design above for two reasons:

1. **The Kaggle datasets we ended up using do not expose category,
   mechanic, designer, or publisher fields on a per-game basis** — those
   attributes live in the BGG XML API, which is rate-limited and was
   out of scope to scrape for 126 k games within the project window.
2. **A single-column `BGGUser(user_id)` table would have a column equal
   to its primary key** — an anti-pattern; without any extra
   user-level attributes there is no functional dependency in `Review`
   that splitting `BGGUser` out would resolve. See
   [`docs/normalization.md`](./normalization.md) §"Why we did not split
   further".

The two-table schema we shipped is in 3NF and BCNF; the proof is in
`docs/normalization.md`. We discuss the implication for "Mechanic
Explorer" / "Designer Leaderboard" pages in §13 (future work).

## 6. Schema and normalization (3NF / BCNF)

Schema lives in [`sql/schema.sql`](../sql/schema.sql). Both `Game` and
`Review` are in **3NF and BCNF**. The full proof (FD analysis and
arguments for not splitting further) is in
[`docs/normalization.md`](./normalization.md).

## 7. SQL queries

10 queries are catalogued in [`sql/queries.sql`](../sql/queries.sql) and
each is wired to a corresponding API route (see `docs/api.md`).

| #   | Purpose                              | Powers route       |
| --- | ------------------------------------ | ------------------ |
| Q1  | Top-rated games                      | R2                 |
| Q2  | Most-reviewed games                  | R3                 |
| Q3  | Game detail lookup                   | R4                 |
| Q4  | Recent reviews for a game            | R5                 |
| Q5  | Rating distribution                  | R6                 |
| Q6  | Highly-rated with N+ reviews         | R7                 |
| Q7  | **Outperformers within release year** (year-level aggregate CTE) | R9 |
| Q8  | **Reviews exceed stored rating** (materialized review summary + join) | R10 |
| Q9  | **Dormant top-rated** (materialized review summary + date filter)     | R11 |
| Q10 | **Beats global average on both axes** (summary + global-stats CTE)    | R12 |

The four bolded queries are the M4 complex queries. Each one combines
multiple SQL features that a naïve single-table query cannot express:

- **Q7** originally used two correlated subqueries against `Game`. We
  rewrote it into a `year_stats` CTE that computes each year's average
  voters and average rating once, then joins that small per-year table
  back to `Game`. This preserves the same idea while avoiding repeated
  per-row aggregation.
- **Q8** reads `game_review_stats`, the materialized one-row-per-game
  review summary, and joins it to `Game` to compare the review average
  against the stored BGG average.
- **Q9** uses the same materialized summary to find high-rated games
  whose precomputed `latest_post_date` is before `2024-01-01`.
- **Q10** computes global averages over `game_review_stats`, then joins
  qualifying games to `Game`. This keeps the query complex while
  avoiding a fresh aggregation over all review rows.

## 8. API specification

13 routes total. Full spec — query params, response shape, examples — in
[`docs/api.md`](./api.md). Quick reference:

| Route id | Method/path                                     | Purpose                                |
| -------- | ----------------------------------------------- | -------------------------------------- |
| R1       | `GET /api/games/search`                         | Filter catalog                         |
| R2       | `GET /api/games/top`                            | Top rated                              |
| R3       | `GET /api/games/most-reviewed`                  | Most-reviewed                          |
| R4       | `GET /api/games/:gameId`                        | Game detail                            |
| R5       | `GET /api/games/:gameId/reviews`                | Recent reviews                         |
| R6       | `GET /api/games/:gameId/rating-distribution`    | Rating histogram                       |
| R7       | `GET /api/games/highly-rated`                   | Highly rated, N+ reviews               |
| R8       | `GET /api/games/:gameId/similar`                | Similar games (heuristic)              |
| R9       | `GET /api/games/outperformers-by-year`          | Q7 complex                             |
| R10      | `GET /api/games/review-vs-stored-rating`        | Q8 complex                             |
| R11      | `GET /api/games/dormant-top-rated`              | Q9 complex                             |
| R12      | `GET /api/games/global-outperformers`           | Q10 complex                            |
| R13      | `GET /api/health`                               | Liveness                               |

Auth: none. CORS: open (read-only public catalog). All routes return JSON.

## 9. Frontend pages

| Page          | URL          | Calls                                                                     |
| ------------- | ------------ | ------------------------------------------------------------------------- |
| Home          | `/`          | R2 + R3 + R7 (three rails: top, most-reviewed, critically-loved)          |
| Search        | `/search`    | R1 (filter form, server-side pagination via `limit`/`offset`)             |
| Game detail   | `/games/:id` | R4 + R5 + R6 + R8 (in parallel)                                           |
| Insights      | `/insights`  | R9 + R10 + R11 + R12 (interactive controls per card)                      |
| About         | `/about`     | R13 (health) + project metadata                                           |

The whole frontend is one React SPA (`react-router-dom` v6). Styling is
hand-rolled CSS with a small design system (cards, badges, table, dist
bars) — no UI framework dependency.

## 10. Performance evaluation

Method, environment, and full numbers in
[`docs/performance.md`](./performance.md). Pipeline:

1. Capture **baseline** (`schema.sql` + `load_*.sql` only) via
   `sql/perf_eval.sql`.
2. Apply `sql/indexes.sql`, re-run `perf_eval.sql` for the **indexed**
   numbers.
3. Rewrite Q7-Q10 and re-run `perf_eval.sql` to isolate pure query
   restructuring effects.
4. Build `game_review_stats` with
   [`sql/materialized_views.sql`](../sql/materialized_views.sql) and
   re-run `perf_eval.sql` for the final database-side timings.
5. Hit each of R9..R12 twice via `curl -w '%{time_total}\n'` for
   **cache cold/warm**.

Headline result on **126,266 `Game` rows + 29,592,656 `Review` rows**
(RDS `db.t3.micro`), captured in M5 with the indexes in
[`sql/indexes.sql`](../sql/indexes.sql) applied. After the initial M5
measurement, we rewrote Q7-Q10 to test whether query restructuring
could reduce cold database time beyond indexing and caching. That
helped Q7 substantially but left Q8-Q10 in the 30 s range, so we added
`game_review_stats`, a materialized view with one precomputed row per
game. The table below reports the latest `EXPLAIN ANALYZE` / timed-run
results from [`sql/perf_eval.sql`](../sql/perf_eval.sql):

| Query | Final optimization | Latest DB timing | Previous DB timing | Warm LRU hit |
| ----- | ------------------ | ----------------: | -----------------: | -----------: |
| Q7    | `year_stats` CTE avoids repeated per-year aggregation | **0.94 s EXPLAIN**, 178-243 ms warm DB runs | 4.1 s | <5 ms |
| Q8    | Query `game_review_stats` instead of aggregating `Review` | **120 ms EXPLAIN**, 54-71 ms warm DB runs | 29.9 s | <5 ms |
| Q9    | Query `game_review_stats.latest_post_date` for dormancy | **264 ms EXPLAIN**, 65-152 ms warm DB runs | 34.6 s | <5 ms |
| Q10   | Global averages over `game_review_stats` | **151 ms EXPLAIN**, 133-619 ms warm DB runs | 30.5 s | <5 ms |

The main lesson is that query restructuring and materialization solve
different problems. Q7 became fast by removing repeated work over the
smaller `Game` table. Q8-Q10 needed a stronger move: precomputing
`Review` aggregates once after ingestion. `game_review_stats` has
102,983 rows, compared with 29.6 M rows in `Review`, so the final
queries operate on the scale of games rather than the scale of
individual reviews. The LRU cache still makes repeated user
interactions sub-5 ms, but the cold path is now interactive too.

Four optimization techniques used:

1. **Indexing** (`sql/indexes.sql`): partial B-tree on
   `Game.year_published`, `Game.avg_rating`, `Game.num_voters`; composite
   on `Review(game_id, post_date DESC)` and `Review(game_id, rating)`;
   partial B-tree on `Review.post_date`; GIN `pg_trgm` on `Game.name` for
   fuzzy/ILIKE search.
2. **Query restructuring**:
   - **Q7** replaced two correlated year-level aggregate subqueries
     with a single `year_stats` CTE, reducing repeated work on `Game`.
   - In the intermediate Q8/Q10 rewrites, we aggregated `Review`
     before joining to `Game`; for Q9, we split high-rated review
     aggregates from recent activity and combined them with a left
     anti-join. These experiments clarified the bottleneck: even a
     cleaner plan was still paying for a full per-game review
     aggregation.
3. **Materialized review summary**:
   [`sql/materialized_views.sql`](../sql/materialized_views.sql) creates
   `game_review_stats(game_id, total_reviews, rated_reviews,
   avg_review_rating, latest_post_date)`. Because the dataset is
   read-only, we build this once after `load_review.sql`. Q8-Q10 now
   read that 102,983-row summary instead of recomputing the same
   aggregate over 29.6 M reviews on every cold request.
4. **Targeted route fix**:
   - **R5 (M5)**: tightening the predicate to `WHERE post_date IS NOT
     NULL` and dropping `ORDER BY ... NULLS LAST` aligned the query
     with the index's native ordering, switching the planner from a
     Bitmap Heap Scan + top-N sort to a single Index Scan.
     **10.2 s → 31 ms (~320×)** on game `224517`. EXPLAIN ANALYZE
     before/after is in [`docs/performance.md`](./performance.md).
5. **Application-layer cache** ([`backend/cache.js`](../backend/cache.js)):
   `lru-cache` v10, `max=500`, `ttl=24 h` (M5 — bumped from 5 min
   because the underlying data is read-only). Keyed on route id + query
   params. Repeat hits never reach Postgres.
6. **Pool-level safeguards (M5)** — [`backend/db.js`](../backend/db.js)
   sets `statement_timeout = 240 s` and `query_timeout = 250 s` on
   every `pg` pool connection so a runaway query is aborted by
   Postgres and the connection is recycled instead of permanently
   tying up one of the 10 pool slots.

## 11. Deployment

| Component | Provider | Notes                                                            |
| --------- | -------- | ---------------------------------------------------------------- |
| Database  | AWS RDS  | PostgreSQL 16, single AZ. Credentials via env vars on Render.    |
| Backend   | Render   | `backend/render.yaml` blueprint, free tier, Node 20.             |
| Frontend  | Vercel   | `frontend/vercel.json`, `framework: vite`, `outputDirectory: build`. |

Health checks: Render uses `/api/health` as its upstream health probe.

## 12. Technical challenges

1. **Review CSV size.** The reviews export grew across milestones —
   M4 was measured on a 9.28 M-row sample; the M5 reload uses the full
   29.6 M-row export. We keep raw rows in staging just long enough to
   do the inserts, then truncate. The expensive aggregations (Q3, Q5,
   Q8, Q9, Q10) are accelerated with composite indexes on
   `Review(game_id, …)`. We then added the `game_review_stats`
   materialized view for the three Review-heavy complex routes
   (Q8-Q10), which brought their cold database timings down from
   roughly 30-35 s to 120-264 ms. We still keep the `pg` pool's
   `statement_timeout` at 240 s (with a matching node-side
   `query_timeout` of 250 s) so unexpected slow paths cannot
   permanently park a pool slot.
2. **Schema simplification from M2.** Our M2 proposal designed a richer
   9-table schema with `Category`, `Mechanic`, `Designer`, `Publisher`,
   and junction tables. The Kaggle dataset that was actually feasible
   to ingest at our timeline did not include those fields on a per-game
   basis, so we collapsed to `Game` + `Review`. This forced two
   downstream changes: (a) we replaced the originally-planned
   "Mechanics Explorer" / "Designer Leaderboard" pages with the
   "Insights" page over the four complex SQL queries, and (b) we had
   to argue 3NF/BCNF on a two-entity design — see
   [`docs/normalization.md`](./normalization.md).
3. **Sparse metadata in `Game`.** The Kaggle game export does not
   populate `min_players`, `max_players`, `min_age`, or `complexity`.
   Rather than drop those columns, we kept them in the schema (NULLable)
   and the frontend renders them as "—". This is documented in the
   schema and the ER diagram so a future iteration can pull those
   fields from the BGG XML API without any schema change.
4. **Separating useful query rewrites from real bottlenecks.** We
   rewrote Q7-Q10 late in the project and re-ran `EXPLAIN ANALYZE`
   rather than assuming CTEs would automatically be faster. Q7 improved
   substantially because the rewrite removed repeated aggregation over
   `Game`. Q8-Q10 improved only modestly because the dominant cost is a
   full aggregation over the 29.6 M-row `Review` table. That observation
   led directly to the `game_review_stats` materialized view, which
   makes the final Q8-Q10 queries operate on one row per game instead of
   one row per review.
5. **Frontend isolation from API URL.** We use
   `import.meta.env.VITE_API_BASE_URL` so the same `npm run build`
   artifact deploys to local, staging, and production by changing one
   Vercel env var.
6. **AWS Academy lab volatility.** The class-issued AWS Academy
   sandbox occasionally times out, taking the RDS endpoint offline.
   We mitigated by (a) keeping the full load scripts in `sql/` so a
   replacement RDS instance can be re-provisioned in a few hours,
   and (b) caching every read route at the app layer so brief DB
   blips do not propagate to the user.

## 13. Future work

- Pull `min_players`, `max_players`, `complexity`, mechanics, category,
  designer, and publisher from the BGG XML API and populate the M2
  lookup tables. This would unlock the originally-planned "Mechanics
  Explorer" and "Designer Leaderboard" pages.
- Add a `BGGUser` entity once the dataset has user-level metadata
  (display name, country, total reviews, etc.) — at that point a
  `User` table earns its keep.
- Replace the heuristic "similar games" with an embedding-based match.
- Add a "personal shelf" feature behind a real auth boundary (would be
  the first write path in the system).

## 14. Team responsibilities

| Member        | M3–M5 contribution                                                          |
| ------------- | --------------------------------------------------------------------------- |
| Yanru Fang    | Backend (Express, all 13 routes), complex SQL queries, M4 perf evaluation. |
| Yuming Li     | Datasets 1 & 2 cleaning (Game), Postgres schema + RDS provisioning.        |
| Yunya Huang   | Frontend Search and Game Detail flows, Similar Games component.            |
| Fusang Leng   | Dataset 3 (Reviews) cleaning, Insights page, deployment + performance.     |

## 15. Repository tour

```
backend/         Express API (server.js, db.js, cache.js, render.yaml)
frontend/        React + Vite SPA
sql/             schema.sql, load_*.sql, queries.sql, indexes.sql, perf_eval.sql
docs/            api.md, er_diagram.md, normalization.md, performance.md, FINAL_REPORT.md
files/           course rubric / templates / EDA tutorials (read-only)
README.md        High-level overview
```

## 16. References

- Project Proposal (Datasets 1 + 2 + 3 Kaggle URLs).
- Milestone 2 (`files/CIS5500_Miliestone2_.pdf`) — original 9-table
  schema and team responsibilities.
- Milestone 3 (`files/cis550_proposal_3.pdf`) — the 10 queries listed
  above, with descriptions and example values.
- Milestone 4 (`files/CIS5500_Milestone4.md`) — the full API spec and
  the source of the M4 perf measurements quoted in §10 and
  `docs/performance.md`.
- `node-postgres`, `lru-cache`, `react`, `react-router-dom`, `vite`,
  `express`, `cors`, `dotenv`.
- PostgreSQL `pg_trgm` documentation for trigram-similarity search.
