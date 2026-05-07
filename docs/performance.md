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

Timings were captured with `curl` against the Express server pointed at
the populated RDS instance after `sql/indexes.sql` and
`ANALYZE Review` had been run.

## End-to-end results (HTTP, full request cycle)

Cold numbers below are M5 measurements against the **29.6 M-row** `Review`
table after `sql/indexes.sql` and `ANALYZE`. M4 numbers (9.28 M rows) are
shown in parentheses for comparison, since the dataset grew 3.2× between
milestones.

| #       | Route                                          | Backing query     | Cold (M5)             | Warm        | Speed-up   |
| ------- | ---------------------------------------------- | ----------------- | --------------------: | ----------: | ---------: |
| R1      | `/api/games/search?name=catan&limit=20`        | search variant    | ~100 ms (~50 ms)      | <5 ms       | ~20×       |
| R2      | `/api/games/top?limit=8`                       | Q1                | ~70 ms (<20 ms)       | <5 ms       | ~15×       |
| R3      | `/api/games/most-reviewed?limit=8`             | Q2                | 38 s (13.1 s)         | <5 ms       | >7,500×    |
| R4      | `/api/games/:id`                               | Q3                | ~60 ms (<20 ms)       | <5 ms       | ~15×       |
| R5      | `/api/games/:id/reviews?limit=10`              | Q4                | **31 ms** (25.7 s) ¹  | <5 ms       | ~6×        |
| R6      | `/api/games/:id/rating-distribution`           | Q5                | ~270 ms (0.5 s)       | <5 ms       | ~50×       |
| R7      | `/api/games/highly-rated?limit=8`              | Q6                | 35 s (11.1 s)         | <5 ms       | >7,000×    |
| R8      | `/api/games/:id/similar?limit=6`               | auxiliary         | ~1.4 s (<50 ms)       | <5 ms       | ~280×      |
| **R9**  | `/api/games/outperformers-by-year?limit=20`    | **Q7 (complex)**  | **4.1 s** (2.1 s)     | <5 ms       | **~800×**  |
| **R10** | `/api/games/review-vs-stored-rating?limit=20`  | **Q8 (complex)**  | **37 s** (9.0 s)      | <5 ms       | **~7,400×** |
| **R11** | `/api/games/dormant-top-rated?limit=20`        | **Q9 (complex)**  | **55 s** (11.8 s)     | <5 ms       | **~11,000×** |
| **R12** | `/api/games/global-outperformers?limit=20`     | **Q10 (complex)** | **37 s** (9.5 s)      | <5 ms       | **~7,400×** |
| R13     | `/api/health`                                  | `SELECT 1`        | <10 ms                | —           | —          |

¹ R5 dropped from **10.2 s → 31 ms (~320×)** on the M5 dataset after a
post-M4 query restructuring; see [§ R5 — recent reviews per game (M5
fix)](#r5--recent-reviews-per-game-m5-fix) below for the EXPLAIN
ANALYZE before/after.

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
across the 29.6 M-row `Review` table.

### Q10 — global-outperformers (R12), 9.5 s → <5 ms (>1,900×)

Two CTEs. `game_review_stats` aggregates per game; `global_stats`
averages those aggregates once. The composite
`idx_review_game_rating` lets the per-game CTE be served by an
index-driven aggregate. The CTE structure also matters: an earlier
draft of the query computed the global mean as a correlated subquery
inside the SELECT list, which forced Postgres to recompute it once per
output row — replacing it with a single-row CTE was a >2× speed-up
even before indexing.

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
     reviews, R11 antijoin.
   - Composite B-tree on `Review(game_id, rating)` — R6 histogram, R8
     aggregation, R10 covering index.
   - Partial B-tree on `Review(post_date) WHERE post_date IS NOT NULL`
     — R11 antijoin range bound.
2. **Query restructuring**:
   - Q10 splits the global-mean computation into a separate CTE so it
     runs once per request rather than once per output row.
   - **R5 (M5)**: aligning the query's `ORDER BY` with the index's
     `NULLS` ordering — by adding `WHERE post_date IS NOT NULL` and
     dropping `NULLS LAST` — collapsed a 10.2 s Bitmap Heap Scan into
     a 31 ms Index Scan (see § *R5 — recent reviews per game (M5
     fix)* above).
3. **Application-layer LRU cache** — `backend/cache.js`. Every list
   route is wrapped by `cached(key, loader)`. Repeats served in <5 ms
   independent of underlying SQL cost. **TTL bumped from 5 min (M4)
   to 24 h (M5)** since the underlying data is read-only and the
   complex queries cost 30–60 s cold on the M5 dataset.
4. **Pool-level safeguards (M5)** — [`backend/db.js`](../backend/db.js)
   sets `statement_timeout = 240 s` and `query_timeout = 250 s` on
   every pooled connection. A query that exceeds the timeout is
   aborted by Postgres and the connection is recycled, so a single
   slow path can no longer permanently tie up one of the 10 pool
   slots.

## Takeaways

1. **Indexing is decisive on Q7.** Without `idx_game_year_published`
   the correlated subqueries fall back to a full `Game` scan per outer
   row.
2. **Caching is decisive on Q8/Q9/Q10.** Even after indexing, a
   30–60 second SQL run on the M5 dataset is four to five orders of
   magnitude slower than a 5 ms in-memory read. The LRU cache buys us
   back that distance for every repeat of the same query — and at the
   M5 24 h TTL, one cold hit per page per day amortises across every
   subsequent visitor.
3. **All four complex routes (R9–R12) complete cold within
   `statement_timeout = 240 s` against the full 29.6 M-row `Review`
   table, and under 5 ms warm.** Cold latency grew with the dataset
   (M4 9.3 M rows → M5 29.6 M rows, ≈ 3.2× more), but the warm path
   is invariant — that is the value the cache adds.
4. **`pg_trgm` keeps fuzzy search (R1) sub-200 ms on 126 k `Game`
   rows.** Without the GIN index, the same query plan falls back to a
   sequential scan and is unusable interactively.
5. **Index ordering must match the query's `NULLS` clause.** The R5
   M5 fix is a textbook case: a composite index on
   `Review(game_id, post_date DESC)` gives the planner an
   already-sorted stream, but only if the query's `ORDER BY` doesn't
   contradict the index's null placement. Aligning the two
   collapsed a 10 s Bitmap Heap Scan into a 31 ms Index Scan.
