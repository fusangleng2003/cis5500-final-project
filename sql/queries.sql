-- Query 1: Top Rated Games
SELECT
    game_id,
    name,
    year_published,
    avg_rating,
    geek_rating,
    num_voters,
    rank
FROM Game
WHERE avg_rating IS NOT NULL
ORDER BY avg_rating DESC, num_voters DESC
LIMIT 20;

-- Query 2: Most Reviewed Games
SELECT
    g.game_id,
    g.name,
    COUNT(r.review_id) AS review_count,
    AVG(r.rating) AS avg_review_rating
FROM Game g
JOIN Review r
    ON g.game_id = r.game_id
GROUP BY g.game_id, g.name
ORDER BY review_count DESC
LIMIT 20;

-- Query 3: Game Detail Lookup
SELECT
    game_id,
    name,
    description,
    year_published,
    min_players,
    max_players,
    min_playtime,
    max_playtime,
    min_age,
    avg_rating,
    geek_rating,
    num_voters,
    rank,
    complexity,
    thumbnail
FROM Game
WHERE game_id = 1265;

-- Query 4: Recent Reviews for a Game
SELECT
    review_id,
    user_id,
    rating,
    comment,
    post_date
FROM Review
WHERE game_id = 1265
ORDER BY post_date DESC NULLS LAST
LIMIT 20;

-- Query 5: Rating Distribution for a Game
SELECT
    FLOOR(rating) AS rating_bucket,
    COUNT(*) AS review_count
FROM Review
WHERE game_id = 1265
  AND rating IS NOT NULL
GROUP BY FLOOR(rating)
ORDER BY rating_bucket;

-- Query 6: Highly Rated Games with Significant Review Volume
SELECT
    g.game_id,
    g.name,
    COUNT(r.review_id) AS review_count,
    ROUND(AVG(r.rating)::numeric, 2) AS avg_review_rating
FROM Game g
JOIN Review r
    ON g.game_id = r.game_id
WHERE r.rating IS NOT NULL
GROUP BY g.game_id, g.name
HAVING COUNT(r.review_id) >= 100
ORDER BY avg_review_rating DESC, review_count DESC
LIMIT 20;

-- Query 7 (Complex): Games More Popular Than Average Within Their Release Year
WITH year_stats AS (
    SELECT
        year_published,
        AVG(num_voters) AS avg_year_voters,
        AVG(avg_rating) AS avg_year_rating
    FROM Game
    WHERE year_published IS NOT NULL
    GROUP BY year_published
)
SELECT
    g.game_id,
    g.name,
    g.year_published,
    g.num_voters,
    g.avg_rating
FROM Game g
JOIN year_stats ys
    ON g.year_published = ys.year_published
WHERE g.avg_rating IS NOT NULL
  AND g.num_voters IS NOT NULL
  AND g.num_voters > ys.avg_year_voters
  AND g.avg_rating > ys.avg_year_rating
ORDER BY g.year_published DESC, g.num_voters DESC
LIMIT 20;

-- Query 8 (Complex): Games Whose Review Average Exceeds Their Stored Game Average
SELECT
    g.game_id,
    g.name,
    g.avg_rating AS stored_game_rating,
    ROUND(grs.avg_review_rating::numeric, 2) AS review_avg_rating,
    grs.rated_reviews AS review_count
FROM Game g
JOIN game_review_stats grs
    ON g.game_id = grs.game_id
WHERE g.avg_rating IS NOT NULL
  AND grs.rated_reviews >= 100
  AND grs.avg_review_rating > g.avg_rating
ORDER BY review_avg_rating DESC, review_count DESC
LIMIT 20;

-- Query 9 (Complex): Games with High Ratings but No Recent Reviews
SELECT
    g.game_id,
    g.name,
    g.avg_rating,
    grs.total_reviews
FROM Game g
JOIN game_review_stats grs
    ON g.game_id = grs.game_id
WHERE g.avg_rating IS NOT NULL
  AND grs.total_reviews >= 100
  AND grs.avg_review_rating >= 8
  AND (grs.latest_post_date IS NULL OR grs.latest_post_date < DATE '2024-01-01')
ORDER BY total_reviews DESC
LIMIT 20;

-- Query 10 (Complex): Games That Beat the Global Average in Both Rating and Engagement
WITH global_stats AS (
    SELECT
        AVG(avg_review_rating) AS global_avg_rating,
        AVG(rated_reviews) AS global_avg_review_count
    FROM game_review_stats
    WHERE avg_review_rating IS NOT NULL
)
SELECT
    grs.game_id,
    g.name,
    grs.rated_reviews AS review_count,
    ROUND(grs.avg_review_rating::numeric, 2) AS avg_review_rating
FROM game_review_stats grs
JOIN global_stats gs
    ON TRUE
JOIN Game g
    ON grs.game_id = g.game_id
WHERE grs.avg_review_rating > gs.global_avg_rating
  AND grs.rated_reviews > gs.global_avg_review_count
ORDER BY grs.avg_review_rating DESC, grs.rated_reviews DESC
LIMIT 20;
