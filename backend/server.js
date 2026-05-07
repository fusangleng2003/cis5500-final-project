require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const { cached } = require('./cache');

const app = express();
app.use(cors());
app.use(express.json());

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseIntInRange(raw, { min, max, fallback }) {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  if (min !== undefined && n < min) return min;
  if (max !== undefined && n > max) return max;
  return n;
}

function parseFloatOrNull(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number.parseFloat(raw);
  return Number.isNaN(n) ? null : n;
}

function sendDbError(res, err, route) {
  console.error(`[${route}]`, err);
  res.status(500).json({ error: 'database_error', route });
}

// -----------------------------------------------------------
// R13  GET /api/health
// -----------------------------------------------------------
app.get('/api/health', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT 1 AS ok');
    res.json({ status: 'ok', db: rows[0].ok === 1 ? 'up' : 'unknown' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: err.message });
  }
});

// -----------------------------------------------------------
// R1  GET /api/games/search
// -----------------------------------------------------------
app.get('/api/games/search', async (req, res) => {
  const name = (req.query.name || '').trim();
  const minYear = parseFloatOrNull(req.query.minYear);
  const maxYear = parseFloatOrNull(req.query.maxYear);
  const minPlayers = parseFloatOrNull(req.query.minPlayers);
  const minRating = parseFloatOrNull(req.query.minRating);
  const limit = parseIntInRange(req.query.limit, { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT });
  const offset = parseIntInRange(req.query.offset, { min: 0, fallback: 0 });

  const where = [];
  const params = [];
  if (name) {
    params.push(`%${name}%`);
    where.push(`name ILIKE $${params.length}`);
  }
  if (minYear !== null) {
    params.push(minYear);
    where.push(`year_published >= $${params.length}`);
  }
  if (maxYear !== null) {
    params.push(maxYear);
    where.push(`year_published <= $${params.length}`);
  }
  if (minPlayers !== null) {
    params.push(minPlayers);
    where.push(`max_players >= $${params.length}`);
  }
  if (minRating !== null) {
    params.push(minRating);
    where.push(`avg_rating >= $${params.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(limit, offset);
  const sql = `
    SELECT game_id, name, year_published, min_players, max_players,
           avg_rating, geek_rating, num_voters, rank, thumbnail
    FROM Game
    ${whereSql}
    ORDER BY COALESCE(avg_rating, 0) DESC, COALESCE(num_voters, 0) DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const key = `R1:${JSON.stringify([name, minYear, maxYear, minPlayers, minRating, limit, offset])}`;
  try {
    const data = await cached(key, async () => {
      const { rows } = await pool.query(sql, params);
      return rows;
    });
    res.json({ results: data, limit, offset });
  } catch (err) {
    sendDbError(res, err, 'R1');
  }
});

// -----------------------------------------------------------
// R2  GET /api/games/top  (Q1)
// -----------------------------------------------------------
app.get('/api/games/top', async (req, res) => {
  const limit = parseIntInRange(req.query.limit, { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT });
  const key = `R2:${limit}`;
  try {
    const data = await cached(key, async () => {
      const { rows } = await pool.query(
        `SELECT game_id, name, year_published, avg_rating, geek_rating, num_voters, rank, thumbnail
         FROM Game
         WHERE avg_rating IS NOT NULL
         ORDER BY avg_rating DESC, num_voters DESC
         LIMIT $1`,
        [limit],
      );
      return rows;
    });
    res.json({ results: data, limit });
  } catch (err) {
    sendDbError(res, err, 'R2');
  }
});

// -----------------------------------------------------------
// R3  GET /api/games/most-reviewed  (Q2)
// -----------------------------------------------------------
app.get('/api/games/most-reviewed', async (req, res) => {
  const limit = parseIntInRange(req.query.limit, { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT });
  const key = `R3:${limit}`;
  try {
    const data = await cached(key, async () => {
      const { rows } = await pool.query(
        `SELECT g.game_id,
                g.name,
                g.thumbnail,
                g.year_published,
                g.avg_rating,
                g.num_voters,
                grs.total_reviews::int AS review_count,
                grs.avg_review_rating::float AS avg_review_rating
         FROM Game g
         JOIN game_review_stats grs ON g.game_id = grs.game_id
         ORDER BY grs.total_reviews DESC
         LIMIT $1`,
        [limit],
      );
      return rows;
    });
    res.json({ results: data, limit });
  } catch (err) {
    sendDbError(res, err, 'R3');
  }
});

// -----------------------------------------------------------
// R7  GET /api/games/highly-rated  (Q6)   -- before :gameId
// -----------------------------------------------------------
app.get('/api/games/highly-rated', async (req, res) => {
  const minReviews = parseIntInRange(req.query.minReviews, { min: 1, fallback: 100 });
  const limit = parseIntInRange(req.query.limit, { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT });
  const key = `R7:${minReviews}:${limit}`;
  try {
    const data = await cached(key, async () => {
      const { rows } = await pool.query(
        `SELECT g.game_id,
                g.name,
                g.thumbnail,
                g.year_published,
                g.avg_rating,
                g.num_voters,
                grs.rated_reviews::int                    AS review_count,
                ROUND(grs.avg_review_rating::numeric, 2)::float AS avg_review_rating
         FROM Game g
         JOIN game_review_stats grs ON g.game_id = grs.game_id
         WHERE grs.rated_reviews >= $1
           AND grs.avg_review_rating IS NOT NULL
         ORDER BY grs.avg_review_rating DESC, grs.rated_reviews DESC
         LIMIT $2`,
        [minReviews, limit],
      );
      return rows;
    });
    res.json({ results: data, minReviews, limit });
  } catch (err) {
    sendDbError(res, err, 'R7');
  }
});

// -----------------------------------------------------------
// R9  GET /api/games/outperformers-by-year  (Q7 complex)
// -----------------------------------------------------------
app.get('/api/games/outperformers-by-year', async (req, res) => {
  const limit = parseIntInRange(req.query.limit, { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT });
  const key = `R9:${limit}`;
  try {
    const data = await cached(key, async () => {
      const { rows } = await pool.query(
        `WITH year_stats AS (
           SELECT year_published,
                  AVG(num_voters) AS avg_year_voters,
                  AVG(avg_rating) AS avg_year_rating
           FROM Game
           WHERE year_published IS NOT NULL
           GROUP BY year_published
         )
         SELECT g.game_id, g.name, g.year_published, g.num_voters, g.avg_rating
         FROM Game g
         JOIN year_stats ys ON g.year_published = ys.year_published
         WHERE g.avg_rating IS NOT NULL
           AND g.num_voters IS NOT NULL
           AND g.num_voters > ys.avg_year_voters
           AND g.avg_rating > ys.avg_year_rating
         ORDER BY g.year_published DESC, g.num_voters DESC
         LIMIT $1`,
        [limit],
      );
      return rows;
    });
    res.json({ results: data, limit });
  } catch (err) {
    sendDbError(res, err, 'R9');
  }
});

// -----------------------------------------------------------
// R10 GET /api/games/review-vs-stored-rating  (Q8 complex)
// -----------------------------------------------------------
app.get('/api/games/review-vs-stored-rating', async (req, res) => {
  const minReviews = parseIntInRange(req.query.minReviews, { min: 1, fallback: 100 });
  const limit = parseIntInRange(req.query.limit, { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT });
  const key = `R10:${minReviews}:${limit}`;
  try {
    const data = await cached(key, async () => {
      const { rows } = await pool.query(
        `SELECT g.game_id,
                g.name,
                g.avg_rating                              AS stored_game_rating,
                ROUND(grs.avg_review_rating::numeric, 2)::float AS review_avg_rating,
                grs.rated_reviews::int                    AS review_count
         FROM Game g
         JOIN game_review_stats grs ON g.game_id = grs.game_id
         WHERE g.avg_rating IS NOT NULL
           AND grs.rated_reviews >= $1
           AND grs.avg_review_rating > g.avg_rating
         ORDER BY review_avg_rating DESC, review_count DESC
         LIMIT $2`,
        [minReviews, limit],
      );
      return rows;
    });
    res.json({ results: data, minReviews, limit });
  } catch (err) {
    sendDbError(res, err, 'R10');
  }
});

// -----------------------------------------------------------
// R11 GET /api/games/dormant-top-rated  (Q9 complex)
// -----------------------------------------------------------
app.get('/api/games/dormant-top-rated', async (req, res) => {
  const minRating = Number(req.query.minRating ?? 8);
  const minReviews = parseIntInRange(req.query.minReviews, { min: 1, fallback: 100 });
  const since = req.query.since || '2024-01-01';
  const limit = parseIntInRange(req.query.limit, { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT });
  const key = `R11:${minRating}:${minReviews}:${since}:${limit}`;
  try {
    const data = await cached(key, async () => {
      const { rows } = await pool.query(
        `SELECT g.game_id,
                g.name,
                g.avg_rating,
                grs.total_reviews::int AS total_reviews
         FROM Game g
         JOIN game_review_stats grs ON g.game_id = grs.game_id
         WHERE g.avg_rating IS NOT NULL
           AND grs.total_reviews >= $2
           AND grs.avg_review_rating >= $1
           AND (grs.latest_post_date IS NULL OR grs.latest_post_date < $3::date)
         ORDER BY total_reviews DESC
         LIMIT $4`,
        [minRating, minReviews, since, limit],
      );
      return rows;
    });
    res.json({ results: data, minRating, minReviews, since, limit });
  } catch (err) {
    sendDbError(res, err, 'R11');
  }
});

// -----------------------------------------------------------
// R12 GET /api/games/global-outperformers  (Q10 complex)
// -----------------------------------------------------------
app.get('/api/games/global-outperformers', async (req, res) => {
  const limit = parseIntInRange(req.query.limit, { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT });
  const key = `R12:${limit}`;
  try {
    const data = await cached(key, async () => {
      const { rows } = await pool.query(
        `WITH global_stats AS (
           SELECT AVG(avg_review_rating) AS global_avg_rating,
                  AVG(rated_reviews)     AS global_avg_review_count
           FROM game_review_stats
           WHERE avg_review_rating IS NOT NULL
         )
         SELECT grs.game_id, g.name,
                grs.rated_reviews::int                        AS review_count,
                ROUND(grs.avg_review_rating::numeric, 2)::float AS avg_review_rating
         FROM game_review_stats grs
         JOIN global_stats gs ON TRUE
         JOIN Game g ON grs.game_id = g.game_id
         WHERE grs.avg_review_rating > gs.global_avg_rating
           AND grs.rated_reviews    > gs.global_avg_review_count
         ORDER BY grs.avg_review_rating DESC, grs.rated_reviews DESC
         LIMIT $1`,
        [limit],
      );
      return rows;
    });
    res.json({ results: data, limit });
  } catch (err) {
    sendDbError(res, err, 'R12');
  }
});

// -----------------------------------------------------------
// R4  GET /api/games/:gameId  (Q3)            -- param route last
// R5  GET /api/games/:gameId/reviews (Q4)
// R6  GET /api/games/:gameId/rating-distribution (Q5)
// R8  GET /api/games/:gameId/similar           (heuristic)
// -----------------------------------------------------------
app.get('/api/games/:gameId', async (req, res) => {
  const gameId = Number.parseInt(req.params.gameId, 10);
  if (Number.isNaN(gameId)) return res.status(400).json({ error: 'invalid_game_id' });
  const key = `R4:${gameId}`;
  try {
    const row = await cached(key, async () => {
      const { rows } = await pool.query(
        `SELECT game_id, name, description, year_published,
                min_players, max_players, min_playtime, max_playtime, min_age,
                avg_rating, geek_rating, num_voters, rank, complexity,
                image_url, thumbnail
         FROM Game
         WHERE game_id = $1`,
        [gameId],
      );
      return rows[0] || null;
    });
    if (!row) return res.status(404).json({ error: 'game_not_found', game_id: gameId });
    res.json(row);
  } catch (err) {
    sendDbError(res, err, 'R4');
  }
});

app.get('/api/games/:gameId/reviews', async (req, res) => {
  const gameId = Number.parseInt(req.params.gameId, 10);
  if (Number.isNaN(gameId)) return res.status(400).json({ error: 'invalid_game_id' });
  const limit = parseIntInRange(req.query.limit, { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT });
  const key = `R5:${gameId}:${limit}`;
  try {
    const data = await cached(key, async () => {
      const { rows } = await pool.query(
        `SELECT review_id, user_id, rating, comment, post_date
         FROM Review
         WHERE game_id = $1 AND post_date IS NOT NULL
         ORDER BY post_date DESC
         LIMIT $2`,
        [gameId, limit],
      );
      return rows;
    });
    res.json({ game_id: gameId, results: data, limit });
  } catch (err) {
    sendDbError(res, err, 'R5');
  }
});

app.get('/api/games/:gameId/rating-distribution', async (req, res) => {
  const gameId = Number.parseInt(req.params.gameId, 10);
  if (Number.isNaN(gameId)) return res.status(400).json({ error: 'invalid_game_id' });
  const key = `R6:${gameId}`;
  try {
    const data = await cached(key, async () => {
      const { rows } = await pool.query(
        `SELECT FLOOR(rating)::int AS rating_bucket,
                COUNT(*)::int      AS review_count
         FROM Review
         WHERE game_id = $1 AND rating IS NOT NULL
         GROUP BY FLOOR(rating)
         ORDER BY rating_bucket`,
        [gameId],
      );
      return rows;
    });
    res.json({ game_id: gameId, distribution: data });
  } catch (err) {
    sendDbError(res, err, 'R6');
  }
});

app.get('/api/games/:gameId/similar', async (req, res) => {
  const gameId = Number.parseInt(req.params.gameId, 10);
  if (Number.isNaN(gameId)) return res.status(400).json({ error: 'invalid_game_id' });
  const limit = parseIntInRange(req.query.limit, { min: 1, max: MAX_LIMIT, fallback: 10 });
  const key = `R8:${gameId}:${limit}`;
  try {
    const data = await cached(key, async () => {
      const { rows } = await pool.query(
        `WITH anchor AS (
           SELECT game_id, year_published, avg_rating, min_players, max_players
           FROM Game WHERE game_id = $1
         )
         SELECT g.game_id, g.name, g.year_published, g.avg_rating,
                g.min_players, g.max_players, g.thumbnail
         FROM Game g, anchor a
         WHERE g.game_id <> a.game_id
           AND g.avg_rating IS NOT NULL
           AND ABS(COALESCE(g.year_published, 0) - COALESCE(a.year_published, 0)) <= 5
           AND ABS(g.avg_rating - a.avg_rating) <= 0.5
           AND (a.min_players IS NULL OR g.max_players IS NULL OR g.max_players >= a.min_players)
           AND (a.max_players IS NULL OR g.min_players IS NULL OR g.min_players <= a.max_players)
         ORDER BY ABS(g.avg_rating - a.avg_rating) ASC,
                  ABS(COALESCE(g.year_published, 0) - COALESCE(a.year_published, 0)) ASC,
                  g.num_voters DESC NULLS LAST
         LIMIT $2`,
        [gameId, limit],
      );
      return rows;
    });
    res.json({ game_id: gameId, results: data, limit });
  } catch (err) {
    sendDbError(res, err, 'R8');
  }
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path });
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`[boardgame-explorer] listening on :${port}`);
});

module.exports = app;
