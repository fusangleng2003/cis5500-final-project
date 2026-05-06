# API Specification

Production base URL: `https://boardgame-explorer-api.onrender.com`
Local base URL: `http://localhost:8080`

All routes return JSON. All routes are read-only (no auth, no mutations).
Failures return `{ "error": "<code>", "route": "<id>" }` with a 4xx or 5xx status code.

| #   | Method | Path                                          | Backed by query | Cache key prefix |
| --- | ------ | --------------------------------------------- | --------------- | ---------------- |
| R1  | GET    | `/api/games/search`                           | (custom)        | `R1:`            |
| R2  | GET    | `/api/games/top`                              | Q1              | `R2:`            |
| R3  | GET    | `/api/games/most-reviewed`                    | Q2              | `R3:`            |
| R4  | GET    | `/api/games/:gameId`                          | Q3              | `R4:`            |
| R5  | GET    | `/api/games/:gameId/reviews`                  | Q4              | `R5:`            |
| R6  | GET    | `/api/games/:gameId/rating-distribution`      | Q5              | `R6:`            |
| R7  | GET    | `/api/games/highly-rated`                     | Q6              | `R7:`            |
| R8  | GET    | `/api/games/:gameId/similar`                  | (heuristic)     | `R8:`            |
| R9  | GET    | `/api/games/outperformers-by-year`            | Q7 (complex)    | `R9:`            |
| R10 | GET    | `/api/games/review-vs-stored-rating`          | Q8 (complex)    | `R10:`           |
| R11 | GET    | `/api/games/dormant-top-rated`                | Q9 (complex)    | `R11:`           |
| R12 | GET    | `/api/games/global-outperformers`             | Q10 (complex)   | `R12:`           |
| R13 | GET    | `/api/health`                                 | —               | (uncached)       |

Default `limit = 20`, max `100`. `offset = 0` by default.

---

## R1 — GET `/api/games/search`

Filtered catalog search.

**Query params**

| Name        | Type    | Default | Description                                    |
| ----------- | ------- | ------- | ---------------------------------------------- |
| name        | string  | —       | Substring match on `Game.name` (ILIKE `%q%`)   |
| minYear     | int     | —       | `year_published >= minYear`                    |
| maxYear     | int     | —       | `year_published <= maxYear`                    |
| minPlayers  | int     | —       | `max_players >= minPlayers`                    |
| minRating   | float   | —       | `avg_rating >= minRating`                      |
| limit       | int     | 20      | `1..100`                                       |
| offset      | int     | 0       | `>=0`                                          |

**Response**
```json
{
  "results": [
    { "game_id": 13, "name": "Catan", "year_published": 1995,
      "min_players": null, "max_players": null,
      "avg_rating": 7.15, "geek_rating": 6.94, "num_voters": 113521,
      "rank": 421, "thumbnail": "https://..." }
  ],
  "limit": 20, "offset": 0
}
```

---

## R2 — GET `/api/games/top` (Q1)

Top-rated games sorted by `avg_rating DESC, num_voters DESC`.

**Query params**: `limit` (default 20).
**Response**: `{ "results": [...], "limit": <n> }`. Each row has `game_id, name, year_published, avg_rating, geek_rating, num_voters, rank`.

---

## R3 — GET `/api/games/most-reviewed` (Q2)

Games with the most reviews in the `Review` table.

**Query params**: `limit` (default 20).
**Response row**: `{ game_id, name, review_count, avg_review_rating }`.

---

## R4 — GET `/api/games/:gameId` (Q3)

Full detail for one game.

**Path params**: `gameId` (int).
**Response**: a single object with all `Game` columns. `404 game_not_found` if missing.

---

## R5 — GET `/api/games/:gameId/reviews` (Q4)

The most recent reviews for a game.

**Path params**: `gameId`. **Query params**: `limit` (default 20).
**Response**: `{ game_id, results: [{ review_id, user_id, rating, comment, post_date }], limit }`.

---

## R6 — GET `/api/games/:gameId/rating-distribution` (Q5)

Histogram of community ratings rounded down to integer buckets.

**Path params**: `gameId`.
**Response**: `{ game_id, distribution: [{ rating_bucket: 0..10, review_count }] }`.

---

## R7 — GET `/api/games/highly-rated` (Q6)

Games with at least N reviews, sorted by their average review rating.

**Query params**

| Name       | Type | Default | Description                              |
| ---------- | ---- | ------- | ---------------------------------------- |
| minReviews | int  | 100     | Inclusive `HAVING COUNT(...) >= n`       |
| limit      | int  | 20      |                                          |

**Response row**: `{ game_id, name, review_count, avg_review_rating }`.

---

## R8 — GET `/api/games/:gameId/similar`

Heuristic similarity: same year ±5, same average rating ±0.5, overlapping
player-count range. Sorted by closeness.

**Path params**: `gameId`. **Query params**: `limit` (default 10).
**Response**: `{ game_id, results: [game-card rows], limit }`.

---

## R9 — GET `/api/games/outperformers-by-year` (Q7, complex)

Games whose `num_voters` and `avg_rating` both exceed the average for the year
they were published. Two correlated subqueries; demonstrates per-year normalization
in pure SQL.

**Query params**: `limit`.
**Response row**: `{ game_id, name, year_published, num_voters, avg_rating }`.

---

## R10 — GET `/api/games/review-vs-stored-rating` (Q8, complex)

Games whose averaged review rating exceeds the stored `Game.avg_rating`,
filtered to games with at least N reviews. Joins `Game` × `Review`, aggregates,
filters on `HAVING AVG(r.rating) > g.avg_rating`.

**Query params**: `minReviews` (default 100), `limit`.
**Response row**: `{ game_id, name, stored_game_rating, review_avg_rating, review_count }`.

---

## R11 — GET `/api/games/dormant-top-rated` (Q9, complex)

Top-rated games that have not received any review on or after a cutoff date.
Uses `NOT EXISTS` antijoin against `Review.post_date`.

**Query params**

| Name       | Type   | Default       | Description                         |
| ---------- | ------ | ------------- | ----------------------------------- |
| minRating  | float  | 8             | `HAVING AVG(rating) >= minRating`   |
| minReviews | int    | 100           | `HAVING COUNT(*) >= minReviews`     |
| since      | string | `2024-01-01`  | ISO date — `NOT EXISTS post_date >= since` |
| limit      | int    | 20            |                                     |

**Response row**: `{ game_id, name, avg_rating, total_reviews }`.

---

## R12 — GET `/api/games/global-outperformers` (Q10, complex)

Games whose review average AND review count both beat the global mean. Uses two
CTEs (`game_review_stats`, `global_stats`).

**Query params**: `limit`.
**Response row**: `{ game_id, name, review_count, avg_review_rating }`.

---

## R13 — GET `/api/health`

Liveness check. Issues `SELECT 1` against the connection pool.

**Response (200)**: `{ "status": "ok", "db": "up" }`.
**Response (503)**: `{ "status": "degraded", "error": "<message>" }`.

---

## Caching

Every read route is wrapped by `cached(key, loader)` from
[`backend/cache.js`](../backend/cache.js):

- LRU cache (`lru-cache` v10), `max = 500`, `ttl = 5 min` (configurable via
  `CACHE_MAX` / `CACHE_TTL_MS`).
- Cache keys are stringified query params, prefixed by route id (`R1:`..`R12:`).
- First request for a given param tuple incurs the full SQL cost; subsequent
  requests return from memory until TTL expires.

`/api/health` is intentionally not cached — it is the upstream healthcheck for
Render's blue/green deploys.
