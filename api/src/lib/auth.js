// ═══════════════════════════════════════════════════════════════
// Auth helpers — extracted from worker.js (Semana 7-9 refactor)
// Pure functions: receive request + env as parameters.
// No module-level state, no outer-scope dependencies.
//
// SECURITY NOTE: ytRequireToken is the per-endpoint auth guard used
// inside the fetch() handler AFTER the global PROTECTED_WRITE/READ gate.
// The global gate (lines ~4054-4136 in worker.js) still runs first for
// most endpoints. ytRequireToken is a secondary check on routes that
// need explicit gating regardless of the path-match lists.
// DO NOT loosen either check without a full auth audit.
// ═══════════════════════════════════════════════════════════════

/**
 * Per-endpoint auth guard. Returns a 401 Response if the request lacks
 * a valid AYR_WORKER_TOKEN, or null if the token is valid.
 *
 * Usage:
 *   const unauth = ytRequireToken(request, env);
 *   if (unauth) return unauth;
 *
 * Accepts both:
 *   - X-AYR-Auth: <token>       (browser, via monkey patch in main.jsx)
 *   - Authorization: Bearer <token>  (cron jobs, curl)
 *
 * Returns JSON 401 (not plain text) so frontend r.json() doesn't blow up
 * with a confusing "Unexpected token U..." parse error.
 *
 * @param {Request} request
 * @param {{ AYR_WORKER_TOKEN?: string }} env
 * @returns {Response | null}
 */
export function ytRequireToken(request, env) {
  const authHeader = request.headers.get('X-AYR-Auth') || request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token || !env.AYR_WORKER_TOKEN || token !== env.AYR_WORKER_TOKEN) {
    return new Response(JSON.stringify({ error: 'unauthorized', hint: 'Send X-AYR-Auth or Authorization: Bearer header' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  return null;
}
