// ═══════════════════════════════════════════════════════════════
// Telegram helpers — extracted from worker.js (Semana 7-9 refactor)
// All functions receive env as first parameter (no globalThis.env).
// Required env secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
// Required env binding:  DB (D1, for telegram_log + errors_budget).
// ═══════════════════════════════════════════════════════════════

export const TELEGRAM_EMOJI = {
  info: 'ℹ️', notice: '📌', warn: '⚠️', critical: '🚨',
  fishing_proximity: '🎣', fishing_hit: '🐟',
  brain: '🧠', defense: '🛡️',
};

export async function sendTelegram(env, { text, severity = 'info', source = 'system' }) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    // Log silently — Telegram not configured yet
    try {
      await env.DB.prepare(
        `INSERT INTO telegram_log (severity, source, message, delivered, error)
         VALUES (?, ?, ?, 0, 'TELEGRAM_BOT_TOKEN/CHAT_ID not configured')`
      ).bind(severity, source, text).run();
    } catch {}
    return { delivered: false, error: 'not_configured' };
  }
  const emoji = TELEGRAM_EMOJI[severity] || '';
  const fullText = `${emoji} ${text}`.slice(0, 4000);
  try {
    const resp = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: fullText,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await resp.json();
    const ok = resp.ok && data?.ok;
    await env.DB.prepare(
      `INSERT INTO telegram_log (severity, source, message, delivered, error)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(severity, source, fullText, ok ? 1 : 0, ok ? null : (data?.description || `HTTP ${resp.status}`)).run();
    return { delivered: ok, message_id: data?.result?.message_id, error: ok ? null : data?.description };
  } catch (e) {
    try {
      await env.DB.prepare(
        `INSERT INTO telegram_log (severity, source, message, delivered, error)
         VALUES (?, ?, ?, 0, ?)`
      ).bind(severity, source, fullText, e.message?.slice(0, 200) || 'unknown').run();
    } catch {}
    return { delivered: false, error: e.message };
  }
}

// ─── Structured logging + error budget (audit 2026-05-01) ───────────────
// Previously: 127 silent catches + 67 console.error with no alert = hidden bugs for days.
// Now: logEvent persists in D1 + Telegram on CRITICAL, errorBudget counts and alerts on threshold.

export async function logEvent(env, level, event, fields = {}) {
  const line = JSON.stringify({ ts: Date.now(), level, event, ...fields });
  if (level === 'critical' || level === 'error') console.error(line);
  else console.log(line);
  if (level === 'critical') {
    // Fire-and-forget Telegram, no await on hot path
    sendTelegram(env, {
      text: `🔴 *${event}*\n\`\`\`\n${line.slice(0, 500)}\n\`\`\``,
      severity: 'critical',
      source: event,
    }).catch(() => {});
  }
}

export async function errorBudget(env, eventKey, threshold = 10) {
  const day = new Date().toISOString().slice(0, 10);
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS errors_budget(
        event TEXT, day TEXT, count INTEGER DEFAULT 0,
        last_at TEXT, last_message TEXT,
        PRIMARY KEY(event, day))`
    ).run();
    const r = await env.DB.prepare(
      `INSERT INTO errors_budget(event, day, count, last_at)
       VALUES (?, ?, 1, datetime('now'))
       ON CONFLICT(event, day) DO UPDATE SET count = count + 1, last_at = datetime('now')
       RETURNING count`
    ).bind(eventKey, day).first();
    if (r?.count === threshold) {
      sendTelegram(env, {
        text: `⚠️ Error budget hit: *${eventKey}* alcanzó ${threshold} errores hoy. Investigar.`,
        severity: 'warn',
        source: 'error_budget',
      }).catch(() => {});
    }
  } catch (e) {
    console.error("errorBudget meta-error:", e.message);
  }
}
