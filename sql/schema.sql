DROP TABLE IF EXISTS Review;
DROP TABLE IF EXISTS Game;
DROP TABLE IF EXISTS raw_reviews_csv;
DROP TABLE IF EXISTS raw_boardgames_csv;

CREATE TABLE Game (
    game_id INT PRIMARY KEY,
    name TEXT,
    description TEXT,
    year_published INT,
    min_players INT,
    max_players INT,
    min_playtime INT,
    max_playtime INT,
    min_age INT,
    image_url TEXT,
    thumbnail TEXT,
    avg_rating FLOAT,
    geek_rating FLOAT,
    num_voters INT,
    rank INT,
    complexity FLOAT
);

CREATE TABLE Review (
    review_id BIGINT PRIMARY KEY,
    game_id INT REFERENCES Game(game_id),
    user_id VARCHAR(255),
    comment TEXT,
    comment_timestamp TIMESTAMP,
    rating FLOAT,
    rating_timestamp TIMESTAMP,
    post_date DATE
);

CREATE TABLE raw_boardgames_csv (
    rank INT,
    game_id INT,
    title TEXT,
    description TEXT,
    year INT,
    geekrating FLOAT,
    avgrating FLOAT,
    voters INT,
    link TEXT,
    thumbnail TEXT
);

CREATE TABLE raw_reviews_csv (
    game_id INT,
    reviewid BIGINT,
    user_pseudouserid TEXT,
    textfield_comment_value TEXT,
    textfield_comment_tstamp TEXT,
    rating FLOAT,
    rating_tstamp TEXT,
    postdate TEXT
);
