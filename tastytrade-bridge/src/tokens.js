// Token persistence — guardamos tokens OAuth en /data/tt-tokens.json
// para que sobrevivan reinicios del container. /data es un volume mount
// declarado en Dockerfile + docker-compose.

import fs from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || "/data";
const TOKEN_FILE = path.join(DATA_DIR, "tt-tokens.json");

class TokenStore {
  constructor() {
    this.tokens = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
      }
    } catch (e) {
      console.error("token load error:", e.message);
    }
    return null;
  }

  _save(tokens) {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    } catch (e) {
      console.error("token save error:", e.message);
    }
  }

  setTokens({ access_token, refresh_token, expires_in }) {
    const accessExpiresAt = new Date(Date.now() + (expires_in || 900) * 1000).toISOString();
    const refreshExpiresAt = new Date(Date.now() + 29 * 86400 * 1000).toISOString();
    this.tokens = {
      access_token,
      refresh_token: refresh_token || this.tokens?.refresh_token,
      access_expires_at: accessExpiresAt,
      refresh_expires_at: refreshExpiresAt,
      updated_at: new Date().toISOString(),
    };
    this._save(this.tokens);
    return this.tokens;
  }

  getAccessToken() {
    if (!this.tokens?.access_token) return null;
    const expires = new Date(this.tokens.access_expires_at).getTime();
    if (expires - Date.now() < 60 * 1000) return null; // < 1 min restante = inválido
    return this.tokens.access_token;
  }

  getRefreshToken() {
    return this.tokens?.refresh_token || null;
  }

  getAccessExpiresAt() {
    return this.tokens?.access_expires_at || null;
  }

  hasTokens() {
    return !!this.tokens?.refresh_token;
  }

  clear() {
    this.tokens = null;
    try { if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE); } catch {}
  }
}

export const tokenStore = new TokenStore();
