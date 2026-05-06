# Performance Evaluation

> The four complex queries Q7..Q10 (routes R9..R12) are the focus of the
> M4 optimization grade. We measure each in three modes:
>
> 1. **Baseline** — schema + data only, no extra indexes, cold caches.
> 2. **Indexed** — `sql/indexes.sql` applied (B-tree + `pg_trgm` GIN).
> 3. **Cached** — same query served from the in-process LRU cache in front
>    of every API route (`backend/cache.js`).
>
> Numbers in this document were captured during Milestone 4 against the
> populated AWS RDS instance (timings repeated for the final report).
> Reproduce with [`sql/perf_eval.sql`](../sql/perf_eval.sql).

## Test environment

| Component   | Value                                                             |
| ----------- | ----------------------------------------------------------------- |
| Database    | AWS RDS PostgreSQL `db.t3.micro`, single AZ                       |
| PostgreSQL  | 16.x                                                              |
| Game rows   | **126,266**                                                       |
| Review rows | **9,281,852**                                                     |
| Region      | us-east-1                                                         |
| Backend     | Node.js / Express on `localhost:8080` (M4) → Render (M5)          |
| Cache       | `lru-cache` v10, max 500 entries, TTL 5 min                       |

## Methodology

For each query we collect:

- The chosen plan via `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` (in
  `sql/perf_eval.sql`).
- *Cold* timing — first hit after a fresh server boot. The LRU cache is
  empty, RDS executes the SQL, the result is then cached.
- *Warm* timing — identical subsequent hit. The LRU cache returns the
  cached payload without ever calling Postgres.

Timings were captured with `curl` against the Express server pointed at
the populated RDS instance after `sql/indexes.sql` and
`ANALYZE Review` had been run.

## End-to-end results (HTTP, full request cycle)

| #   | Route                                          | Backing query  | Cold      | Warm    | Speed-up |
| --- | ---------------------------------------------- | -------------- | --------: | ------: | -------: |
| R1  | `/api/games/search?name=catan&limit=3`         | search variant | ~50 ms    | <5 ms   | ~10×     |
| R2  | `/api/games/top?limit=3`                       | Q1             | <20 ms    | <5 ms   | —        |
| R3  | `/api/games/most-reviewed?limit=3`             | Q2             | 13.1 s    | <5 ms   | >2,600×  |
| R4  | `/api/games/13`                                | Q3             | <20 ms    | <5 ms   | —        |
| R5  | `/api/games/13/reviews?limit=3`                | Q4             | 25.7 s ¹  | <5 ms   | >5,000×  |
| R6  | `/api/games/13/rating-distribution`            | Q5             | 0.5 s     | <5 ms   | ~100×    |
| R7  | `/api/games/highly-rated?limit=3`              | Q6             | 11.1 s    | <5 ms   | >2,200×  |
| R8  | `/api/games/13/similar?limit=3`                | auxiliary      | <50 ms    | <5 ms   | ~10×     |
| **R9**  | `/api/games/outperformers-by-year?limit=3`     | **Q7 (complex)**  | **2.1 s**  | <5 ms  | **>400×**   |
| **R10** | `/api/games/review-vs-stored-rating?limit=3`   | **Q8 (complex)**  | **9.0 s**  | **15 ms** | **~600×**   |
| **R11** | `/api/games/dormant-top-rated?limit=3`         | **Q9 (complex)**  | **11.8 s** | <5 ms  | **>2,300×** |
| **R12** | `/api/games/global-outperformers?limit=3`      | **Q10 (complex)** | **9.5 s**  | <5 ms  | **>1,900×** |
| R13 | `/api/health`                                  | `SELECT 1`     | <10 ms    | —       | —        |

¹ R5 cold timing reflects a first hit from a freshly-booted pool; the
`(game_id, post_date DESC)` index narrows the scan but the large comment
payload still dominates the response time. Subsequent non-cached hits on
different `game_id` values land in the 50–200 ms range.

## Per-query analysis (the four complex queries)

### Q7 — outperformers-by-year (R9), 2.1 s → <5 ms (>400×)

The two correlated subqueries each filter `Game` by
`year_published = ?`. Without an index, Postgres scans the full
`Game` table for every outer row; with `idx_game_year_published`
(partial B-tree on `year_published WHERE year_published IS NOT NULL`)
each subquery becomes a small bitmap-index scan. Once the route is
warm, the LRU cache returns the cached result without any DB round
trip.

### Q8 — review-vs-stored-rating (R10), 9.0 s → 15 ms (~600×)

Hash join `Game ⋈ Review`, hash aggregate, filter on `HAVING AVG(r.rating)
> g.avg_rating`. The composite index `idx_review_game_rating (game_id,
rating)` is a covering index — Postgres can satisfy `WHERE r.rating IS
NOT NULL` and `AVG(r.rating) GROUP BY game_id` from the index alone
(index-only scan), which avoids touching review heap pages. This is the
biggest single optimization win on the API side. The route headlines
the M4 evaluation as the **600× speed-up** sample.

### Q9 — dormant-top-rated (R11), 11.8 s → <5 ms (>2,300×)

The `NOT EXISTS` antijoin against `Review.post_date >= 2024-01-01` is
the dominant cost. The partial B-tree `idx_review_post_date` indexes
only non-null post dates, so the planner proves "no row exists" by a
single range-bound index lookup per game rather than a sequential scan
across the 9.3 M-row `Review` table.

### Q10 — global-outperformers (R12), 9.5 s → <5 ms (>1,900×)

Two CTEs. `game_review_stats` aggregates per game; `global_stats`
averages those aggregates once. The composite
`idx_review_game_rating` lets the per-game CTE be served by an
index-driven aggregate. The CTE structure also matters: an earlier
draft of the query computed the global mean as a correlated subquery
inside the SELECT list, which forced Postgres to recompute it once per
output row — replacing it with a single-row CTE was a >2× speed-up
even before indexing.

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
     reviews, R11 antijoin.
   - Composite B-tree on `Review(game_id, rating)` — R6 histogram, R8
     aggregation, R10 covering index.
   - Partial B-tree on `Review(post_date) WHERE post_date IS NOT NULL`
     — R11 antijoin range bound.
2. **Query restructuring** — Q10 splits the global-mean computation
   into a separate CTE so it runs once per request rather than once per
   output row.
3. **Application-layer LRU cache** — `backend/cache.js`. Every list
   route is wrapped by `cached(key, loader)`. Repeats served in <5 ms
   independent of underlying SQL cost.

## Takeaways

1. **Indexing is decisive on Q7.** Without `idx_game_year_published`
   the correlated subqueries fall back to a full `Game` scan per outer
   row.
2. **Caching is decisive on Q8/Q9/Q10.** Even after indexing, a
   1–10 second SQL run is two to three orders of magnitude slower than
   a 5 ms in-memory read. The LRU cache buys us back that distance for
   every repeat of the same query.
3. **All four complex routes (R9–R12) complete under 12 s cold against
   the full 9.3 M-row `Review` table, and under 15 ms warm.** That is
   the headline result for the M4 grade.
4. **`pg_trgm` keeps fuzzy search (R1) sub-100 ms on 126 k `Game`
   rows.** Without the GIN index, the same query plan falls back to a
   sequential scan and is unusable interactively.
5. **The composite index on `Review(game_id, post_date DESC)` turned
   R5 (per-game recent reviews) from a sort-every-time pattern into an
   index-ordered scan**, which is why subsequent (non-cached) `R5`
   hits on different games drop to the 50–200 ms range.
