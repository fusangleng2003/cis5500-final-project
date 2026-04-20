# cis5500-final-project
CIS5500 final project
# Board Game Recommendation and Strategy Explorer

## Project Description
This project builds a board game recommendation and exploration platform using PostgreSQL, Node.js/Express, and React. It integrates board game metadata and large-scale user review data to support game search, rankings, detailed game pages, and review-based insights.

## Repository Structure
- `frontend/`: React frontend code
- `backend/`: Node.js / Express backend code
- `sql/`: database schema, data loading scripts, and Milestone 3 SQL queries
- `README.md`: project overview and setup instructions

## Database
We use PostgreSQL hosted on AWS RDS.

Main tables used in Milestone 3:
- `Game`
- `Review`

Temporary raw tables used for data loading:
- `raw_boardgames_csv`
- `raw_reviews_csv`

## Milestone 3 Progress
- Created the main PostgreSQL tables for board game metadata and reviews
- Loaded and cleaned board game metadata from `boardgames.csv`
- Loaded, deduplicated, and cleaned review data from `boardgames_reviews.csv`
- Wrote 10 SQL queries, including 4 complex queries

## Data Sources
- Board game dataset: Kaggle board games dataset
- Review dataset: Kaggle BoardGameGeek reviews dataset

## How to Run

### 1. Database (one-time, per team DB)
```
psql $DATABASE_URL -f sql/schema.sql
psql $DATABASE_URL -f sql/load_game.sql
psql $DATABASE_URL -f sql/load_review.sql
psql $DATABASE_URL -f sql/indexes.sql   # pg_trgm + supporting indexes (M4)
```

### 2. Backend (Node/Express API — 13 routes)
```
cd backend
cp .env.example .env    # fill in RDS credentials
npm install
npm run dev             # http://localhost:8080/api/health
```
Key routes (see `CIS5500_Milestone4.md` for full spec):
`/api/games/search`, `/api/games/top`, `/api/games/most-reviewed`,
`/api/games/:gameId`, `/api/games/:gameId/reviews`, `/api/games/:gameId/rating-distribution`,
`/api/games/:gameId/similar`, `/api/games/highly-rated`,
`/api/games/outperformers-by-year`, `/api/games/review-vs-stored-rating`,
`/api/games/dormant-top-rated`, `/api/games/global-outperformers`, `/api/health`.

### 3. Frontend (React)
```
cd frontend
npm install
npm start
```

## Deployment
- **Backend** → Render (`backend/render.yaml` blueprint). Free tier web service, `/api/health` used as healthcheck.
- **Frontend** → Vercel (`frontend/vercel.json`). Set `REACT_APP_API_BASE_URL` to the Render URL.
- **Database** → AWS RDS Postgres (shared with team).

## Optimization (M4)
- **Indexes**: `sql/indexes.sql` adds a GIN `pg_trgm` index on `Game.name` (fuzzy + ILIKE search) plus B-tree indexes on the columns used by the complex queries (Q7–Q10 → R9–R12).
- **LRU cache**: `backend/cache.js` wraps every read route with an in-process `lru-cache` (500 entries, 5-min TTL) keyed on query params. First-hit latency pays the SQL cost, subsequent hits serve from memory.

## Notes
This repository is private and intended only for the CIS 5500 final project team and course staff.v
