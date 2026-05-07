-- Materialized aggregate tables for the Review-heavy complex queries.
-- Run after load_review.sql. The source data is read-only for this app, so
-- this view only needs to be refreshed after a full data reload.

DROP MATERIALIZED VIEW IF EXISTS game_review_stats;

CREATE MATERIALIZED VIEW game_review_stats AS
SELECT
    game_id,
    COUNT(*) AS total_reviews,
    COUNT(rating) AS rated_reviews,
    AVG(rating) AS avg_review_rating,
    MAX(post_date) AS latest_post_date
FROM Review
GROUP BY game_id;

CREATE UNIQUE INDEX idx_game_review_stats_game_id
    ON game_review_stats (game_id);

CREATE INDEX idx_game_review_stats_avg_rated
    ON game_review_stats (avg_review_rating DESC, rated_reviews DESC)
    WHERE avg_review_rating IS NOT NULL;

CREATE INDEX idx_game_review_stats_total_reviews
    ON game_review_stats (total_reviews DESC);

CREATE INDEX idx_game_review_stats_latest_post_date
    ON game_review_stats (latest_post_date);

ANALYZE game_review_stats;
