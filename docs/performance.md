# Performance Evaluation

> The four complex queries Q7..Q10 (routes R9..R12) are the focus of the
> M4 optimization grade. We measure each in three modes:
>
> 1. **Baseline** — schema + data only, no extra indexes, cold caches.
> 2. **Indexed** — `sql/indexes.sql` applied (B-tree + `pg_trgm` GIN).
> 3. **Cached** — same query served from the in-process LRU cache in front
>    of every API route (`backend/cache.js`).
>
> Numbers in this document combine the Milestone 4 baseline, the M5
> full-dataset reload, the Q7-Q10 restructuring pass, and the final
> `game_review_stats` materialized-view optimization. Reproduce the
> database-side measurements with [`sql/perf_eval.sql`](../sql/perf_eval.sql).

## Test environment

| Component       | Value                                                             |
| --------------- | ----------------------------------------------------------------- |
| Database        | AWS RDS PostgreSQL `db.t3.micro`, single AZ                       |
| PostgreSQL      | 16.x                                                              |
| Game rows       | **126,266**                                                       |
| Review rows     | **29,592,656** (M5 reload — 3.2× the M4 9.28 M-row sample)        |
| Region          | us-east-1                                                         |
| Backend         | Node.js / Express on `localhost:8080` (M4) → Render (M5)          |
| Cache           | `lru-cache` v10, max 500 entries, TTL **24 h** (read-only data)   |
| `pg` pool guard | `statement_timeout = 240 s`, `query_timeout = 250 s` (M5)         |

## Methodology

For each query we collect:

- The chosen plan via `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` (in
  `sql/perf_eval.sql`).
- *Cold* timing — first hit after a fresh server boot. The LRU cache is
  empty, RDS executes the SQL, the result is then cached.
- *Warm* timing — identical subsequent hit. The LRU cache returns the
  cached payload without ever calling Postgres.

Most end-to-end timings were captured with `curl` against the Express
server pointed at the populated RDS instance after `sql/indexes.sql`
and `ANALYZE Review` had been run. The final Q7-Q10 restructuring
pass was captured directly through `sql/perf_eval.sql` with
`EXPLAIN ANALYZE`, because we wanted to inspect whether the database
plan itself changed. The final pass was run after
[`sql/materialized_views.sql`](../sql/materialized_views.sql), which
precomputes per-game review aggregates.

## End-to-end and DB Results

Cold numbers below are M5 measurements against the **29.6 M-row** `Review`
table after `sql/indexes.sql` and `ANALYZE`. M4 numbers (9.28 M rows) are
shown in parentheses for comparison, since the dataset grew 3.2× between
milestones.

| #       | Route                                          | Backing query     | Cold / DB timing      | Warm        | Speed-up   |
| ------- | ---------------------------------------------- | ----------------- | --------------------: | ----------: | ---------: |
| R1      | `/api/games/search?name=catan&limit=20`        | search variant    | ~100 ms (~50 ms)      | <5 ms       | ~20×       |
| R2      | `/api/games/top?limit=8`                       | Q1                | ~70 ms (<20 ms)       | <5 ms       | ~15×       |
| R3      | `/api/games/most-reviewed?limit=8`             | Q2                | 38 s (13.1 s)         | <5 ms       | >7,500×    |
| R4      | `/api/games/:id`                               | Q3                | ~60 ms (<20 ms)       | <5 ms       | ~15×       |
| R5      | `/api/games/:id/reviews?limit=10`              | Q4                | **31 ms** (25.7 s) ¹  | <5 ms       | ~6×        |
| R6      | `/api/games/:id/rating-distribution`           | Q5                | ~270 ms (0.5 s)       | <5 ms       | ~50×       |
| R7      | `/api/games/highly-rated?limit=8`              | Q6                | 35 s (11.1 s)         | <5 ms       | >7,000×    |
| R8      | `/api/games/:id/similar?limit=6`               | auxiliary         | ~1.4 s (<50 ms)       | <5 ms       | ~280×      |
| **R9**  | `/api/games/outperformers-by-year?limit=20`    | **Q7 (complex)**  | **0.94 s** (4.1 s before rewrite; 2.1 s M4) | <5 ms | **~190×** |
| **R10** | `/api/games/review-vs-stored-rating?limit=20`  | **Q8 (complex)**  | **120 ms** (29.9 s before materialized view; 9.0 s M4) | <5 ms | **~24×** |
| **R11** | `/api/games/dormant-top-rated?limit=20`        | **Q9 (complex)**  | **264 ms** (34.6 s before materialized view; 11.8 s M4) | <5 ms | **~53×** |
| **R12** | `/api/games/global-outperformers?limit=20`     | **Q10 (complex)** | **151 ms** (30.5 s before materialized view; 9.5 s M4) | <5 ms | **~30×** |
| R13     | `/api/health`                                  | `SELECT 1`        | <10 ms                | —           | —          |

¹ R5 dropped from **10.2 s → 31 ms (~320×)** on the M5 dataset after a
post-M4 query restructuring; see [§ R5 — recent reviews per game (M5
fix)](#r5--recent-reviews-per-game-m5-fix) below for the EXPLAIN
ANALYZE before/after.

## Per-query analysis (the four complex queries)

### Q7 — outperformers-by-year (R9), 4.1 s → 0.94 s → <5 ms cached

The first optimized version used two correlated subqueries, each
filtering `Game` by `year_published = ?`. Indexing
`Game.year_published` kept that version usable, but the plan still
repeated the same per-year averages many times. The final rewrite
computes a small `year_stats` CTE once, then joins it back to `Game`.
This is the clearest query-restructuring win: `EXPLAIN ANALYZE`
dropped from about **4.1 s to 0.94 s**, and repeated database runs
fell to **178-243 ms** with Postgres buffers warm. The app-layer LRU cache
then makes repeated HTTP hits sub-5 ms.

### Q8 — review-vs-stored-rating (R10), 37 s → 29.9 s → 120 ms → <5 ms cached

The CTE rewrite first aggregated `Review` to one row per `game_id`,
then joined those review statistics to `Game`. That reduced join width
but still required a full scan/group-by of the 29.6 M-row `Review`
table, so cold execution only improved from about **37 s to 29.9 s**.
The final version reads the precomputed `game_review_stats` materialized
view instead. `EXPLAIN ANALYZE` dropped to **120 ms**, and repeated DB
runs were **54-71 ms** before the application cache.

### Q9 — dormant-top-rated (R11), 55 s → 34.6 s → 264 ms → <5 ms cached

The CTE rewrite separated `review_stats` from `recent_games` and used a
left anti-join, improving cold time from about **55 s to 34.6 s**. The
materialized view gives the final query a cheaper test: compare the
precomputed `latest_post_date` against the cutoff. That brought
`EXPLAIN ANALYZE` to **264 ms**, with repeated DB runs at **65-152 ms**.

### Q10 — global-outperformers (R12), 37 s → 30.5 s → 151 ms → <5 ms cached

The CTE rewrite aggregated `Review` before joining to `Game`, improving
cold execution from about **37 s to 30.5 s**. The final version computes
global averages over the 102,983-row `game_review_stats` materialized
view instead of over a fresh aggregation of 29.6 M reviews. `EXPLAIN
ANALYZE` dropped to **151 ms**, and repeated DB runs were **133-619 ms**.
Subsequent application hits are still served from the LRU cache in under
5 ms.

### R5 — recent reviews per game (M5 fix), 10.2 s → 31 ms (~320×)

This was discovered during an end-to-end pass on the M5-scale dataset.
The route is `GET /api/games/:id/reviews` and the original query was:

```sql
SELECT review_id, user_id, rating, comment, post_date
FROM Review
WHERE game_id = $1
ORDER BY post_date DESC NULLS LAST
LIMIT $2;
```

The composite index `idx_review_game_post_date` on
`Review(game_id, post_date DESC)` was already in place, yet the
planner refused to use it for ordering. `EXPLAIN (ANALYZE, BUFFERS)`
on game `224517` (≈ 51 k reviews) showed a
**Bitmap Heap Scan + top-N heapsort over all matching rows**:

```
Limit  (cost=162087.76..162087.79 rows=10) (actual time=10152.265..10154.311)
  Buffers: shared hit=43 read=45909
  I/O Timings: shared read=9231.404
  ->  Sort  (Sort Key: post_date DESC NULLS LAST, top-N heapsort)
        ->  Bitmap Heap Scan on review  (rows=51791, Heap Blocks: exact=45895)
              Recheck Cond: (game_id = 224517)
              ->  Bitmap Index Scan on idx_review_game_post_date
Execution Time: 10160.564 ms
```

**Diagnosis.** A B-tree index on `post_date DESC` orders nulls
**first** by default, but the query asked for `NULLS LAST`. The two
orderings disagree, so the planner could not stream the index in the
requested order; instead it pulled all 51,791 matching `Review` rows
out of the heap (45,895 random page reads, ~9.2 s of I/O) and ran an
in-memory top-N sort.

**Fix.** Tightening the predicate to `WHERE post_date IS NOT NULL`
(0.05 % of `Review` rows have a null `post_date`) and dropping
`NULLS LAST` makes the query's ordering match the index exactly:

```sql
SELECT review_id, user_id, rating, comment, post_date
FROM Review
WHERE game_id = $1 AND post_date IS NOT NULL
ORDER BY post_date DESC
LIMIT $2;
```

`EXPLAIN (ANALYZE, BUFFERS)` after the fix:

```
Limit  (cost=0.44..29.71 rows=10) (actual time=6.479..22.269)
  Buffers: shared hit=7 read=5
  ->  Index Scan using idx_review_game_post_date on review
        Index Cond: ((game_id = 224517) AND (post_date IS NOT NULL))
Execution Time: 31.649 ms
```

Heap pages read: **45,909 → 5**. Execution time:
**10,160 ms → 31.6 ms** (~320×). The index scan walks the requested
`(game_id, post_date DESC)` prefix and stops after the `LIMIT 10`,
which is what the planner should have done in the first place once
the ordering constraints aligned.

This change is in [`backend/server.js`](../backend/server.js) at the
R5 handler.

## Optimization techniques used

1. **Indexing** — see `sql/indexes.sql`:
   - `GIN (name gin_trgm_ops)` on `Game` — R1 trigram + ILIKE search.
   - Partial B-tree on `Game(avg_rating DESC) WHERE avg_rating IS NOT
     NULL` — R2/R7/R10/R12 ordering and filtering.
   - Partial B-tree on `Game(num_voters DESC) WHERE num_voters IS NOT
     NULL` — R2 tie-break, R9 voter filter.
   - Partial B-tree on `Game(year_published) WHERE year_published IS
     NOT NULL` — R1/R9 year-range predicates.
   - Composite B-tree on `Review(game_id, post_date DESC)` — R5 recent
     reviews.
   - Composite B-tree on `Review(game_id, rating)` — R6 histogram and
     pre-materialization Q8/Q10 experiments.
   - Partial B-tree on `Review(post_date) WHERE post_date IS NOT NULL`
     — pre-materialization R11 antijoin experiments.
2. **Query restructuring**:
   - Q7 replaces repeated correlated year-level averages with a
     one-time `year_stats` CTE.
   - The intermediate Q8 and Q10 rewrites aggregated `Review` before
     joining to `Game`, reducing join width but still scanning the full
     review table.
   - The intermediate Q9 rewrite split high-rated review aggregates
     from recent activity and combined them with a left anti-join.
   - The key lesson from `EXPLAIN ANALYZE` was mixed: query
     restructuring was decisive on Q7 and useful on Q8-Q10, but Q8-Q10
     still needed materialization for truly fast cold execution.
3. **Materialized review summary**:
   - [`sql/materialized_views.sql`](../sql/materialized_views.sql)
     creates `game_review_stats`, with one row per game:
     `total_reviews`, `rated_reviews`, `avg_review_rating`, and
     `latest_post_date`.
   - The view has **102,983 rows**, compared with **29,592,656** rows in
     `Review`. Q8-Q10 therefore avoid repeatedly scanning and grouping
     the review table.
   - Indexes on `game_id`, `(avg_review_rating DESC, rated_reviews
     DESC)`, `total_reviews`, and `latest_post_date` support the final
     filters and orderings.
4. **Targeted route fix**:
   - **R5 (M5)**: aligning the query's `ORDER BY` with the index's
     `NULLS` ordering — by adding `WHERE post_date IS NOT NULL` and
     dropping `NULLS LAST` — collapsed a 10.2 s Bitmap Heap Scan into
     a 31 ms Index Scan (see § *R5 — recent reviews per game (M5
     fix)* above).
5. **Application-layer LRU cache** — `backend/cache.js`. Every list
   route is wrapped by `cached(key, loader)`. Repeats served in <5 ms
   independent of underlying SQL cost. **TTL bumped from 5 min (M4)
   to 24 h (M5)** since the underlying data is read-only.
6. **Pool-level safeguards (M5)** — [`backend/db.js`](../backend/db.js)
   sets `statement_timeout = 240 s` and `query_timeout = 250 s` on
   every pooled connection. A query that exceeds the timeout is
   aborted by Postgres and the connection is recycled, so a single
   slow path can no longer permanently tie up one of the 10 pool
   slots.

## Takeaways

1. **Query restructuring is decisive when it removes repeated work.**
   Q7's `year_stats` CTE avoids recomputing the same year-level
   averages and dropped `EXPLAIN ANALYZE` time from about 4.1 s to
   0.94 s.
2. **Materialization is decisive on Q8/Q9/Q10.** Query restructuring
   alone left those queries in the 28-38 s range because they still
   scanned and grouped `Review`. The `game_review_stats` materialized
   view moved the cold path to 120-264 ms by storing per-game aggregates
   once after ingestion.
3. **Caching is now an interaction polish layer rather than the only
   thing making Q8-Q10 usable.** The final cold DB path is interactive,
   and the LRU cache still makes repeated hits sub-5 ms.
4. **`pg_trgm` keeps fuzzy search (R1) sub-200 ms on 126 k `Game`
   rows.** Without the GIN index, the same query plan falls back to a
   sequential scan and is unusable interactively.
5. **Index ordering must match the query's `NULLS` clause.** The R5
   M5 fix is a textbook case: a composite index on
   `Review(game_id, post_date DESC)` gives the planner an
   already-sorted stream, but only if the query's `ORDER BY` doesn't
   contradict the index's null placement. Aligning the two
   collapsed a 10 s Bitmap Heap Scan into a 31 ms Index Scan.
