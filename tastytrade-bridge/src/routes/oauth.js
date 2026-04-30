// OAuth flow endpoints — el Worker llama aquí para arrancar/refrescar
// la conexión con Tastytrade. El bridge hace la llamada real desde el
// NAS (IP residencial) que SÍ puede llegar a Tastytrade.

import express from "express";
import { ttExchangeCode, ttRefresh } from "../tt-client.js";
import { tokenStore } from "../tokens.js";

const router = express.Router();

// POST /oauth/exchange  body: { code, redirect_uri? }
// Worker llama aquí cuando recibe el code del callback del browser.
router.post("/exchange", async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: "code required" });
  try {
    const result = await ttExchangeCode(code);
    res.json({
      success: true,
      access_expires_at: result.access_expires_at,
      method: result.method,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /oauth/refresh — refresca access_token (también lo hace ttFetch
// automáticamente; este endpoint es para verificación manual)
router.post("/refresh", async (req, res) => {
  try {
    const result = await ttRefresh();
    res.json({
      success: true,
      access_expires_at: result.access_expires_at,
      method: result.method,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /oauth/status — saber si tenemos tokens válidos
router.get("/status", (req, res) => {
  res.json({
    has_tokens: tokenStore.hasTokens(),
    access_expires_at: tokenStore.getAccessExpiresAt(),
    access_valid: !!tokenStore.getAccessToken(),
  });
});

// DELETE /oauth/clear — borra tokens (forzar reauth)
router.delete("/clear", (req, res) => {
  tokenStore.clear();
  res.json({ success: true, message: "Tokens cleared. Run OAuth flow to re-authenticate." });
});

export default router;
