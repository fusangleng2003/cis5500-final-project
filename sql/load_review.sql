TRUNCATE TABLE Review;

INSERT INTO Review (
    review_id,
    game_id,
    user_id,
    comment,
    comment_timestamp,
    rating,
    rating_timestamp,
    post_date
)
SELECT
    x.reviewid,
    x.game_id,
    x.user_pseudouserid,
    x.textfield_comment_value,
    CASE
        WHEN x.textfield_comment_tstamp IS NULL OR TRIM(x.textfield_comment_tstamp) = '' THEN NULL
        ELSE TO_TIMESTAMP(x.textfield_comment_tstamp, 'YYYY-MM-DD HH24:MI:SS')
    END,
    x.rating,
    CASE
        WHEN x.rating_tstamp IS NULL OR TRIM(x.rating_tstamp) = '' THEN NULL
        ELSE TO_TIMESTAMP(x.rating_tstamp, 'YYYY-MM-DD HH24:MI:SS')
    END,
    CASE
        WHEN x.postdate IS NULL OR TRIM(x.postdate) = '' THEN NULL
        ELSE TO_DATE(SUBSTRING(x.postdate FROM 1 FOR 10), 'YYYY-MM-DD')
    END
FROM (
    SELECT DISTINCT ON (r.reviewid)
        r.reviewid,
        r.game_id,
        r.user_pseudouserid,
        r.textfield_comment_value,
        r.textfield_comment_tstamp,
        r.rating,
        r.rating_tstamp,
        r.postdate
    FROM raw_reviews_csv r
    WHERE r.reviewid IS NOT NULL
    ORDER BY r.reviewid, r.postdate DESC NULLS LAST
) x
JOIN Game g
    ON x.game_id = g.game_id;
