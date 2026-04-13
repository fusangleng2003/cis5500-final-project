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
1. Connect to the PostgreSQL database on AWS RDS.
2. Run the SQL scripts in the `sql/` folder to create tables and load data.
3. Run the backend and frontend locally for application development.

## Notes
This repository is private and intended only for the CIS 5500 final project team and course staff.v
