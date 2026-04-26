import { Router } from 'express';
import { getStatus, isConnected } from '../ib-client.js';
import { version as pkgVersion } from '../version.js';

const router = Router();

const startedAt = Date.now();

// /health is intentionally NOT behind auth so that Cloudflare Tunnel
// (and any orchestrator) can probe liveness without sharing the token.
router.get('/', (_req, res) => {
  const status = getStatus();
  const body = {
    ok: true,
    ib_connected: isConnected(),
    uptime_sec: Math.floor((Date.now() - startedAt) / 1000),
    version: pkgVersion,
  };
  if (status.serverVersion) body.ib_server_version = status.serverVersion;
  // status.lastError omitted intentionally — IB error messages can include
  // account IDs and other sensitive context. Use /healthz behind auth for
  // detailed diagnostics (audit 2026-04-27 L4).
  res.json(body);
});

export default router;
