import NodeCache from 'node-cache';
import logger from './utils/logger.js';

// Single shared cache instance. checkperiod=120s for low overhead.
const cache = new NodeCache({ stdTTL: 30, checkperiod: 120, useClones: false });

/**
 * Build a deterministic cache key from a route name + the relevant query bits.
 * Sort keys so that ?a=1&b=2 and ?b=2&a=1 hit the same cache slot.
 */
export function cacheKey(route, params = {}) {
  const sorted = Object.keys(params)
    .filter((k) => k !== 'fresh')
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join('&');
  return sorted ? `${route}?${sorted}` : route;
}

/**
 * Wrap an async producer so its result is cached for `ttlSeconds`.
 * - Pass `fresh=true` (typically from req.query.fresh === '1') to bypass.
 * - Errors are NOT cached.
 */
export async function withCache(key, ttlSeconds, fresh, producer) {
  if (!fresh) {
    const hit = cache.get(key);
    if (hit !== undefined) {
      logger.debug('cache.hit', { key });
      return hit;
    }
  }
  const value = await producer();
  cache.set(key, value, ttlSeconds);
  logger.debug('cache.set', { key, ttl: ttlSeconds });
  return value;
}

export function isFresh(req) {
  return req?.query?.fresh === '1' || req?.query?.fresh === 'true';
}

export default { cacheKey, withCache, isFresh };
