import { API_URL } from '../constants';

export async function apiFetch(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeout || 15000);
  try {
    const res = await fetch(url, { signal: controller.signal, ...opts });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('timeout');
    throw err;
  }
}

export async function fetchParallel(calls) {
  const results = await Promise.allSettled(calls.map(([path, fallback]) =>
    apiFetch(path).catch(() => fallback ?? null)
  ));
  return results.map(r => r.status === 'fulfilled' ? r.value : null);
}
