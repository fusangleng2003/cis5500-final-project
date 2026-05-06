import { Routes, Route, NavLink, Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Home from './pages/Home.jsx';
import Search from './pages/Search.jsx';
import GameDetail from './pages/GameDetail.jsx';
import Insights from './pages/Insights.jsx';
import About from './pages/About.jsx';
import NotFound from './pages/NotFound.jsx';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <div className="app-shell">
      <ScrollToTop />
      <header className="site-header">
        <div className="container header-row">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden>♟</span>
            <span className="brand-name">Board Game Explorer</span>
          </Link>
          <nav className="primary-nav" aria-label="Primary">
            <NavLink to="/" end>Home</NavLink>
            <NavLink to="/search">Search</NavLink>
            <NavLink to="/insights">Insights</NavLink>
            <NavLink to="/about">About</NavLink>
          </nav>
        </div>
      </header>

      <main className="container site-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/games/:gameId" element={<GameDetail />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <footer className="site-footer">
        <div className="container">
          <span>CIS 5500 Spring 2026 — Board Game Recommendation and Strategy Explorer</span>
          <span>Data: BoardGameGeek (via Kaggle)</span>
        </div>
      </footer>
    </div>
  );
}
