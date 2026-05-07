-- =====================================================================
-- perf_eval.sql — measure the 4 complex queries (Q7..Q10)
-- before/after the indexes from indexes.sql.
--
-- How to use:
--   1. Capture BASELINE (no indexes):
--        psql $DATABASE_URL -f sql/schema.sql
--        psql $DATABASE_URL -f sql/load_game.sql
--        psql $DATABASE_URL -f sql/load_review.sql
--        psql $DATABASE_URL -c "ANALYZE;"
--        psql $DATABASE_URL -f sql/perf_eval.sql > docs/perf_baseline.txt
--
--   2. Apply indexes and re-run:
--        psql $DATABASE_URL -f sql/indexes.sql
--        psql $DATABASE_URL -f sql/perf_eval.sql > docs/perf_indexed.txt
--
--   3. Diff the two files. Numbers go into docs/performance.md.
--
-- The `EXPLAIN (ANALYZE, BUFFERS)` output gives both the chosen plan and
-- wall-clock timing. We also run each query twice via \timing so the
-- second run captures buffer-cache-warm timings.
-- =====================================================================

\timing on
\set ECHO queries

-- ---------------------------------------------------------------------
-- Q7 — outperformers-by-year (R9)
-- ---------------------------------------------------------------------
\echo '======================== Q7 EXPLAIN ========================'
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
WITH year_stats AS (
    SELECT year_published,
           AVG(num_voters) AS avg_year_voters,
           AVG(avg_rating) AS avg_year_rating
    FROM Game
    WHERE year_published IS NOT NULL
    GROUP BY year_published
)
SELECT g.game_id, g.name, g.year_published, g.num_voters, g.avg_rating
FROM Game g
JOIN year_stats ys ON g.year_published = ys.year_published
WHERE g.avg_rating IS NOT NULL
  AND g.num_voters IS NOT NULL
  AND g.num_voters > ys.avg_year_voters
  AND g.avg_rating > ys.avg_year_rating
ORDER BY g.year_published DESC, g.num_voters DESC
LIMIT 20;

\echo '======================== Q7 TIMED RUN 1 ========================'
SELECT COUNT(*) FROM (
    WITH year_stats AS (
        SELECT year_published,
               AVG(num_voters) AS avg_year_voters,
               AVG(avg_rating) AS avg_year_rating
        FROM Game
        WHERE year_published IS NOT NULL
        GROUP BY year_published
    )
    SELECT g.game_id
    FROM Game g
    JOIN year_stats ys ON g.year_published = ys.year_published
    WHERE g.avg_rating IS NOT NULL
      AND g.num_voters IS NOT NULL
      AND g.num_voters > ys.avg_year_voters
      AND g.avg_rating > ys.avg_year_rating
    ORDER BY g.year_published DESC, g.num_voters DESC
    LIMIT 20
) t;

\echo '======================== Q7 TIMED RUN 2 (warm cache) ========================'
SELECT COUNT(*) FROM (
    WITH year_stats AS (
        SELECT year_published,
               AVG(num_voters) AS avg_year_voters,
               AVG(avg_rating) AS avg_year_rating
        FROM Game
        WHERE year_published IS NOT NULL
        GROUP BY year_published
    )
    SELECT g.game_id
    FROM Game g
    JOIN year_stats ys ON g.year_published = ys.year_published
    WHERE g.avg_rating IS NOT NULL
      AND g.num_voters IS NOT NULL
      AND g.num_voters > ys.avg_year_voters
      AND g.avg_rating > ys.avg_year_rating
    ORDER BY g.year_published DESC, g.num_voters DESC
    LIMIT 20
) t;


-- ---------------------------------------------------------------------
-- Q8 — review-vs-stored-rating (R10)
-- ---------------------------------------------------------------------
\echo '======================== Q8 EXPLAIN ========================'
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT g.game_id, g.name, g.avg_rating AS stored_game_rating,
       ROUND(grs.avg_review_rating::numeric, 2) AS review_avg_rating,
       grs.rated_reviews AS review_count
FROM Game g
JOIN game_review_stats grs ON g.game_id = grs.game_id
WHERE g.avg_rating IS NOT NULL
  AND grs.rated_reviews >= 100
  AND grs.avg_review_rating > g.avg_rating
ORDER BY review_avg_rating DESC, review_count DESC
LIMIT 20;

\echo '======================== Q8 TIMED RUN 1 ========================'
SELECT COUNT(*) FROM (
    SELECT g.game_id
    FROM Game g
    JOIN game_review_stats grs ON g.game_id = grs.game_id
    WHERE g.avg_rating IS NOT NULL
      AND grs.rated_reviews >= 100
      AND grs.avg_review_rating > g.avg_rating
    LIMIT 20
) t;

\echo '======================== Q8 TIMED RUN 2 (warm cache) ========================'
SELECT COUNT(*) FROM (
    SELECT g.game_id
    FROM Game g
    JOIN game_review_stats grs ON g.game_id = grs.game_id
    WHERE g.avg_rating IS NOT NULL
      AND grs.rated_reviews >= 100
      AND grs.avg_review_rating > g.avg_rating
    LIMIT 20
) t;


-- ---------------------------------------------------------------------
-- Q9 — dormant-top-rated (R11)
-- ---------------------------------------------------------------------
\echo '======================== Q9 EXPLAIN ========================'
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT g.game_id, g.name, g.avg_rating, grs.total_reviews
FROM Game g
JOIN game_review_stats grs ON g.game_id = grs.game_id
WHERE g.avg_rating IS NOT NULL
  AND grs.total_reviews >= 100
  AND grs.avg_review_rating >= 8
  AND (grs.latest_post_date IS NULL OR grs.latest_post_date < DATE '2024-01-01')
ORDER BY total_reviews DESC
LIMIT 20;

\echo '======================== Q9 TIMED RUN 1 ========================'
SELECT COUNT(*) FROM (
    SELECT g.game_id
    FROM Game g
    JOIN game_review_stats grs ON g.game_id = grs.game_id
    WHERE g.avg_rating IS NOT NULL
      AND grs.total_reviews >= 100
      AND grs.avg_review_rating >= 8
      AND (grs.latest_post_date IS NULL OR grs.latest_post_date < DATE '2024-01-01')
    LIMIT 20
) t;

\echo '======================== Q9 TIMED RUN 2 (warm cache) ========================'
SELECT COUNT(*) FROM (
    SELECT g.game_id
    FROM Game g
    JOIN game_review_stats grs ON g.game_id = grs.game_id
    WHERE g.avg_rating IS NOT NULL
      AND grs.total_reviews >= 100
      AND grs.avg_review_rating >= 8
      AND (grs.latest_post_date IS NULL OR grs.latest_post_date < DATE '2024-01-01')
    LIMIT 20
) t;


-- ---------------------------------------------------------------------
-- Q10 — global-outperformers (R12)
-- ---------------------------------------------------------------------
\echo '======================== Q10 EXPLAIN ========================'
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
WITH global_stats AS (
    SELECT AVG(avg_review_rating) AS global_avg_rating,
           AVG(rated_reviews)       AS global_avg_review_count
    FROM game_review_stats
    WHERE avg_review_rating IS NOT NULL
)
SELECT grs.game_id, g.name,
       grs.rated_reviews AS review_count,
       ROUND(grs.avg_review_rating::numeric, 2) AS avg_review_rating
FROM game_review_stats grs
JOIN global_stats gs ON TRUE
JOIN Game g ON grs.game_id = g.game_id
WHERE grs.avg_review_rating > gs.global_avg_rating
  AND grs.rated_reviews > gs.global_avg_review_count
ORDER BY grs.avg_review_rating DESC, grs.rated_reviews DESC
LIMIT 20;

\echo '======================== Q10 TIMED RUN 1 ========================'
WITH global_stats AS (
    SELECT AVG(avg_review_rating) AS gar, AVG(rated_reviews) AS garc
    FROM game_review_stats
    WHERE avg_review_rating IS NOT NULL
)
SELECT COUNT(*) FROM game_review_stats grs, global_stats gs
WHERE grs.avg_review_rating > gs.gar AND grs.rated_reviews > gs.garc;

\echo '======================== Q10 TIMED RUN 2 (warm cache) ========================'
WITH global_stats AS (
    SELECT AVG(avg_review_rating) AS gar, AVG(rated_reviews) AS garc
    FROM game_review_stats
    WHERE avg_review_rating IS NOT NULL
)
SELECT COUNT(*) FROM game_review_stats grs, global_stats gs
WHERE grs.avg_review_rating > gs.gar AND grs.rated_reviews > gs.garc;
