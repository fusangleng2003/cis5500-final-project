export function Spinner() {
  return <span className="spinner" role="status" aria-label="Loading" />;
}

export function ErrorNotice({ error }) {
  if (!error) return null;
  const msg = typeof error === 'string' ? error : error.message || 'Something went wrong';
  return <div className="notice notice-error">⚠ {msg}</div>;
}

export function CardSkeleton() {
  return (
    <div className="card game-card" aria-hidden>
      <div className="thumb skeleton" style={{ borderRadius: 0 }} />
      <div className="game-card-body">
        <div className="skeleton" style={{ height: 14, width: '80%' }} />
        <div className="skeleton" style={{ height: 12, width: '50%' }} />
        <div className="skeleton" style={{ height: 12, width: '30%' }} />
      </div>
    </div>
  );
}

export function CardSkeletonGrid({ count = 8 }) {
  return (
    <div className="grid">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
