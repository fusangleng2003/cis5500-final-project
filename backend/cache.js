const { LRUCache } = require('lru-cache');

const cache = new LRUCache({
  max: Number(process.env.CACHE_MAX || 500),
  ttl: Number(process.env.CACHE_TTL_MS || 5 * 60 * 1000),
});

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = await loader();
  cache.set(key, value);
  return value;
}

function invalidate(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

module.exports = { cache, cached, invalidate };
