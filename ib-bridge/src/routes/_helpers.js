import logger from '../utils/logger.js';

/**
 * Map an error thrown from the IB client into the right HTTP status + JSON body.
 * Keeps route handlers DRY and ensures we never leak stack traces over the wire.
 */
export function sendIbError(res, err) {
  const code = err?.code || '';
  if (code === 'IB_UNAVAILABLE') {
    logger.warn('route.ib_unavailable', { msg: err.message });
    return res.status(503).json({ error: 'ib_unavailable', details: err.message });
  }
  if (code === 'IB_TIMEOUT') {
    logger.warn('route.ib_timeout', { msg: err.message });
    return res.status(504).json({ error: 'timeout', details: err.message });
  }
  if (code === 'NO_SPOT' || code === 'NO_CONTRACT') {
    return res.status(404).json({ error: 'not_found', details: err.message });
  }
  if (code && code.startsWith('IB_ERR_')) {
    logger.warn('route.ib_error', { code, msg: err.message });
    return res.status(502).json({ error: 'ib_error', code, details: err.message });
  }
  logger.error('route.unexpected', err);
  return res.status(500).json({ error: 'internal_error' });
}

export default { sendIbError };
