import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import GameCard from '../components/GameCard.jsx';
import RatingDistribution from '../components/RatingDistribution.jsx';
import { ErrorNotice, Spinner } from '../components/Loading.jsx';

function fmt(value, suffix = '') {
  if (value === null || value === undefined || value === '') return '—';
  return `${value}${suffix}`;
}

function fmtRating(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return n.toFixed(2);
}

function dateLabel(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

export default function GameDetail() {
  const { gameId } = useParams();
  const [game, setGame] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [distribution, setDistribution] = useState([]);
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([
      api.game(gameId),
      api.gameReviews(gameId, { limit: 10 }),
      api.gameRatingDistribution(gameId),
      api.gameSimilar(gameId, { limit: 6 }),
    ])
      .then(([g, r, d, s]) => {
        if (!alive) return;
        setGame(g);
        setReviews(r.results || []);
        setDistribution(d.distribution || []);
        setSimilar(s.results || []);
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
  }, [gameId]);

  if (loading) {
    return (
      <div className="flex" style={{ padding: 32 }}>
        <Spinner /> Loading game…
      </div>
    );
  }
  if (error) return <ErrorNotice error={error} />;
  if (!game) return <p>Not found.</p>;

  return (
    <article>
      <p className="muted">
        <Link to="/search">← Back to search</Link>
      </p>

      <div className="detail-grid">
        <div className="detail-image card">
          {game.image_url || game.thumbnail ? (
            <img src={game.image_url || game.thumbnail} alt={game.name} />
          ) : (
            <span className="thumb-fallback" aria-hidden>
              ♟
            </span>
          )}
        </div>

        <div>
          <h1 style={{ marginBottom: 4 }}>{game.name}</h1>
          <div className="flex muted" style={{ fontSize: 14 }}>
            {game.year_published ? <span>{game.year_published}</span> : null}
            {game.rank ? <span>BGG rank #{game.rank}</span> : null}
            {game.num_voters ? (
              <span>{Number(game.num_voters).toLocaleString()} voters</span>
            ) : null}
          </div>

          <div className="fact-grid">
            <Fact label="Avg rating" value={fmtRating(game.avg_rating)} />
            <Fact label="Geek rating" value={fmtRating(game.geek_rating)} />
            <Fact
              label="Players"
              value={
                game.min_players || game.max_players
                  ? `${game.min_players ?? '?'}–${game.max_players ?? '?'}`
                  : '—'
              }
            />
            <Fact
              label="Playtime"
              value={
                game.min_playtime || game.max_playtime
                  ? `${game.min_playtime ?? '?'}–${game.max_playtime ?? '?'} min`
                  : '—'
              }
            />
            <Fact label="Min age" value={fmt(game.min_age, '+')} />
            <Fact label="Complexity" value={fmtRating(game.complexity)} />
          </div>
        </div>
      </div>

      {game.description ? (
        <section className="section" style={{ marginTop: 28 }}>
          <h2>About this game</h2>
          <div className="description">{game.description}</div>
        </section>
      ) : null}

      <section className="section">
        <h2>Rating distribution</h2>
        <p className="muted">
          Histogram of community ratings rounded down to the nearest whole
          point.
        </p>
        <RatingDistribution data={distribution} />
      </section>

      <section className="section">
        <h2>Recent reviews</h2>
        {reviews.length === 0 ? (
          <p className="muted">No reviews yet.</p>
        ) : (
          <div className="review-list">
            {reviews.map((r) => (
              <div className="review-item" key={r.review_id}>
                <div className="review-meta">
                  <span className="badge">★ {fmtRating(r.rating)}</span>
                  <span>{r.user_id || 'anonymous'}</span>
                  <span>· {dateLabel(r.post_date)}</span>
                </div>
                <div className="review-text">
                  {r.comment || <em className="muted">(no comment)</em>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <h2>Similar games</h2>
        <p className="muted">
          Heuristic match on release year, average rating, and player count
          range.
        </p>
        {similar.length === 0 ? (
          <p className="muted">No close matches found.</p>
        ) : (
          <div className="grid">
            {similar.map((g) => (
              <GameCard key={g.game_id} game={g} />
            ))}
          </div>
        )}
      </section>
    </article>
  );
}

function Fact({ label, value }) {
  return (
    <div className="fact">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
