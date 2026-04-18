// ═══════════════════════════════════════════════════════════════════════════
// TICKER MEMORY — Agent Intelligence v2 (2026-04-18)
// Memoria persistente por ticker: los agentes ven sus verdicts pasados y
// los del Research Agent antes de emitir uno nuevo. Termina la amnesia.
// ═══════════════════════════════════════════════════════════════════════════

const MAX_VERDICTS_PER_AGENT = 10;
const MAX_OPEN_QUESTIONS = 8;

const safeParse = (s, fallback) => {
  try { return JSON.parse(s); } catch { return fallback; }
};

// ─── Read ────────────────────────────────────────────────────────────────────

// Single ticker notebook. Returns null if no row exists (first-time tickers).
export async function getTickerNotebook(env, ticker) {
  if (!ticker) return null;
  const row = await env.DB.prepare(
    `SELECT ticker, summary, open_questions, agent_history,
            last_research_id, last_research_date, last_research_verdict,
            sector, updated_at
     FROM ticker_notebook WHERE ticker = ?`
  ).bind(ticker).first();
  if (!row) return null;
  return {
    ticker: row.ticker,
    summary: row.summary,
    openQuestions: safeParse(row.open_questions, []),
    agentHistory: safeParse(row.agent_history, {}),
    lastResearchId: row.last_research_id,
    lastResearchDate: row.last_research_date,
    lastResearchVerdict: row.last_research_verdict,
    sector: row.sector,
    updatedAt: row.updated_at,
  };
}

// Batch read — used by dividend/earnings agents that process 80+ tickers per run.
// D1 has a LIMIT on bind() params; chunk into 50-ticker batches.
export async function getTickerNotebooksBatch(env, tickers) {
  if (!Array.isArray(tickers) || tickers.length === 0) return {};
  const out = {};
  const CHUNK = 50;
  for (let i = 0; i < tickers.length; i += CHUNK) {
    const chunk = tickers.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => "?").join(",");
    const { results } = await env.DB.prepare(
      `SELECT ticker, summary, open_questions, agent_history,
              last_research_id, last_research_date, last_research_verdict, sector
       FROM ticker_notebook WHERE ticker IN (${placeholders})`
    ).bind(...chunk).all();
    for (const row of (results || [])) {
      out[row.ticker] = {
        ticker: row.ticker,
        summary: row.summary,
        openQuestions: safeParse(row.open_questions, []),
        agentHistory: safeParse(row.agent_history, {}),
        lastResearchId: row.last_research_id,
        lastResearchDate: row.last_research_date,
        lastResearchVerdict: row.last_research_verdict,
        sector: row.sector,
      };
    }
  }
  return out;
}

// ─── Write: per-agent verdict line ───────────────────────────────────────────

// Append one verdict line to ticker's agent_history for a given agentName.
// Keeps only the last MAX_VERDICTS_PER_AGENT per agent (dedup by date — one
// entry per (agent, fecha)).
export async function appendAgentVerdict(env, ticker, agentName, { verdict, severity, brief, fecha, sector }) {
  if (!ticker || !agentName) return;
  fecha = fecha || new Date().toISOString().slice(0, 10);

  // Fetch current row
  const existing = await env.DB.prepare(
    "SELECT agent_history, sector FROM ticker_notebook WHERE ticker = ?"
  ).bind(ticker).first();

  const history = existing ? safeParse(existing.agent_history, {}) : {};
  if (!Array.isArray(history[agentName])) history[agentName] = [];

  // Dedup: if today's verdict already in history, replace in place
  const todayIdx = history[agentName].findIndex(v => v.fecha === fecha);
  const entry = {
    fecha,
    verdict: verdict || null,
    severity: severity || null,
    brief: (brief || "").slice(0, 240),
  };
  if (todayIdx >= 0) history[agentName][todayIdx] = entry;
  else history[agentName].unshift(entry);
  // Cap per-agent history
  history[agentName] = history[agentName].slice(0, MAX_VERDICTS_PER_AGENT);

  // Upsert
  if (existing) {
    await env.DB.prepare(
      `UPDATE ticker_notebook
         SET agent_history = ?, sector = COALESCE(?, sector), updated_at = datetime('now')
       WHERE ticker = ?`
    ).bind(JSON.stringify(history), sector || null, ticker).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO ticker_notebook (ticker, agent_history, sector)
       VALUES (?, ?, ?)`
    ).bind(ticker, JSON.stringify(history), sector || null).run();
  }
}

// Batch version for end-of-batch writes from dividend/earnings.
// Takes an array of { ticker, agentName, verdict, severity, brief, fecha, sector }.
// Still does one D1 statement per ticker but batches the prepare/bind cycle.
export async function appendAgentVerdictsBatch(env, agentName, verdicts, fecha) {
  if (!Array.isArray(verdicts) || verdicts.length === 0) return;
  for (const v of verdicts) {
    if (!v.ticker) continue;
    try {
      await appendAgentVerdict(env, v.ticker, agentName, {
        verdict: v.verdict,
        severity: v.severity,
        brief: v.brief,
        fecha: fecha || v.fecha,
        sector: v.sector,
      });
    } catch (e) {
      console.warn(`[ticker_notebook] append failed for ${v.ticker}:`, e.message);
    }
  }
}

// ─── Write: Research Agent output (deeper context) ──────────────────────────

// Writes after Research Agent finish(). Updates summary + open_questions +
// research_id/date/verdict. The agent_history.research entry is appended
// separately via appendAgentVerdict so the verdict shows alongside other agents.
export async function writeResearchNotebook(env, ticker, { researchId, verdict, summary, openQuestions, fecha, sector }) {
  if (!ticker) return;
  fecha = fecha || new Date().toISOString().slice(0, 10);

  const existing = await env.DB.prepare(
    "SELECT agent_history, open_questions FROM ticker_notebook WHERE ticker = ?"
  ).bind(ticker).first();

  const history = existing ? safeParse(existing.agent_history, {}) : {};
  if (!Array.isArray(history.research)) history.research = [];
  // One research entry per day max
  const todayIdx = history.research.findIndex(v => v.fecha === fecha);
  const resEntry = {
    fecha,
    verdict: verdict || null,
    researchId: researchId || null,
    brief: (summary || "").slice(0, 240),
  };
  if (todayIdx >= 0) history.research[todayIdx] = resEntry;
  else history.research.unshift(resEntry);
  history.research = history.research.slice(0, MAX_VERDICTS_PER_AGENT);

  // Open questions: merge (new ones prepended, cap at MAX_OPEN_QUESTIONS)
  let qs = Array.isArray(openQuestions) ? openQuestions.filter(Boolean).map(String) : [];
  if (existing?.open_questions) {
    const prev = safeParse(existing.open_questions, []);
    qs = [...qs, ...prev.filter(p => !qs.includes(p))];
  }
  qs = qs.slice(0, MAX_OPEN_QUESTIONS);

  const params = {
    summary: summary ? summary.slice(0, 1000) : null,
    open_questions: JSON.stringify(qs),
    agent_history: JSON.stringify(history),
    last_research_id: researchId || null,
    last_research_date: fecha,
    last_research_verdict: verdict || null,
    sector: sector || null,
  };

  if (existing) {
    await env.DB.prepare(
      `UPDATE ticker_notebook SET
         summary = COALESCE(?, summary),
         open_questions = ?,
         agent_history = ?,
         last_research_id = ?,
         last_research_date = ?,
         last_research_verdict = ?,
         sector = COALESCE(?, sector),
         updated_at = datetime('now')
       WHERE ticker = ?`
    ).bind(
      params.summary, params.open_questions, params.agent_history,
      params.last_research_id, params.last_research_date, params.last_research_verdict,
      params.sector, ticker
    ).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO ticker_notebook
         (ticker, summary, open_questions, agent_history,
          last_research_id, last_research_date, last_research_verdict, sector)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      ticker, params.summary, params.open_questions, params.agent_history,
      params.last_research_id, params.last_research_date, params.last_research_verdict,
      params.sector
    ).run();
  }
}

// ─── Intelligence: sectoral stress ──────────────────────────────────────────

// Returns { [sector]: { totalPositions, criticalCount, criticalTickers[], primarySignal } }
// Primary signal = the agent with most criticals in the sector today.
// Used by dividend/earnings agents to contextualize: "Healthcare critical is
// sector-wide (4 of 6 REITs) — probably rate-driven, not idiosyncratic".
export async function getSectorStressMap(env, fecha) {
  fecha = fecha || new Date().toISOString().slice(0, 10);

  // Join today's insights with positions to get sector per ticker
  const { results: rows } = await env.DB.prepare(
    `SELECT p.sector, ai.agent_name, ai.ticker, ai.severity
     FROM agent_insights ai
     INNER JOIN positions p ON p.ticker = ai.ticker
     WHERE ai.fecha = ? AND p.shares > 0 AND ai.severity = 'critical'
       AND p.sector IS NOT NULL AND p.sector != ''`
  ).bind(fecha).all();

  // Also fetch total positions per sector (denominator)
  const { results: totals } = await env.DB.prepare(
    `SELECT sector, COUNT(*) AS n FROM positions
     WHERE shares > 0 AND sector IS NOT NULL AND sector != ''
     GROUP BY sector`
  ).all();

  const totalMap = {};
  for (const t of (totals || [])) totalMap[t.sector] = t.n;

  const agg = {};
  for (const r of (rows || [])) {
    const sec = r.sector;
    if (!agg[sec]) agg[sec] = { totalPositions: totalMap[sec] || 0, criticalCount: 0, criticalTickers: new Set(), byAgent: {} };
    agg[sec].criticalTickers.add(r.ticker);
    agg[sec].byAgent[r.agent_name] = (agg[sec].byAgent[r.agent_name] || 0) + 1;
  }

  const out = {};
  for (const [sec, v] of Object.entries(agg)) {
    const tickers = [...v.criticalTickers];
    const topAgent = Object.entries(v.byAgent).sort((a, b) => b[1] - a[1])[0];
    out[sec] = {
      totalPositions: v.totalPositions,
      criticalCount: tickers.length,
      criticalTickers: tickers,
      primarySignal: topAgent ? { agent: topAgent[0], count: topAgent[1] } : null,
      isContagion: v.totalPositions > 0 && (tickers.length / v.totalPositions) >= 0.4,
    };
  }
  return out;
}

// ─── Intelligence: agent accuracy (30d) ─────────────────────────────────────

// Reads signal_tracking (postmortem-evaluated trade signals). Returns per-agent
// accuracy on non-HOLD verdicts over the given window. Null if insufficient data.
// BUY/ADD correct if price rose >2% by evaluated_at. SELL/TRIM correct if fell >2%.
export async function getAgentAccuracy(env, agentName, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  // signal_tracking rows: { original_fecha, ticker, action, price_at_signal,
  //   price_7d, price_30d, outcome_7d, outcome_30d }
  // Currently only trade agent populates this — earnings/dividend don't.
  // For now: only trade has real data. Return null for others (prompt will say "no data").
  if (agentName !== "trade") return null;
  const { results } = await env.DB.prepare(
    `SELECT action, outcome_7d, outcome_30d FROM signal_tracking
     WHERE original_fecha >= ? AND action IS NOT NULL AND action != 'HOLD'`
  ).bind(since).all();
  if (!results || results.length === 0) return null;
  let correct30 = 0, evaluated30 = 0;
  let correct7 = 0, evaluated7 = 0;
  for (const r of results) {
    if (r.outcome_30d) {
      evaluated30++;
      if (r.outcome_30d === "correct") correct30++;
    }
    if (r.outcome_7d) {
      evaluated7++;
      if (r.outcome_7d === "correct") correct7++;
    }
  }
  return {
    agent: agentName,
    windowDays: days,
    totalSignals: results.length,
    evaluated30,
    correct30,
    accuracy30: evaluated30 > 0 ? (correct30 / evaluated30) : null,
    evaluated7,
    correct7,
    accuracy7: evaluated7 > 0 ? (correct7 / evaluated7) : null,
  };
}

// ─── Formatter: compact notebook string for LLM context ─────────────────────

// Turns a notebook object into a short string injection for prompts.
// Keep it tight — budget ~300-500 chars per ticker. Returns "" if no history.
export function formatNotebookForPrompt(nb) {
  if (!nb) return "";
  const parts = [];
  if (nb.summary) parts.push(`📓 ${nb.summary.slice(0, 300)}`);
  if (nb.lastResearchVerdict && nb.lastResearchDate) {
    parts.push(`🔬 Research ${nb.lastResearchDate}: ${nb.lastResearchVerdict}`);
  }
  // Show last 3 verdicts of each agent that has history
  const agentOrder = ["dividend", "earnings", "trade", "research"];
  for (const a of agentOrder) {
    const hist = nb.agentHistory?.[a];
    if (!hist || !hist.length) continue;
    const recent = hist.slice(0, 3).map(h => `${h.fecha.slice(5)}:${h.verdict || h.severity}`).join(" → ");
    parts.push(`${a}: ${recent}`);
  }
  if (nb.openQuestions?.length) {
    parts.push(`❓ ${nb.openQuestions.slice(0, 3).join("; ")}`);
  }
  return parts.join(" | ");
}
