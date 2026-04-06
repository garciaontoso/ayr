import { useState, useEffect, useCallback, useRef } from 'react';
import { getCache, setCache } from '../api/cache';

export function useApi(fetchFn, deps = [], cacheKey = null, ttl = 300000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const refetch = useCallback(async (skipCache = false) => {
    setLoading(true);
    setError(null);
    try {
      if (cacheKey && !skipCache) {
        const cached = await getCache(cacheKey);
        if (cached && mountedRef.current) {
          setData(cached);
          setLoading(false);
        }
      }
      const result = await fetchFn();
      if (mountedRef.current) {
        setData(result);
        if (cacheKey) setCache(cacheKey, result, ttl);
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [fetchFn, cacheKey, ttl]);

  useEffect(() => {
    mountedRef.current = true;
    refetch();
    return () => { mountedRef.current = false; };
  }, deps);

  return { data, loading, error, refetch };
}
