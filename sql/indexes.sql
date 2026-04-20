-- Milestone 4 optimization: indexes + pg_trgm for fuzzy search.
-- Run once against the RDS Postgres instance after schema.sql + data load.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- R1 /api/games/search: ILIKE '%q%' and fuzzy (name % $1) matching.
CREATE INDEX IF NOT EXISTS idx_game_name_trgm
    ON Game USING GIN (name gin_trgm_ops);

-- R2 top rated / R7 highly rated. Partial avoids NULL rows.
CREATE INDEX IF NOT EXISTS idx_game_avg_rating
    ON Game (avg_rating DESC)
    WHERE avg_rating IS NOT NULL;

-- R2 / listing sorts that break ties on popularity.
CREATE INDEX IF NOT EXISTS idx_game_num_voters
    ON Game (num_voters DESC)
    WHERE num_voters IS NOT NULL;

-- R9 outperformers-by-year (correlated subqueries group by year_published).
CREATE INDEX IF NOT EXISTS idx_game_year_published
    ON Game (year_published)
    WHERE year_published IS NOT NULL;

-- R4 recent reviews for a game (WHERE game_id = $1 ORDER BY post_date DESC).
CREATE INDEX IF NOT EXISTS idx_review_game_post_date
    ON Review (game_id, post_date DESC);

-- R5 rating distribution, R3/R6/R8/R10 joins on game_id + rating aggregates.
CREATE INDEX IF NOT EXISTS idx_review_game_rating
    ON Review (game_id, rating);

-- R11 dormant top-rated (NOT EXISTS scan over post_date >= DATE '2024-01-01').
CREATE INDEX IF NOT EXISTS idx_review_post_date
    ON Review (post_date)
    WHERE post_date IS NOT NULL;

ANALYZE Game;
ANALYZE Review;
