import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="card no-results" style={{ marginTop: 40 }}>
      <h2>Page not found</h2>
      <p className="muted">The page you're looking for doesn't exist.</p>
      <Link to="/" className="btn" style={{ marginTop: 12 }}>
        Back home
      </Link>
    </div>
  );
}
