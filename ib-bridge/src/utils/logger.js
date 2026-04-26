// Tiny structured JSON logger. No external deps.
// Writes to stdout/stderr — Docker captures these.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

// Fields we never want in logs (defense in depth)
const SENSITIVE_KEYS = new Set([
  'authorization',
  'auth',
  'token',
  'bearer',
  'password',
  'secret',
  'account_id',
  'accountId',
  'account',
  'value',
  'market_value',
  'marketValue',
  'unrealized_pnl',
  'unrealizedPnl',
  'realized_pnl',
  'realizedPnl',
  'net_liquidation',
  'netLiquidation',
]);

function sanitize(obj, depth = 0) {
  if (obj == null || depth > 4) return obj;
  if (Array.isArray(obj)) return obj.map((v) => sanitize(v, depth + 1));
  if (typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k)) {
      out[k] = '[redacted]';
    } else {
      out[k] = sanitize(v, depth + 1);
    }
  }
  return out;
}

function emit(level, msg, meta) {
  if (LEVELS[level] < minLevel) return;
  const record = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...sanitize(meta || {}),
  };
  const line = JSON.stringify(record);
  if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const logger = {
  debug: (msg, meta) => emit('debug', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => {
    // Pull stack out of Error if present
    if (meta instanceof Error) {
      meta = { error: meta.message, stack: meta.stack };
    } else if (meta && meta.error instanceof Error) {
      meta = { ...meta, error: meta.error.message, stack: meta.error.stack };
    }
    emit('error', msg, meta);
  },
};

export default logger;
