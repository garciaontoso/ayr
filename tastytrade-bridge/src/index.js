// Tastytrade bridge — Express server in front of Tastytrade REST API.
// Runs on NAS Synology (residential IP). The Cloudflare Worker proxies
// here through `ttapi.onto-so.com` because direct CF→Tastytrade calls
// are blocked by their WAF (verified 2026-04-30: nginx 401 on every URL).
//
// Bridge handles:
//   - OAuth flow (token exchange, refresh)
//   - Token persistence to /data volume (survives restarts)
//   - Market data (quotes, chains, IV rank)
//   - Account info
//
// Auth from Worker → bridge: Bearer token in Authorization header.
// Auth from bridge → Tastytrade: OAuth tokens (handled internally).

import express from "express";
import { authMiddleware } from "./auth.js";
import { tokenStore } from "./tokens.js";
import { ttFetch, ttRefresh, ttExchangeCode } from "./tt-client.js";
import oauthRouter from "./routes/oauth.js";
import marketdataRouter from "./routes/marketdata.js";

const PORT = parseInt(process.env.PORT || "8091", 10);
const HOST = process.env.HOST || "0.0.0.0";

const app = express();
app.use(express.json({ limit: "100kb" }));

// Health (no auth — para healthcheck Docker)
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "tastytrade-bridge",
    version: "0.1.0",
    ts: new Date().toISOString(),
    has_tokens: tokenStore.hasTokens(),
    token_expires_at: tokenStore.getAccessExpiresAt(),
  });
});

// Bearer auth para todo lo demás
app.use(authMiddleware);

app.use("/oauth", oauthRouter);
app.use("/marketdata", marketdataRouter);

// Pass-through autenticado al API de Tastytrade (proxy genérico).
// Útil para endpoints que el bridge no haya implementado todavía.
app.all("/tt/*", async (req, res) => {
  const path = req.url.replace(/^\/tt/, "");
  try {
    const data = await ttFetch(path, {
      method: req.method,
      body: ["POST", "PUT", "PATCH"].includes(req.method) ? req.body : undefined,
    });
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: "not_found", path: req.url });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, HOST, () => {
  console.log(`tastytrade-bridge listening on ${HOST}:${PORT}`);
  console.log(`Tokens persisted? ${tokenStore.hasTokens()}`);
});

// Graceful shutdown
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
