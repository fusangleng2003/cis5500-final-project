import { Link } from 'react-router-dom';

function fmtRating(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return n.toFixed(2);
}

export default function GameCard({ game }) {
  const { game_id, name, year_published, avg_rating, num_voters, thumbnail } = game;
  return (
    <Link to={`/games/${game_id}`} className="card game-card">
      <div className="thumb">
        {thumbnail ? (
          <img src={thumbnail} alt={name} loading="lazy" />
        ) : (
          <span className="thumb-fallback" aria-hidden>
            ♟
          </span>
        )}
      </div>
      <div className="game-card-body">
        <div className="title" title={name}>
          {name}
        </div>
        <div className="meta">
          {year_published ? <span>{year_published}</span> : null}
          {num_voters ? <span>{Number(num_voters).toLocaleString()} voters</span> : null}
        </div>
        <div className="row-between" style={{ marginTop: 'auto' }}>
          <span className="rating">★ {fmtRating(avg_rating)}</span>
        </div>
      </div>
    </Link>
  );
}
