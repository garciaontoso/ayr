// ═══════════════════════════════════════════════════════════════
// CORS helpers — extracted from worker.js (Semana 7-9 refactor)
// Pure functions: no module-level state, no env dependency.
// ═══════════════════════════════════════════════════════════════

export const ALLOWED_ORIGINS = [
  "https://ayr.onto-so.com",
  "https://onto-so.com",
  "https://ayr-196.pages.dev",   // Cloudflare Pages production alias
];

/**
 * Returns { corsHeaders, isAllowed, corsOrigin, origin } for a given request.
 * Mirrors the inline CORS block in the worker fetch() handler exactly.
 * origin is returned so callers can use `(isAllowed && origin)` guards.
 *
 * @param {Request} request
 * @returns {{ corsHeaders: Record<string,string>, isAllowed: boolean, corsOrigin: string, origin: string }}
 */
export function buildCorsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const isLocalhost = origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");
  // Pages preview URLs are hash-{commit}.ayr-196.pages.dev — allowed only
  // for the ayr-196 project (not any *.pages.dev).
  const isPagesPreview = /^https:\/\/[a-f0-9]+\.ayr-196\.pages\.dev$/.test(origin);
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || isLocalhost || isPagesPreview;
  const corsOrigin = isAllowed ? origin : "https://ayr.onto-so.com";
  const corsHeaders = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-AYR-Auth, X-Control-Token",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
  return { corsHeaders, isAllowed, corsOrigin, origin };
}
