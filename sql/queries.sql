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
SELECT
    g.game_id,
    g.name,
    g.year_published,
    g.num_voters,
    g.avg_rating
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

-- Query 8 (Complex): Games Whose Review Average Exceeds Their Stored Game Average
SELECT
    g.game_id,
    g.name,
    g.avg_rating AS stored_game_rating,
    ROUND(AVG(r.rating)::numeric, 2) AS review_avg_rating,
    COUNT(r.review_id) AS review_count
FROM Game g
JOIN Review r
    ON g.game_id = r.game_id
WHERE r.rating IS NOT NULL
  AND g.avg_rating IS NOT NULL
GROUP BY g.game_id, g.name, g.avg_rating
HAVING COUNT(r.review_id) >= 100
   AND AVG(r.rating) > g.avg_rating
ORDER BY review_avg_rating DESC, review_count DESC
LIMIT 20;

-- Query 9 (Complex): Games with High Ratings but No Recent Reviews
SELECT
    g.game_id,
    g.name,
    g.avg_rating,
    COUNT(r.review_id) AS total_reviews
FROM Game g
JOIN Review r
    ON g.game_id = r.game_id
WHERE g.avg_rating IS NOT NULL
GROUP BY g.game_id, g.name, g.avg_rating
HAVING AVG(r.rating) >= 8
   AND COUNT(r.review_id) >= 100
   AND NOT EXISTS (
       SELECT 1
       FROM Review r2
       WHERE r2.game_id = g.game_id
         AND r2.post_date >= DATE '2024-01-01'
   )
ORDER BY total_reviews DESC
LIMIT 20;

-- Query 10 (Complex): Games That Beat the Global Average in Both Rating and Engagement
WITH game_review_stats AS (
    SELECT
        g.game_id,
        g.name,
        COUNT(r.review_id) AS review_count,
        AVG(r.rating) AS avg_review_rating
    FROM Game g
    JOIN Review r
        ON g.game_id = r.game_id
    WHERE r.rating IS NOT NULL
    GROUP BY g.game_id, g.name
),
global_stats AS (
    SELECT
        AVG(avg_review_rating) AS global_avg_rating,
        AVG(review_count) AS global_avg_review_count
    FROM game_review_stats
)
SELECT
    grs.game_id,
    grs.name,
    grs.review_count,
    ROUND(grs.avg_review_rating::numeric, 2) AS avg_review_rating
FROM game_review_stats grs, global_stats gs
WHERE grs.avg_review_rating > gs.global_avg_rating
  AND grs.review_count > gs.global_avg_review_count
ORDER BY grs.avg_review_rating DESC, grs.review_count DESC
LIMIT 20;
