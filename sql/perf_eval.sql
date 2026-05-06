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
SELECT g.game_id, g.name, g.year_published, g.num_voters, g.avg_rating
FROM Game g
WHERE g.year_published IS NOT NULL
  AND g.num_voters IS NOT NULL
  AND g.num_voters > (
      SELECT AVG(g2.num_voters)
      FROM Game g2
      WHERE g2.year_published = g.year_published
        AND g2.num_voters IS NOT NULL
  )
  AND g.avg_rating > (
      SELECT AVG(g3.avg_rating)
      FROM Game g3
      WHERE g3.year_published = g.year_published
        AND g3.avg_rating IS NOT NULL
  )
ORDER BY g.year_published DESC, g.num_voters DESC
LIMIT 20;

\echo '======================== Q7 TIMED RUN 1 ========================'
SELECT COUNT(*) FROM (
    SELECT g.game_id
    FROM Game g
    WHERE g.year_published IS NOT NULL
      AND g.num_voters IS NOT NULL
      AND g.num_voters > (SELECT AVG(g2.num_voters) FROM Game g2
                          WHERE g2.year_published = g.year_published
                            AND g2.num_voters IS NOT NULL)
      AND g.avg_rating  > (SELECT AVG(g3.avg_rating)  FROM Game g3
                          WHERE g3.year_published = g.year_published
                            AND g3.avg_rating  IS NOT NULL)
    ORDER BY g.year_published DESC, g.num_voters DESC
    LIMIT 20
) t;

\echo '======================== Q7 TIMED RUN 2 (warm cache) ========================'
SELECT COUNT(*) FROM (
    SELECT g.game_id
    FROM Game g
    WHERE g.year_published IS NOT NULL
      AND g.num_voters IS NOT NULL
      AND g.num_voters > (SELECT AVG(g2.num_voters) FROM Game g2
                          WHERE g2.year_published = g.year_published
                            AND g2.num_voters IS NOT NULL)
      AND g.avg_rating  > (SELECT AVG(g3.avg_rating)  FROM Game g3
                          WHERE g3.year_published = g.year_published
                            AND g3.avg_rating  IS NOT NULL)
    ORDER BY g.year_published DESC, g.num_voters DESC
    LIMIT 20
) t;


-- ---------------------------------------------------------------------
-- Q8 — review-vs-stored-rating (R10)
-- ---------------------------------------------------------------------
\echo '======================== Q8 EXPLAIN ========================'
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT g.game_id, g.name, g.avg_rating AS stored_game_rating,
       ROUND(AVG(r.rating)::numeric, 2) AS review_avg_rating,
       COUNT(r.review_id) AS review_count
FROM Game g
JOIN Review r ON g.game_id = r.game_id
WHERE r.rating IS NOT NULL
  AND g.avg_rating IS NOT NULL
GROUP BY g.game_id, g.name, g.avg_rating
HAVING COUNT(r.review_id) >= 100
   AND AVG(r.rating) > g.avg_rating
ORDER BY review_avg_rating DESC, review_count DESC
LIMIT 20;

\echo '======================== Q8 TIMED RUN 1 ========================'
SELECT COUNT(*) FROM (
    SELECT g.game_id
    FROM Game g
    JOIN Review r ON g.game_id = r.game_id
    WHERE r.rating IS NOT NULL AND g.avg_rating IS NOT NULL
    GROUP BY g.game_id, g.avg_rating
    HAVING COUNT(r.review_id) >= 100 AND AVG(r.rating) > g.avg_rating
    LIMIT 20
) t;

\echo '======================== Q8 TIMED RUN 2 (warm cache) ========================'
SELECT COUNT(*) FROM (
    SELECT g.game_id
    FROM Game g
    JOIN Review r ON g.game_id = r.game_id
    WHERE r.rating IS NOT NULL AND g.avg_rating IS NOT NULL
    GROUP BY g.game_id, g.avg_rating
    HAVING COUNT(r.review_id) >= 100 AND AVG(r.rating) > g.avg_rating
    LIMIT 20
) t;


-- ---------------------------------------------------------------------
-- Q9 — dormant-top-rated (R11)
-- ---------------------------------------------------------------------
\echo '======================== Q9 EXPLAIN ========================'
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT g.game_id, g.name, g.avg_rating, COUNT(r.review_id) AS total_reviews
FROM Game g
JOIN Review r ON g.game_id = r.game_id
WHERE g.avg_rating IS NOT NULL
GROUP BY g.game_id, g.name, g.avg_rating
HAVING AVG(r.rating) >= 8
   AND COUNT(r.review_id) >= 100
   AND NOT EXISTS (
       SELECT 1 FROM Review r2
       WHERE r2.game_id = g.game_id AND r2.post_date >= DATE '2024-01-01'
   )
ORDER BY total_reviews DESC
LIMIT 20;

\echo '======================== Q9 TIMED RUN 1 ========================'
SELECT COUNT(*) FROM (
    SELECT g.game_id
    FROM Game g
    JOIN Review r ON g.game_id = r.game_id
    WHERE g.avg_rating IS NOT NULL
    GROUP BY g.game_id
    HAVING AVG(r.rating) >= 8
       AND COUNT(r.review_id) >= 100
       AND NOT EXISTS (
           SELECT 1 FROM Review r2
           WHERE r2.game_id = g.game_id AND r2.post_date >= DATE '2024-01-01'
       )
    LIMIT 20
) t;

\echo '======================== Q9 TIMED RUN 2 (warm cache) ========================'
SELECT COUNT(*) FROM (
    SELECT g.game_id
    FROM Game g
    JOIN Review r ON g.game_id = r.game_id
    WHERE g.avg_rating IS NOT NULL
    GROUP BY g.game_id
    HAVING AVG(r.rating) >= 8
       AND COUNT(r.review_id) >= 100
       AND NOT EXISTS (
           SELECT 1 FROM Review r2
           WHERE r2.game_id = g.game_id AND r2.post_date >= DATE '2024-01-01'
       )
    LIMIT 20
) t;


-- ---------------------------------------------------------------------
-- Q10 — global-outperformers (R12)
-- ---------------------------------------------------------------------
\echo '======================== Q10 EXPLAIN ========================'
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
WITH game_review_stats AS (
    SELECT g.game_id, g.name,
           COUNT(r.review_id) AS review_count,
           AVG(r.rating)      AS avg_review_rating
    FROM Game g
    JOIN Review r ON g.game_id = r.game_id
    WHERE r.rating IS NOT NULL
    GROUP BY g.game_id, g.name
),
global_stats AS (
    SELECT AVG(avg_review_rating) AS global_avg_rating,
           AVG(review_count)       AS global_avg_review_count
    FROM game_review_stats
)
SELECT grs.game_id, grs.name,
       grs.review_count,
       ROUND(grs.avg_review_rating::numeric, 2) AS avg_review_rating
FROM game_review_stats grs, global_stats gs
WHERE grs.avg_review_rating > gs.global_avg_rating
  AND grs.review_count     > gs.global_avg_review_count
ORDER BY grs.avg_review_rating DESC, grs.review_count DESC
LIMIT 20;

\echo '======================== Q10 TIMED RUN 1 ========================'
WITH game_review_stats AS (
    SELECT g.game_id, COUNT(r.review_id) AS review_count, AVG(r.rating) AS avg_review_rating
    FROM Game g JOIN Review r ON g.game_id = r.game_id
    WHERE r.rating IS NOT NULL GROUP BY g.game_id
),
global_stats AS (
    SELECT AVG(avg_review_rating) AS gar, AVG(review_count) AS garc
    FROM game_review_stats
)
SELECT COUNT(*) FROM game_review_stats grs, global_stats gs
WHERE grs.avg_review_rating > gs.gar AND grs.review_count > gs.garc;

\echo '======================== Q10 TIMED RUN 2 (warm cache) ========================'
WITH game_review_stats AS (
    SELECT g.game_id, COUNT(r.review_id) AS review_count, AVG(r.rating) AS avg_review_rating
    FROM Game g JOIN Review r ON g.game_id = r.game_id
    WHERE r.rating IS NOT NULL GROUP BY g.game_id
),
global_stats AS (
    SELECT AVG(avg_review_rating) AS gar, AVG(review_count) AS garc
    FROM game_review_stats
)
SELECT COUNT(*) FROM game_review_stats grs, global_stats gs
WHERE grs.avg_review_rating > gs.gar AND grs.review_count > gs.garc;
