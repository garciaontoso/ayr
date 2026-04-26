import { Router } from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import logger from '../utils/logger.js';

// Hardcoded container allowlist. Even if the bearer token is compromised,
// these endpoints can ONLY touch ib-gateway — never any other container on
// the NAS (including the bridge itself, the existing CF tunnel, sing-box, etc).
const ALLOWED_CONTAINER = 'ib-gateway';
const DOCKER_SOCKET = '/var/run/docker.sock';
const DOCKER_API_VERSION = 'v1.41';

function dockerRequest(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: DOCKER_SOCKET,
        path: `/${DOCKER_API_VERSION}${path}`,
        method,
        headers: { 'Content-Type': 'application/json' },
        timeout: 30_000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('docker request timeout'));
    });
    req.end();
  });
}

// Second-layer auth: control endpoints require X-Control-Token in addition
// to the standard Bearer token. Token is compared with timing-safe equal.
function controlAuth(req, res, next) {
  const expected = process.env.IB_CONTROL_TOKEN || '';
  if (!expected) {
    logger.warn('control.no_token_configured');
    return res.status(503).json({ error: 'control_disabled', detail: 'IB_CONTROL_TOKEN not set' });
  }
  const provided = req.get('x-control-token') || '';
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  let ok = false;
  if (a.length === b.length) {
    try {
      ok = crypto.timingSafeEqual(a, b);
    } catch {
      ok = false;
    }
  }
  if (!ok) return res.status(401).json({ error: 'control_token_invalid' });
  next();
}

const router = Router();

router.use(controlAuth);

// GET /control/status — returns container state without side effects.
router.get('/status', async (_req, res) => {
  try {
    const r = await dockerRequest(`/containers/${ALLOWED_CONTAINER}/json`);
    if (r.status !== 200) {
      return res.status(502).json({ error: 'docker_error', status: r.status });
    }
    const j = JSON.parse(r.body);
    res.json({
      container: ALLOWED_CONTAINER,
      state: j.State?.Status || 'unknown',
      running: !!j.State?.Running,
      started_at: j.State?.StartedAt || null,
      health: j.State?.Health?.Status || null,
      restart_count: j.RestartCount || 0,
    });
  } catch (err) {
    logger.error('control.status.failed', { err: err?.message || String(err) });
    res.status(500).json({ error: 'docker_unreachable', detail: err?.message });
  }
});

// POST /control/stop — graceful stop of ib-gateway. Releases IBKR session
// so the user can log in via TWS manually.
router.post('/stop', async (_req, res) => {
  try {
    const r = await dockerRequest(`/containers/${ALLOWED_CONTAINER}/stop?t=15`, 'POST');
    // 204 = stopped, 304 = already stopped, both OK
    if (r.status === 204 || r.status === 304) {
      logger.info('control.stop.ok', { status: r.status });
      return res.json({ ok: true, action: 'stop', status: r.status });
    }
    res.status(502).json({ error: 'docker_error', status: r.status, body: r.body.slice(0, 200) });
  } catch (err) {
    logger.error('control.stop.failed', { err: err?.message || String(err) });
    res.status(500).json({ error: 'docker_unreachable', detail: err?.message });
  }
});

// POST /control/start — starts ib-gateway. Will trigger a 2FA push to user's
// IBKR Mobile within ~30 seconds. User must approve on phone.
router.post('/start', async (_req, res) => {
  try {
    const r = await dockerRequest(`/containers/${ALLOWED_CONTAINER}/start`, 'POST');
    // 204 = started, 304 = already running, both OK
    if (r.status === 204 || r.status === 304) {
      logger.info('control.start.ok', { status: r.status });
      return res.json({ ok: true, action: 'start', status: r.status });
    }
    res.status(502).json({ error: 'docker_error', status: r.status, body: r.body.slice(0, 200) });
  } catch (err) {
    logger.error('control.start.failed', { err: err?.message || String(err) });
    res.status(500).json({ error: 'docker_unreachable', detail: err?.message });
  }
});

// POST /control/restart — equivalent to stop + start. Triggers 2FA.
router.post('/restart', async (_req, res) => {
  try {
    const r = await dockerRequest(`/containers/${ALLOWED_CONTAINER}/restart?t=15`, 'POST');
    if (r.status === 204) {
      logger.info('control.restart.ok');
      return res.json({ ok: true, action: 'restart' });
    }
    res.status(502).json({ error: 'docker_error', status: r.status, body: r.body.slice(0, 200) });
  } catch (err) {
    logger.error('control.restart.failed', { err: err?.message || String(err) });
    res.status(500).json({ error: 'docker_unreachable', detail: err?.message });
  }
});

export default router;
