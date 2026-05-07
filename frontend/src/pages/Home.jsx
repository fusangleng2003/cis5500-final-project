import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import GameCard from '../components/GameCard.jsx';
import { CardSkeletonGrid, ErrorNotice } from '../components/Loading.jsx';

export default function Home() {
  const [top, setTop] = useState(null);
  const [reviewed, setReviewed] = useState(null);
  const [highlyRated, setHighlyRated] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setError(null);

    api.topGames({ limit: 8 })
      .then((data) => {
        if (alive) setTop(data.results);
      })
      .catch((err) => {
        if (alive) setError(err);
      });

    api.mostReviewed({ limit: 8 })
      .then((data) => {
        if (alive) setReviewed(data.results);
      })
      .catch((err) => {
        if (alive) setError(err);
      });

    api.highlyRated({ limit: 8, minReviews: 100 })
      .then((data) => {
        if (alive) setHighlyRated(data.results);
      })
      .catch((err) => {
        if (alive) setError(err);
      });

    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <section className="hero">
        <h1>Discover board games worth your evening.</h1>
        <p>
          Search across a curated catalog of board games, drill into ratings
          backed by millions of community reviews, and explore data-driven
          insights about what the BoardGameGeek community actually loves.
        </p>
        <div className="hero-actions">
          <Link to="/search" className="btn">
            Start exploring
          </Link>
          <Link to="/insights" className="btn btn-secondary">
            See insights
          </Link>
        </div>
      </section>

      <ErrorNotice error={error} />

      <Section
        title="Top rated games"
        subtitle="Highest BGG average rating overall."
        moreHref="/search?sort=top"
      >
        {top ? <Grid games={top} /> : <CardSkeletonGrid count={8} />}
      </Section>

      <Section
        title="Most reviewed"
        subtitle="Games drawing the most engagement from the community."
      >
        {reviewed ? <Grid games={reviewed} /> : <CardSkeletonGrid count={8} />}
      </Section>

      <Section
        title="Critically loved (≥100 reviews)"
        subtitle="High average review score after we filter to only well-known games."
      >
        {highlyRated ? (
          <Grid games={highlyRated} />
        ) : (
          <CardSkeletonGrid count={8} />
        )}
      </Section>
    </>
  );
}

function Section({ title, subtitle, moreHref, children }) {
  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2>{title}</h2>
          {subtitle ? <span className="muted">{subtitle}</span> : null}
        </div>
        {moreHref ? (
          <Link to={moreHref} className="btn-link">
            See all →
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Grid({ games }) {
  if (!games || games.length === 0) {
    return <p className="no-results">No games found.</p>;
  }
  return (
    <div className="grid">
      {games.map((g) => (
        <GameCard key={g.game_id} game={g} />
      ))}
    </div>
  );
}
