import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorNotice, Spinner } from '../components/Loading.jsx';

function fmtRating(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return n.toFixed(2);
}

function GameLink({ id, name }) {
  return <Link to={`/games/${id}`}>{name}</Link>;
}

function Card({ title, subtitle, controls, table, error, loading }) {
  return (
    <section className="card insight-card">
      <h3>{title}</h3>
      {subtitle ? <p className="muted" style={{ margin: 0 }}>{subtitle}</p> : null}
      {controls ? <div className="insight-controls">{controls}</div> : null}
      <ErrorNotice error={error} />
      {loading ? (
        <div className="flex" style={{ padding: 12 }}>
          <Spinner /> <span className="muted">Running query…</span>
        </div>
      ) : (
        table
      )}
    </section>
  );
}

function useFetch(loader, deps) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loader()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((err) => {
        if (alive) setError(err);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading };
}

export default function Insights() {
  return (
    <>
      <section className="section">
        <h1>Insights</h1>
        <p className="muted">
          Each card runs one of the four <strong>complex SQL queries</strong>{' '}
          (Q7–Q10) on the live RDS Postgres database. They power the four
          analytical routes on the API: <code>/outperformers-by-year</code>,{' '}
          <code>/review-vs-stored-rating</code>, <code>/dormant-top-rated</code>
          , and <code>/global-outperformers</code>.
        </p>
      </section>

      <OutperformersByYear />
      <ReviewVsStoredRating />
      <DormantTopRated />
      <GlobalOutperformers />
    </>
  );
}

function OutperformersByYear() {
  const [limit, setLimit] = useState(20);
  const { data, error, loading } = useFetch(
    () => api.outperformersByYear({ limit }),
    [limit],
  );
  const rows = data?.results || [];
  return (
    <Card
      title="Q7 — Outperformers within their release year"
      subtitle="Games whose voter count AND average rating both exceed the average for the year they were published."
      loading={loading}
      error={error}
      controls={
        <label>
          Limit
          <input
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 20)}
          />
        </label>
      }
      table={
        <table className="table">
          <thead>
            <tr>
              <th>Year</th>
              <th>Game</th>
              <th className="numeric">Voters</th>
              <th className="numeric">Avg rating</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.game_id}>
                <td>{r.year_published}</td>
                <td>
                  <GameLink id={r.game_id} name={r.name} />
                </td>
                <td className="numeric">
                  {Number(r.num_voters || 0).toLocaleString()}
                </td>
                <td className="numeric">{fmtRating(r.avg_rating)}</td>
              </tr>
            ))}
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={4} className="no-results">
                  No rows returned.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      }
    />
  );
}

function ReviewVsStoredRating() {
  const [minReviews, setMinReviews] = useState(100);
  const [limit, setLimit] = useState(20);
  const { data, error, loading } = useFetch(
    () => api.reviewVsStored({ minReviews, limit }),
    [minReviews, limit],
  );
  const rows = data?.results || [];
  return (
    <Card
      title="Q8 — Reviews say it's better than the catalog rating"
      subtitle="Games whose average review rating is higher than the BGG-stored avg rating, with at least N reviews to be reliable."
      loading={loading}
      error={error}
      controls={
        <>
          <label>
            Min reviews
            <input
              type="number"
              min={1}
              value={minReviews}
              onChange={(e) => setMinReviews(Number(e.target.value) || 1)}
            />
          </label>
          <label>
            Limit
            <input
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value) || 20)}
            />
          </label>
        </>
      }
      table={
        <table className="table">
          <thead>
            <tr>
              <th>Game</th>
              <th className="numeric">Stored rating</th>
              <th className="numeric">Avg of reviews</th>
              <th className="numeric">Reviews</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.game_id}>
                <td>
                  <GameLink id={r.game_id} name={r.name} />
                </td>
                <td className="numeric">{fmtRating(r.stored_game_rating)}</td>
                <td className="numeric">{fmtRating(r.review_avg_rating)}</td>
                <td className="numeric">
                  {Number(r.review_count || 0).toLocaleString()}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={4} className="no-results">
                  No rows returned.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      }
    />
  );
}

function DormantTopRated() {
  const [minRating, setMinRating] = useState(8);
  const [minReviews, setMinReviews] = useState(100);
  const [since, setSince] = useState('2024-01-01');
  const [limit, setLimit] = useState(20);
  const { data, error, loading } = useFetch(
    () => api.dormantTopRated({ minRating, minReviews, since, limit }),
    [minRating, minReviews, since, limit],
  );
  const rows = data?.results || [];
  return (
    <Card
      title="Q9 — Highly rated but dormant"
      subtitle="Top-rated games that have not received a single review on or after the cutoff date."
      loading={loading}
      error={error}
      controls={
        <>
          <label>
            Min rating
            <input
              type="number"
              step="0.1"
              value={minRating}
              onChange={(e) => setMinRating(Number(e.target.value) || 8)}
            />
          </label>
          <label>
            Min reviews
            <input
              type="number"
              min={1}
              value={minReviews}
              onChange={(e) => setMinReviews(Number(e.target.value) || 1)}
            />
          </label>
          <label>
            Cutoff date
            <input
              type="text"
              value={since}
              onChange={(e) => setSince(e.target.value)}
            />
          </label>
          <label>
            Limit
            <input
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value) || 20)}
            />
          </label>
        </>
      }
      table={
        <table className="table">
          <thead>
            <tr>
              <th>Game</th>
              <th className="numeric">Stored rating</th>
              <th className="numeric">Total reviews</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.game_id}>
                <td>
                  <GameLink id={r.game_id} name={r.name} />
                </td>
                <td className="numeric">{fmtRating(r.avg_rating)}</td>
                <td className="numeric">
                  {Number(r.total_reviews || 0).toLocaleString()}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={3} className="no-results">
                  No rows returned.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      }
    />
  );
}

function GlobalOutperformers() {
  const [limit, setLimit] = useState(20);
  const { data, error, loading } = useFetch(
    () => api.globalOutperformers({ limit }),
    [limit],
  );
  const rows = data?.results || [];
  return (
    <Card
      title="Q10 — Beat the global average on rating AND engagement"
      subtitle="Games whose avg review rating and review count are both above the global mean (computed in a CTE)."
      loading={loading}
      error={error}
      controls={
        <label>
          Limit
          <input
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 20)}
          />
        </label>
      }
      table={
        <table className="table">
          <thead>
            <tr>
              <th>Game</th>
              <th className="numeric">Reviews</th>
              <th className="numeric">Avg review rating</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.game_id}>
                <td>
                  <GameLink id={r.game_id} name={r.name} />
                </td>
                <td className="numeric">
                  {Number(r.review_count || 0).toLocaleString()}
                </td>
                <td className="numeric">{fmtRating(r.avg_review_rating)}</td>
              </tr>
            ))}
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={3} className="no-results">
                  No rows returned.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      }
    />
  );
}
