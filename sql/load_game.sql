-- =====================================================================
-- load_game.sql — populate the Game table from raw_boardgames_csv.
-- Run order: AFTER schema.sql + after raw_boardgames_csv has been
-- populated via `COPY raw_boardgames_csv FROM 'boardgames.csv' ...`.
-- Idempotent: TRUNCATE removes any prior load before re-inserting.
-- =====================================================================

TRUNCATE TABLE Game CASCADE;   -- CASCADE also clears Review (FK)

INSERT INTO Game (
    game_id,
    name,
    description,
    year_published,
    thumbnail,
    avg_rating,
    geek_rating,
    num_voters,
    rank
)
SELECT
    raw.game_id,
    NULLIF(TRIM(raw.title), ''),
    NULLIF(TRIM(raw.description), ''),
    raw.year,
    NULLIF(TRIM(raw.thumbnail), ''),
    raw.avgrating,
    raw.geekrating,
    raw.voters,
    raw.rank
FROM (
    -- Deduplicate by game_id, keeping the row with the best (lowest) rank.
    -- The Kaggle export occasionally has duplicate game_ids when a game
    -- appears in both the main and expansions feeds.
    SELECT DISTINCT ON (r.game_id)
        r.game_id,
        r.title,
        r.description,
        r.year,
        r.thumbnail,
        r.avgrating,
        r.geekrating,
        r.voters,
        r.rank
    FROM raw_boardgames_csv r
    WHERE r.game_id IS NOT NULL
      AND r.title  IS NOT NULL
    ORDER BY r.game_id, r.rank ASC NULLS LAST
) raw;

-- Sanity check (run interactively, not part of the load):
--   SELECT COUNT(*) AS games_loaded FROM Game;
