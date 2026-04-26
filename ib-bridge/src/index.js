// =============================================================================
// ib-bridge — read-only HTTP bridge between A&R Cloudflare Worker
// and a self-hosted Interactive Brokers Gateway.
//
// THREE-LAYER SAFETY MODEL (READ-ONLY)
// -----------------------------------------------------------------------------
//   Layer 1 (account):  IBKR account has the "Read-Only API" setting enabled
//                       in the TWS / Gateway settings panel. Even if every
//                       defense below fails, IBKR will refuse any order.
//
//   Layer 2 (this code): This service has NO order-placement endpoints. We
//                       deliberately import ONLY data-fetch primitives from
//                       @stoqey/ib (no `Order`, `placeOrder`, `cancelOrder`,
//                       `reqAllOpenOrders`, etc.). A grep for those names in
//                       this codebase should return zero hits.
//
//   Layer 3 (network):  This service binds to localhost-only by default and
//                       is exposed to the world ONLY through Cloudflare
//                       Tunnel + Bearer token auth (BRIDGE_AUTH_TOKEN).
//
// To place orders, use TWS, IBKR mobile, or the IBKR web client. This bridge
// is intentionally incapable of doing so.
// =============================================================================

import 'dotenv/config';
import express from 'express';
import logger from './utils/logger.js';
import { connect, disconnect, isConnected } from './ib-client.js';
import bearerAuth from './auth.js';
import healthRouter from './routes/health.js';
import accountRouter from './routes/account.js';
import marketRouter from './routes/market.js';
import optionsRouter from './routes/options.js';
import controlRouter from './routes/control.js';
import { version } from './version.js';

// ---------- safety self-check ----------

if (process.env.READ_ONLY_API !== 'yes') {
  logger.warn('safety.read_only_api_unconfirmed', {
    hint:
      'READ_ONLY_API env var is not "yes". Enable "Read-Only API" in TWS/Gateway settings ' +
      'and set READ_ONLY_API=yes to acknowledge.',
  });
}

// Build the Express app. Exporting the factory makes it easy to test in vitest
// without binding a real port.
export function createApp() {
  const app = express();

  // Trust the first proxy hop (Cloudflare Tunnel sets X-Forwarded-For).
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  // Defense-in-depth security headers (audit 2026-04-27 M2).
  // Cheap headers that close common reflective attacks even though our only
  // ingress is via CF Tunnel + Bearer auth + worker proxy with X-AYR-Auth.
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    next();
  });

  // Lightweight per-request log. Skip /health to avoid spamming.
  app.use((req, _res, next) => {
    if (req.path !== '/health') {
      logger.info('http.request', {
        method: req.method,
        path: req.path,
        ip: req.ip,
      });
    }
    next();
  });

  // /health — public, no auth (so CF Tunnel can probe it).
  app.use('/health', healthRouter);

  // Auth-protected routes.
  const auth = bearerAuth();
  app.use(auth);

  app.use('/', accountRouter); // /nav, /margin, /positions
  app.use('/', marketRouter); // /quotes, /historical
  app.use('/', optionsRouter); // /option-chain, /iv
  app.use('/control', controlRouter); // /control/{status,stop,start,restart}

  // 404 — always JSON, never HTML.
  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', path: req.path });
  });

  // Generic error handler (in case something throws synchronously).
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    logger.error('http.unhandled', err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}

// ---------- bootstrap (only when this file is the entry point) ----------

const isEntry = import.meta.url === `file://${process.argv[1]}`;

if (isEntry) {
  const port = Number.parseInt(process.env.PORT || '8080', 10);
  const host = process.env.HOST || '0.0.0.0';

  logger.info('bridge.starting', { version, host, port });

  const app = createApp();
  const server = app.listen(port, host, () => {
    logger.info('bridge.listening', { host, port });
  });

  // Connect to IB Gateway in the background. The HTTP server stays up even if
  // IB is down — /health still responds, data endpoints return 503.
  connect().catch((err) => {
    logger.error('bridge.initial_ib_connect_failed', err);
    // ib-client schedules its own reconnect, so we don't crash.
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    logger.info('bridge.shutdown', { signal });
    server.close(() => {
      disconnect()
        .catch((err) => logger.error('bridge.shutdown.disconnect', err))
        .finally(() => process.exit(0));
    });
    // Force-exit after 10s so a hung IB call doesn't block forever
    setTimeout(() => {
      logger.warn('bridge.shutdown.force');
      process.exit(1);
    }, 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Last-resort: never let an unhandled promise rejection silently kill us.
  process.on('unhandledRejection', (err) => {
    logger.error('bridge.unhandled_rejection', err);
  });
  process.on('uncaughtException', (err) => {
    logger.error('bridge.uncaught_exception', err);
    // Exit so the orchestrator restarts us — uncaughtException leaves the
    // process in an undefined state and we'd rather die than serve bad data.
    setTimeout(() => process.exit(1), 250).unref();
  });

  // Surface connection state to module consumers (debug only)
  setInterval(() => {
    logger.debug('bridge.heartbeat', { ib_connected: isConnected() });
  }, 60_000).unref();
}

export default createApp;
