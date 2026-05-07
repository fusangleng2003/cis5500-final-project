-- =====================================================================
-- Board Game Recommendation and Strategy Explorer — schema
-- CIS 5500 Spring 2026
-- =====================================================================
-- Two business tables (Game, Review) and two raw staging tables used only
-- during the load pipeline. Run order:
--   1) schema.sql        (this file)
--   2) load_game.sql     (after raw_boardgames_csv is populated)
--   3) load_review.sql   (after raw_reviews_csv is populated)
--   4) indexes.sql       (after both inserts complete)
-- =====================================================================

DROP TABLE IF EXISTS Review;
DROP TABLE IF EXISTS Game;
DROP TABLE IF EXISTS raw_reviews_csv;
DROP TABLE IF EXISTS raw_boardgames_csv;

-- ---------------------------------------------------------------------
-- Game: one row per board game on BoardGameGeek.
-- Primary key game_id is the BGG ID (stable identifier).
-- Numeric columns are nullable because the source CSV is sparse.
-- Columns min_players..complexity are reserved for future enrichment;
-- the public Kaggle CSV does not populate them, so they are left NULL.
-- ---------------------------------------------------------------------
CREATE TABLE Game (
    game_id        INT     PRIMARY KEY,
    name           TEXT    NOT NULL,
    description    TEXT,
    year_published INT,
    min_players    INT,
    max_players    INT,
    min_playtime   INT,
    max_playtime   INT,
    min_age        INT,
    image_url      TEXT,
    thumbnail      TEXT,
    avg_rating     FLOAT,      -- BGG community average (0–10)
    geek_rating    FLOAT,      -- BGG bayesian-weighted "geek" rating
    num_voters     INT,        -- number of community ratings
    rank           INT,        -- BGG overall rank (1 = best)
    complexity     FLOAT       -- "weight" 1–5 (currently NULL)
);

-- ---------------------------------------------------------------------
-- Review: one row per individual community review/rating.
-- review_id is BGG's review ID (unique). game_id is a FK to Game.
-- Rows in raw_reviews_csv whose game_id is missing from Game are
-- discarded by load_review.sql to preserve referential integrity.
-- ---------------------------------------------------------------------
CREATE TABLE Review (
    review_id          BIGINT  PRIMARY KEY,
    game_id            INT     NOT NULL REFERENCES Game(game_id) ON DELETE CASCADE,
    user_id            VARCHAR(255),
    comment            TEXT,
    comment_timestamp  TIMESTAMP,
    rating             FLOAT,
    rating_timestamp   TIMESTAMP,
    post_date          DATE
);

-- ---------------------------------------------------------------------
-- Raw staging tables.
-- These mirror the column order of the source Kaggle CSVs so that
-- COPY ... FROM 'boardgames.csv' / 'boardgames_reviews.csv' works
-- without column-list rewrites. Truncate after load_*.sql succeeds.
-- ---------------------------------------------------------------------
-- All columns TEXT — the CSV uses "" for missing numerics, which breaks
-- typed inserts. We cast in load_game.sql via NULLIF + ::INT/::FLOAT.
CREATE TABLE raw_boardgames_csv (
    rank        TEXT,
    game_id     TEXT,
    title       TEXT,
    description TEXT,
    year        TEXT,
    geekrating  TEXT,
    avgrating   TEXT,
    voters      TEXT,
    link        TEXT,
    thumbnail   TEXT
);

CREATE TABLE raw_reviews_csv (
    game_id                  TEXT,
    reviewid                 TEXT,
    user_pseudouserid        TEXT,
    textfield_comment_value  TEXT,
    textfield_comment_tstamp TEXT,
    rating                   TEXT,
    rating_tstamp            TEXT,
    postdate                 TEXT
);
