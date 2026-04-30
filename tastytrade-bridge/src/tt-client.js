// Cliente HTTP para Tastytrade. Aquí SÍ funciona porque el NAS tiene IP
// residencial española, no IP de Cloudflare Workers (que está bloqueada).
//
// Endpoints:
//   - https://api.tastytrade.com  (nuevo, post 2024)
//   - https://api.tastyworks.com  (legacy, todavía funciona algunos endpoints)
//
// Tastytrade Personal OAuth: authorization_code grant inicial → recibe access
// + refresh tokens. El refresh rota cada uso. TTL access ~15 min, refresh ~30d.

import { tokenStore } from "./tokens.js";

const TT_BASE = "https://api.tastytrade.com";
const TT_BASE_LEGACY = "https://api.tastyworks.com";

// Tastytrade WAF bloquea User-Agent "undici" (default de Node 20 fetch).
// Devuelve nginx 401 antes de procesar la request. Verificado con tests
// directos: curl/X.X → 400 con error real, undici → 401 nginx puro.
// Solución: header User-Agent custom que no esté en su blacklist.
const HTTP_USER_AGENT = "AyR-Trading-Bridge/0.1 (+https://onto-so.com)";

const CLIENT_ID = process.env.TT_CLIENT_ID;
const CLIENT_SECRET = process.env.TT_CLIENT_SECRET;
const REDIRECT_URI = process.env.TT_REDIRECT_URI || "https://api.onto-so.com/api/tastytrade/oauth/callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("WARN: TT_CLIENT_ID / TT_CLIENT_SECRET not set. OAuth endpoints will fail.");
}

// Intercambia un authorization_code por access + refresh tokens.
// Se llama una sola vez al inicio (después del flow de autorización del browser).
export async function ttExchangeCode(code) {
  return _oauthExchange({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
  });
}

// Refresca access_token usando el refresh_token guardado.
export async function ttRefresh() {
  const refresh = tokenStore.getRefreshToken();
  if (!refresh) throw new Error("No refresh token available — run OAuth flow first");
  return _oauthExchange({
    grant_type: "refresh_token",
    refresh_token: refresh,
  });
}

async function _oauthExchange(params) {
  const body = new URLSearchParams(params);
  body.set("client_id", CLIENT_ID);
  body.set("client_secret", CLIENT_SECRET);
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  // Probamos varias combinaciones por si la docs cambia (igual que el worker).
  const attempts = [
    { url: `${TT_BASE}/oauth/token`, headers: { "Authorization": `Basic ${basic}` }, body: new URLSearchParams(params).toString(), label: "tastytrade.com + Basic" },
    { url: `${TT_BASE}/oauth/token`, headers: {}, body: body.toString(), label: "tastytrade.com + body creds" },
    { url: `${TT_BASE_LEGACY}/oauth/token`, headers: { "Authorization": `Basic ${basic}` }, body: new URLSearchParams(params).toString(), label: "tastyworks.com + Basic" },
    { url: `${TT_BASE_LEGACY}/oauth/token`, headers: {}, body: body.toString(), label: "tastyworks.com + body creds" },
  ];

  const failures = [];
  for (const a of attempts) {
    try {
      const resp = await fetch(a.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
          "User-Agent": HTTP_USER_AGENT,
          ...a.headers,
        },
        body: a.body,
      });
      const text = await resp.text();
      if (resp.ok) {
        const data = JSON.parse(text);
        if (!data.access_token) throw new Error("no access_token in response");
        const stored = tokenStore.setTokens(data);
        console.log(`OAuth success via ${a.label}, expires_at=${stored.access_expires_at}`);
        return { ...stored, method: a.label };
      }
      failures.push(`${a.label} → ${resp.status}: ${text.slice(0, 200)}`);
    } catch (e) {
      failures.push(`${a.label} → ${e.message}`);
    }
  }
  const err = new Error("OAuth exchange failed:\n" + failures.join("\n"));
  err.status = 401;
  throw err;
}

// Asegura un access_token válido (refresh si hace falta).
async function getAccessToken() {
  let token = tokenStore.getAccessToken();
  if (token) return token;
  // Refresh
  const refreshed = await ttRefresh();
  return refreshed.access_token;
}

// Llamada autenticada al API de Tastytrade.
export async function ttFetch(path, opts = {}) {
  const token = await getAccessToken();
  const url = path.startsWith("http") ? path : `${TT_BASE}${path}`;
  const init = {
    method: opts.method || "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
      "User-Agent": HTTP_USER_AGENT,
      ...(opts.headers || {}),
    },
  };
  if (opts.body && ["POST", "PUT", "PATCH"].includes(init.method)) {
    init.body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  }
  const resp = await fetch(url, init);
  const text = await resp.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!resp.ok) {
    const err = new Error(`TT ${resp.status} ${path}: ${typeof data === "string" ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200)}`);
    err.status = resp.status;
    throw err;
  }
  return data;
}
