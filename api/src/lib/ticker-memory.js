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

// ─── Intelligence: agent accuracy (reads from ticker_notebook) ──────────────

// Reads evaluated outcomes from ticker_notebook.agent_history. Outcomes are
// written by evaluateNotebookOutcomes() (called in postmortem pipeline step).
// Returns per-agent accuracy window, with recent wrong examples for calibration.
// 2026-04-18 v2: migrated from signal_tracking. Now ALL agents can be calibrated.
export async function getAgentAccuracy(env, agentName, days = 90) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    "SELECT ticker, agent_history FROM ticker_notebook"
  ).all();

  let total = 0, correctCount = 0;
  const recentWrong = [];
  const verdictBreakdown = {};

  for (const row of (results || [])) {
    let hist;
    try { hist = JSON.parse(row.agent_history || "{}"); } catch { continue; }
    const entries = hist[agentName];
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      if (!e.outcome || e.outcome.correct == null) continue;
      if (!e.fecha || e.fecha < since) continue;
      total++;
      const v = String(e.verdict || "UNK");
      verdictBreakdown[v] = verdictBreakdown[v] || { total: 0, correct: 0 };
      verdictBreakdown[v].total++;
      if (e.outcome.correct) {
        correctCount++;
        verdictBreakdown[v].correct++;
      } else if (recentWrong.length < 5) {
        recentWrong.push({
          ticker: row.ticker,
          verdict: e.verdict,
          fecha: e.fecha,
          priceChange: e.outcome.priceChange,
          brief: (e.brief || "").slice(0, 100),
        });
      }
    }
  }

  if (total === 0) return null;
  return {
    agent: agentName,
    windowDays: days,
    total,
    correct: correctCount,
    accuracy: Math.round((correctCount / total) * 100) / 100,
    byVerdict: verdictBreakdown,
    recentWrong,
  };
}

// ─── Outcome evaluator (postmortem closes the feedback loop) ────────────────

// Fetches closing prices at the verdict date and today, computes directional
// outcome per verdict class. Idempotent: skips entries that already have
// outcome. Called from runPostmortemAgent. Writes back to notebook.
//
// Verdict direction rules (2% threshold, 5% for CRITICAL):
// - ADD / BUY         → correct if priceChange >= +2%
// - TRIM / SELL       → correct if priceChange <= -2%
// - HOLD              → correct if |priceChange| < 2% (neutral prediction)
// - CRITICAL / MISS   → correct if priceChange <= -5% (dividend/earnings agent style)
// - everything else   → inconclusive (correct = null)
//
// Returns { evaluated, updated, skippedRecent, skippedNoPrice, errors }.
export async function evaluateNotebookOutcomes(env, { minAgeDays = 30, maxAgeDays = 120, maxPerRun = 80 } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const ageCutoff = new Date(Date.now() - minAgeDays * 86400000).toISOString().slice(0, 10);
  const floorCutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString().slice(0, 10);

  const { results: rows } = await env.DB.prepare(
    "SELECT ticker, agent_history FROM ticker_notebook"
  ).all();

  let evaluated = 0, updated = 0, skippedRecent = 0, skippedNoPrice = 0, errors = 0;

  for (const row of (rows || [])) {
    if (evaluated >= maxPerRun) break;
    let hist;
    try { hist = JSON.parse(row.agent_history || "{}"); } catch { continue; }

    let changed = false;

    for (const agent of Object.keys(hist)) {
      if (!Array.isArray(hist[agent])) continue;
      for (const entry of hist[agent]) {
        if (entry.outcome) continue;  // already evaluated
        if (!entry.fecha || !entry.verdict) continue;
        if (entry.fecha > ageCutoff) { skippedRecent++; continue; }
        if (entry.fecha < floorCutoff) continue;  // too old, skip permanently
        if (evaluated >= maxPerRun) break;

        try {
          const outcome = await fetchVerdictOutcome(env, row.ticker, entry.verdict, entry.fecha, today);
          if (outcome) {
            entry.outcome = outcome;
            changed = true;
            updated++;
          } else {
            skippedNoPrice++;
          }
          evaluated++;
        } catch (e) {
          errors++;
          console.warn(`[outcomes] ${row.ticker}/${agent} failed:`, e.message);
        }
      }
    }

    if (changed) {
      await env.DB.prepare(
        "UPDATE ticker_notebook SET agent_history = ?, updated_at = datetime('now') WHERE ticker = ?"
      ).bind(JSON.stringify(hist), row.ticker).run();
    }
  }

  return { evaluated, updated, skippedRecent, skippedNoPrice, errors };
}

// Fetches closing prices for a ticker between two dates and classifies outcome.
// Returns null if price data unavailable (foreign ticker, FMP 404, etc.).
async function fetchVerdictOutcome(env, ticker, verdict, fromDate, toDate) {
  if (!env.FMP_KEY) return null;
  // Foreign tickers without proper FMP format → skip (keep simple for MVP)
  if (/^(BME:|HKG:|LSE:)/.test(ticker)) return null;
  if (/\.HK$/.test(ticker)) return null;  // HK done via get_price_history tool already

  const url = `https://financialmodelingprep.com/stable/historical-price-eod/light?symbol=${encodeURIComponent(ticker)}&from=${fromDate}&to=${toDate}&apikey=${env.FMP_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!Array.isArray(data) || data.length < 2) return null;

  // FMP light returns newest-first usually — normalize
  const sorted = data.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const first = Number(sorted[0]?.price ?? sorted[0]?.close);
  const last = Number(sorted[sorted.length - 1]?.price ?? sorted[sorted.length - 1]?.close);
  if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0) return null;

  const priceChange = Math.round(((last - first) / first) * 1000) / 10;  // 0.1 precision
  const days = Math.max(1, Math.round((new Date(toDate) - new Date(fromDate)) / 86400000));

  const v = String(verdict).toUpperCase();
  let correct = null;
  const T = 2;  // 2% threshold for directional calls
  const C = 5;  // 5% threshold for critical/warning calls (must really drop)

  if (v === "ADD" || v === "BUY" || v === "ACCUMULATE") {
    if (priceChange >= T) correct = true;
    else if (priceChange <= -T) correct = false;
  } else if (v === "TRIM" || v === "SELL") {
    if (priceChange <= -T) correct = true;
    else if (priceChange >= T) correct = false;
  } else if (v === "HOLD") {
    if (Math.abs(priceChange) < T) correct = true;
    // HOLD wrong is ambiguous — don't flip to false on directional move
  } else if (v === "CRITICAL" || v === "MISS_STRUCTURAL" || v === "MISS") {
    // Dividend/earnings critical: correct if price fell ≥5% (market validated risk)
    if (priceChange <= -C) correct = true;
    else if (priceChange >= C) correct = false;
  } else if (v === "WARNING" || v === "OK") {
    // Neutral-ish; only flag clearly wrong
    if (v === "WARNING" && priceChange <= -C) correct = true;
  }

  return {
    evaluatedAt: new Date().toISOString(),
    days,
    priceChange,
    correct,
    priceFrom: Math.round(first * 100) / 100,
    priceTo: Math.round(last * 100) / 100,
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
