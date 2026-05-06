import { useEffect, useState } from 'react';
import { api, API_BASE } from '../api.js';

export default function About() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ status: 'down' }));
  }, []);

  return (
    <>
      <section className="section">
        <h1>About this project</h1>
        <p className="muted">
          A CIS 5500 (Spring 2026) final project by team{' '}
          <em>Board Game Recommendation and Strategy Explorer</em>.
        </p>
      </section>

      <section className="card insight-card">
        <h3>What it is</h3>
        <p>
          A search and analytics tool for board games. It lets you browse a
          catalog of ~5k games, drill into per-game review history, and ask
          analytical questions on top of millions of community reviews —
          everything served from PostgreSQL through a small Node/Express API.
        </p>
      </section>

      <section className="card insight-card">
        <h3>Architecture</h3>
        <ul>
          <li>
            <strong>Database</strong> — PostgreSQL on AWS RDS. Two business
            tables (<code>Game</code>, <code>Review</code>) plus two raw
            staging tables. Indexes (B-tree + <code>pg_trgm</code> GIN) are
            defined in <code>sql/indexes.sql</code>.
          </li>
          <li>
            <strong>Backend</strong> — Node.js + Express, deployed on Render.
            13 read-only routes, all pooled via <code>node-postgres</code>{' '}
            with an <code>lru-cache</code> in front.
          </li>
          <li>
            <strong>Frontend</strong> — React + Vite (this site), deployed on
            Vercel. Talks to the Express API via{' '}
            <code>VITE_API_BASE_URL</code>.
          </li>
        </ul>
      </section>

      <section className="card insight-card">
        <h3>Data sources</h3>
        <ul>
          <li>
            <a
              href="https://www.kaggle.com/datasets"
              target="_blank"
              rel="noreferrer"
            >
              BoardGameGeek games dataset (Kaggle)
            </a>{' '}
            — game metadata: title, year published, ratings, voter counts,
            BGG rank.
          </li>
          <li>
            <a
              href="https://www.kaggle.com/datasets"
              target="_blank"
              rel="noreferrer"
            >
              BoardGameGeek reviews dataset (Kaggle)
            </a>{' '}
            — community reviews: ratings, comments, post dates.
          </li>
        </ul>
      </section>

      <section className="card insight-card">
        <h3>Live API</h3>
        <p className="muted">Endpoint: <code>{API_BASE}</code></p>
        <p>
          Health:{' '}
          {health ? (
            <span
              className={
                health.status === 'ok' ? 'badge badge-success' : 'badge badge-warning'
              }
            >
              {health.status}
            </span>
          ) : (
            'checking…'
          )}
        </p>
      </section>
    </>
  );
}
