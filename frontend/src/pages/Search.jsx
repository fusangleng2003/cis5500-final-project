import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import GameCard from '../components/GameCard.jsx';
import { CardSkeletonGrid, ErrorNotice } from '../components/Loading.jsx';

const PAGE_SIZE = 24;

export default function Search() {
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState({
    name: params.get('name') || '',
    minYear: params.get('minYear') || '',
    maxYear: params.get('maxYear') || '',
    minPlayers: params.get('minPlayers') || '',
    minRating: params.get('minRating') || '',
  });
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(Number(params.get('offset') || 0));

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .searchGames({
        name: form.name,
        minYear: form.minYear,
        maxYear: form.maxYear,
        minPlayers: form.minPlayers,
        minRating: form.minRating,
        limit: PAGE_SIZE,
        offset,
      })
      .then((data) => {
        if (!alive) return;
        setResults(data.results);
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
  }, [params.toString()]);

  function applyFilters(e) {
    e.preventDefault();
    const next = new URLSearchParams();
    Object.entries(form).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) next.set(k, v);
    });
    setOffset(0);
    setParams(next, { replace: false });
  }

  function reset() {
    setForm({
      name: '',
      minYear: '',
      maxYear: '',
      minPlayers: '',
      minRating: '',
    });
    setOffset(0);
    setParams({}, { replace: false });
  }

  function pageTo(newOffset) {
    const next = new URLSearchParams(params);
    next.set('offset', String(newOffset));
    setOffset(newOffset);
    setParams(next, { replace: false });
  }

  return (
    <>
      <section className="section">
        <h1>Search the catalog</h1>
        <p className="muted">
          Filter board games by name, release year, supported player count, and
          minimum BGG average rating. Backed by{' '}
          <code>GET /api/games/search</code>.
        </p>
      </section>

      <form className="card search-form" onSubmit={applyFilters}>
        <label className="full">
          Game name
          <input
            type="search"
            placeholder="e.g. catan, gloomhaven, terraforming…"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          Min year
          <input
            type="number"
            placeholder="1990"
            value={form.minYear}
            onChange={(e) => setForm({ ...form, minYear: e.target.value })}
          />
        </label>
        <label>
          Max year
          <input
            type="number"
            placeholder="2024"
            value={form.maxYear}
            onChange={(e) => setForm({ ...form, maxYear: e.target.value })}
          />
        </label>
        <label>
          Min supported players
          <input
            type="number"
            placeholder="4"
            value={form.minPlayers}
            onChange={(e) => setForm({ ...form, minPlayers: e.target.value })}
          />
        </label>
        <label>
          Min average rating
          <input
            type="number"
            step="0.1"
            placeholder="7.5"
            value={form.minRating}
            onChange={(e) => setForm({ ...form, minRating: e.target.value })}
          />
        </label>
        <div className="search-actions">
          <button type="button" className="btn btn-secondary" onClick={reset}>
            Reset
          </button>
          <button type="submit" className="btn">
            Apply filters
          </button>
        </div>
      </form>

      <ErrorNotice error={error} />

      <div className="results-toolbar">
        <span className="muted">
          {loading
            ? 'Searching…'
            : results
              ? `Showing ${results.length} result${results.length === 1 ? '' : 's'} (offset ${offset})`
              : ''}
        </span>
        <div className="flex">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={loading || offset === 0}
            onClick={() => pageTo(Math.max(0, offset - PAGE_SIZE))}
          >
            ← Previous
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={loading || (results && results.length < PAGE_SIZE)}
            onClick={() => pageTo(offset + PAGE_SIZE)}
          >
            Next →
          </button>
        </div>
      </div>

      {loading && !results ? (
        <CardSkeletonGrid count={12} />
      ) : results && results.length > 0 ? (
        <div className="grid">
          {results.map((g) => (
            <GameCard key={g.game_id} game={g} />
          ))}
        </div>
      ) : (
        <div className="card no-results">
          No matches. Try loosening your filters or clearing the name field.
        </div>
      )}
    </>
  );
}
