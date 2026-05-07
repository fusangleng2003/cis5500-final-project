const RAW_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:8080';

export const API_BASE = RAW_BASE.replace(/\/+$/, '');

function buildUrl(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, v);
  }
  return url.toString();
}

async function request(path, params) {
  const url = buildUrl(path, params);
  const res = await fetch(url);
  if (!res.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      // ignore
    }
    throw new Error(`Request failed (${res.status}) ${detail}`);
  }
  return res.json();
}

export const api = {
  health: () => request('/api/health'),
  searchGames: (params) => request('/api/games/search', params),
  topGames: (params) => request('/api/games/top', params),
  mostReviewed: (params) => request('/api/games/most-reviewed', params),
  highlyRated: (params) => request('/api/games/highly-rated', params),
  outperformersByYear: (params) =>
    request('/api/games/outperformers-by-year', params),
  reviewVsStored: (params) =>
    request('/api/games/review-vs-stored-rating', params),
  dormantTopRated: (params) => request('/api/games/dormant-top-rated', params),
  globalOutperformers: (params) =>
    request('/api/games/global-outperformers', params),
  game: (id) => request(`/api/games/${id}`),
  gameReviews: (id, params) => request(`/api/games/${id}/reviews`, params),
  gameRatingDistribution: (id) =>
    request(`/api/games/${id}/rating-distribution`),
  gameSimilar: (id, params) => request(`/api/games/${id}/similar`, params),
};
