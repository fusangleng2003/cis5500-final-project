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
    game_id,
    title,
    description,
    year,
    thumbnail,
    avgrating,
    geekrating,
    voters,
    rank
FROM raw_boardgames_csv
WHERE game_id IS NOT NULL;
