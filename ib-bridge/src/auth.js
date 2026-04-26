import crypto from 'node:crypto';
import logger from './utils/logger.js';

/**
 * Bearer-token auth middleware.
 * - Header parsing is case-insensitive (Express lowercases header names by default).
 * - Uses crypto.timingSafeEqual to prevent timing attacks.
 * - Never logs the actual token.
 *
 * Environment: BRIDGE_AUTH_TOKEN must be set. If it's missing the middleware
 * will deny EVERY request (fail-closed) and log a startup warning.
 */
export function bearerAuth() {
  const expected = process.env.BRIDGE_AUTH_TOKEN || '';
  const expectedBuf = Buffer.from(expected, 'utf8');

  if (!expected) {
    logger.warn('auth.no_token_configured', {
      hint: 'BRIDGE_AUTH_TOKEN env var is empty — all auth-required endpoints will return 401',
    });
  }

  return function authMiddleware(req, res, next) {
    if (!expected) {
      return res.status(401).json({ error: 'auth_required' });
    }

    // Express normalizes header names to lower-case; we still tolerate odd casing.
    const header = req.get('authorization') || req.get('Authorization') || '';
    if (!header.toLowerCase().startsWith('bearer ')) {
      return res.status(401).json({ error: 'auth_required' });
    }

    const provided = header.slice(7).trim();
    const providedBuf = Buffer.from(provided, 'utf8');

    // timingSafeEqual requires equal-length buffers. Compare lengths first
    // (length itself is not a timing-attack vector for fixed-length tokens).
    let ok = false;
    if (providedBuf.length === expectedBuf.length) {
      try {
        ok = crypto.timingSafeEqual(providedBuf, expectedBuf);
      } catch {
        ok = false;
      }
    }

    if (!ok) {
      return res.status(401).json({ error: 'auth_required' });
    }

    return next();
  };
}

export default bearerAuth;
