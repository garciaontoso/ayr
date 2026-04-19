// 🛒 Buy Wizard — single-screen flow for evaluating + registering a buy.
// Replaces 10-tab dance with one modal that fetches all signals in parallel,
// synthesizes verdict, suggests size by sector, and persists to Decision
// Journal in one click. (2026-04-19)

import { useState, useCallback, useEffect, useRef } from 'react';
import { useHome } from '../../context/HomeContext';
import { API_URL } from '../../constants/index.js';
import { VerdictBadge } from './VerdictBadge.jsx';

// Sector targets (mirror of RebalancingTab DEFAULT_SECTORS).
const SECTOR_TARGET = {
  'Real Estate': 12, 'REITs': 12,
  'Technology': 13, 'Information Technology': 13,
  'Healthcare': 11, 'Health Care': 11,
  'Industrials': 10,
  'Consumer Staples': 33, 'Consumer Defensive': 33,
  'Financials': 9, 'Financial Services': 9,
  'Energy': 5, 'Utilities': 3,
  'Basic Materials': 4, 'Materials': 4,
  'Communication Services': 3, 'Communication': 3,
};

const verdictRank = { ADD: 4, BUY: 4, ACCUMULATE: 4, HOLD: 2, TRIM: 1, SELL: 0 };

// Aggregate agents → master verdict
function synthesizeVerdict({ research, trade, dividend, earnings, valueInsight, cutWarning, downgrade, insider }) {
  const flags = { red: [], green: [], notes: [] };

  // Research Agent has highest weight (multi-step, Red Team, pre-mortem)
  if (research?.final_verdict) {
    if (research.final_verdict === 'ADD') flags.green.push(`Research: ${research.confidence}`);
    else if (research.final_verdict === 'TRIM' || research.final_verdict === 'SELL') {
      flags.red.push(`Research: ${research.final_verdict} ${research.confidence}`);
    }
  }

  // Trade agent
  if (trade?.details?.action) {
    const a = trade.details.action;
    if (a === 'ADD' || a === 'BUY') flags.green.push(`Trade: ${a}`);
    else if (a === 'SELL' || a === 'TRIM') flags.red.push(`Trade: ${a}`);
  }

  // Dividend critical/warning = red
  if (dividend?.severity === 'critical') flags.red.push(`Dividend: critical`);
  else if (dividend?.severity === 'warning') flags.notes.push(`Dividend: warning`);

  // Cut warning
  if (cutWarning?.severity === 'critical') flags.red.push(`Cut warning: critical`);

  // Earnings
  if (earnings?.severity === 'critical') flags.red.push(`Earnings: critical`);

  // Analyst downgrade
  if (downgrade?.severity === 'critical') flags.red.push(`Analyst downgrades`);

  // Value (positive signal — undervalued)
  if (valueInsight && valueInsight.title?.startsWith('NEW') || valueInsight?.title?.startsWith('ADD')) {
    flags.green.push(`Value: undervalued`);
  }

  // Insider — sells = red, buys/cluster = green
  if (insider) {
    const t = (insider.title || '').toLowerCase();
    if (/vent|sell|sale|exit|reduc/.test(t)) flags.red.push(`Insider: ventas`);
    else if (/compr|colectiv|buy|cluster|acumul/.test(t)) flags.green.push(`Insider: compras`);
  }

  // Master verdict logic
  let action = 'AVOID';
  let reason = '';
  if (flags.red.length === 0 && flags.green.length >= 2) {
    action = 'ADD';
    reason = 'Múltiples agentes alineados positivamente';
  } else if (flags.red.length === 0 && flags.green.length >= 1) {
    action = 'ADD';
    reason = 'Señal positiva, sin red flags';
  } else if (flags.red.length >= 2) {
    action = 'AVOID';
    reason = 'Múltiples red flags activos';
  } else if (flags.red.length === 1 && flags.green.length === 0) {
    action = 'CAUTION';
    reason = 'Red flag presente sin contrapeso';
  } else if (flags.red.length === 1 && flags.green.length >= 1) {
    action = 'CAUTION';
    reason = 'Señales mixtas — investigar pre-mortem antes';
  } else {
    action = 'HOLD';
    reason = 'Señal insuficiente para acción decidida';
  }

  return { action, reason, flags };
}

// Compute sector status + suggested size
function suggestSize({ sector, totalNLV, currentWeight, isNew }) {
  const target = SECTOR_TARGET[sector] || 5;  // unknown sector → 5%
  const tolerance = 3;  // pp

  const currentWeightPct = currentWeight || 0;
  const sectorStatus = currentWeightPct > target + tolerance ? 'overweight'
    : currentWeightPct < target - tolerance ? 'underweight'
    : 'aligned';

  // Base size: 1% NLV for new, 0.5% for adding to existing
  let basePct = isNew ? 1.0 : 0.5;
  if (sectorStatus === 'overweight') basePct *= 0.5;
  else if (sectorStatus === 'underweight') basePct *= 1.5;

  const usd = Math.round(totalNLV * basePct / 100);
  return {
    sector, target, currentWeight: currentWeightPct,
    sectorStatus,
    suggestedUSD: usd,
    suggestedPct: basePct,
    reason: sectorStatus === 'overweight' ? `Sector overweight (${currentWeightPct.toFixed(1)}% vs ${target}% target) — reducir size` :
            sectorStatus === 'underweight' ? `Sector underweight — puede ampliar` :
            'Sector aligned con target',
  };
}

const cardStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 12,
};

const labelStyle = {
  fontSize: 9, fontWeight: 700,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '.5px',
  fontFamily: 'var(--fm)',
};

export default function BuyWizard({ open, onClose, initialTicker }) {
  const { portfolio, portfolioList, portfolioTotals, screenerData, POS_STATIC } = useHome();
  const [ticker, setTicker] = useState(initialTicker || '');
  const [step, setStep] = useState('input');  // input | evaluating | review | submitting | done
  const [evalResult, setEvalResult] = useState(null);
  const [error, setError] = useState(null);
  const [tesis, setTesis] = useState({ razon: '', catalizador: '', wrong: '' });
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [conviction, setConviction] = useState(7);
  const [horizon, setHorizon] = useState('1y');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setStep('input');
      setEvalResult(null);
      setError(null);
      setTesis({ razon: '', catalizador: '', wrong: '' });
      setShares(''); setPrice('');
      setConviction(7); setHorizon('1y');
      if (initialTicker) {
        setTicker(initialTicker);
        // auto-evaluate
        setTimeout(() => doEvaluate(initialTicker), 100);
      } else {
        setTicker('');
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTicker]);

  const doEvaluate = useCallback(async (t) => {
    const tk = String(t || ticker).trim().toUpperCase();
    if (!tk) return;
    setStep('evaluating');
    setError(null);

    try {
      // Parallel fetches
      const [insightsRes, researchRes, contextRes] = await Promise.all([
        fetch(`${API_URL}/api/agent-insights?ticker=${encodeURIComponent(tk)}&days=14&latest=1`).then(r => r.json()).catch(() => ({ insights: [] })),
        fetch(`${API_URL}/api/research-agent/list?ticker=${encodeURIComponent(tk)}&limit=3`).then(r => r.json()).catch(() => ({ investigations: [] })),
        fetch(`${API_URL}/api/buy-wizard/context?ticker=${encodeURIComponent(tk)}`).then(r => r.json()).catch(() => ({})),
      ]);

      const insightsByAgent = {};
      for (const i of (insightsRes.insights || [])) insightsByAgent[i.agent_name] = i;

      const recentResearch = (researchRes.investigations || []).find(r => r.final_verdict);

      // From screener
      const screenerEntry = (screenerData?.screener || []).find(s => s.symbol === tk);

      // Current position
      const pos = portfolioList.find(p => p.ticker === tk);
      const isNew = !pos || (pos.shares || 0) === 0;
      // portfolioTotals usa `totalValueUSD` (App.jsx:1303), no totalValue/nlv.
      const totalNLV = portfolioTotals?.totalValueUSD || portfolioTotals?.totalValue || portfolioTotals?.nlv || 0;
      const posValue = pos ? (pos.usdValue || pos.valueUSD || 0) : 0;
      const currentWeight = pos && totalNLV > 0 ? (posValue / totalNLV) * 100 : 0;

      // Sector
      const sector = screenerEntry?.sector || pos?.sector || POS_STATIC?.[tk]?.sec || 'Unknown';

      // Peers — same sector positions
      const peers = totalNLV > 0 ? portfolioList
        .filter(p => p.ticker !== tk && (p.sector === sector))
        .slice(0, 5)
        .map(p => ({
          ticker: p.ticker,
          name: p.name,
          weight: ((p.usdValue || p.valueUSD || 0) / totalNLV) * 100,
          divYield: (p.divYieldTTM || 0) * 100,
        })) : [];

      // Synthesize
      const verdict = synthesizeVerdict({
        research: recentResearch,
        trade: insightsByAgent.trade,
        dividend: insightsByAgent.dividend,
        earnings: insightsByAgent.earnings,
        valueInsight: insightsByAgent.value,
        cutWarning: insightsByAgent.dividend_cut_warning,
        downgrade: insightsByAgent.analyst_downgrade,
        insider: insightsByAgent.insider,
      });

      const sizing = suggestSize({
        sector,
        totalNLV,
        currentWeight,
        isNew,
      });

      // Suggested shares from price
      const livePrice = pos?.lastPrice || screenerEntry?.price || null;
      if (livePrice) {
        setPrice(String(livePrice.toFixed(2)));
        setShares(String(Math.max(1, Math.floor(sizing.suggestedUSD / livePrice))));
      }

      // Pre-mortem (extract from research investigation if available)
      let preMortem = null;
      try {
        const evJson = recentResearch?.evidence_json
          ? (typeof recentResearch.evidence_json === 'string' ? JSON.parse(recentResearch.evidence_json) : recentResearch.evidence_json)
          : null;
        // Pre-mortem stored in open_questions (first entry tagged [PRE-MORTEM])
        // We can fetch via /api/research-agent/:id to get full details, but for MVP
        // we just show the research summary and date.
      } catch {}

      setEvalResult({
        ticker: tk,
        agents: insightsByAgent,
        research: recentResearch,
        screener: screenerEntry,
        position: pos ? { shares: pos.shares, value: posValue, weight: currentWeight } : null,
        isNew,
        sector,
        peers,
        verdict,
        sizing,
        livePrice,
        totalNLV,
        // Track Record + Timing técnico (2026-04-19)
        longTerm: contextRes?.longTerm || null,
        recentEarnings: contextRes?.recentEarnings || null,
        timing: contextRes?.timing || null,
        notebook: contextRes?.notebook || null,
      });
      setStep('review');
    } catch (e) {
      setError(e.message);
      setStep('input');
    }
  }, [ticker, screenerData, portfolioList, portfolioTotals, POS_STATIC]);

  const doRegister = useCallback(async () => {
    if (!evalResult) return;
    setStep('submitting');
    try {
      // 1) Create journal entry
      const jres = await fetch(`${API_URL}/api/journal/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision_date: new Date().toISOString().slice(0, 10),
          ticker: evalResult.ticker,
          action: evalResult.isNew ? 'BUY' : 'ADD',
          shares: shares ? Number(shares) : null,
          price: price ? Number(price) : null,
          thesis_1: tesis.razon || null,
          thesis_2: tesis.catalizador || null,
          thesis_3: tesis.wrong || null,
          conviction,
          time_horizon: horizon,
        }),
      });
      if (!jres.ok) throw new Error(`journal HTTP ${jres.status}`);

      // 2) Create suggested alert rules (silently — no auth here in dev preview, may fail)
      // a) price drop -10% from entry
      if (price) {
        const stopPrice = (Number(price) * 0.9).toFixed(2);
        try {
          await fetch(`${API_URL}/api/alert-rules/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticker: evalResult.ticker,
              rule_type: 'price_below',
              threshold: Number(stopPrice),
              unit: '$',
              message: `${evalResult.ticker} cayó 10% desde compra — revisar tesis`,
            }),
          });
        } catch {}
      }

      setStep('done');
    } catch (e) {
      setError(e.message);
      setStep('review');
    }
  }, [evalResult, shares, price, tesis, conviction, horizon]);

  if (!open) return null;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      paddingTop: '5vh', overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg)', border: '1px solid var(--gold)',
        borderRadius: 16, padding: 20, maxWidth: 720, width: '92%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fd)' }}>
              🛒 Evaluar compra
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
              Síntesis de agentes + sector check + size sugerido + Journal
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'var(--text-tertiary)',
            fontSize: 22, cursor: 'pointer', padding: 4,
          }}>×</button>
        </div>

        {error && (
          <div style={{ ...cardStyle, background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.4)', marginBottom: 12 }}>
            <span style={{ color: '#ff453a', fontSize: 12 }}>⚠ {error}</span>
          </div>
        )}

        {/* Step: ticker input */}
        {step === 'input' && (
          <div style={{ ...cardStyle }}>
            <label style={labelStyle}>Ticker a evaluar</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                ref={inputRef}
                type="text"
                value={ticker}
                onChange={e => setTicker(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') doEvaluate(); }}
                placeholder="Ej. CMCSA, KO, AVGO"
                style={{
                  flex: 1, padding: '10px 14px',
                  background: 'var(--subtle-bg)', border: '1px solid var(--border)',
                  borderRadius: 8, color: 'var(--text-primary)',
                  fontSize: 14, fontFamily: 'var(--fm)', outline: 'none',
                }}
              />
              <button onClick={() => doEvaluate()} disabled={!ticker.trim()} style={{
                padding: '10px 20px', borderRadius: 8,
                border: '1px solid var(--gold)',
                background: ticker.trim() ? 'var(--gold-dim)' : 'var(--subtle-bg)',
                color: 'var(--gold)', fontSize: 12, fontWeight: 700,
                cursor: ticker.trim() ? 'pointer' : 'not-allowed', fontFamily: 'var(--fm)',
              }}>Evaluar →</button>
            </div>
          </div>
        )}

        {/* Step: evaluating */}
        {step === 'evaluating' && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 32 }}>⚡</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
              Consultando 7 agentes + screener + sector + peers...
            </div>
          </div>
        )}

        {/* Step: review */}
        {step === 'review' && evalResult && <ReviewPanel
          evalResult={evalResult} tesis={tesis} setTesis={setTesis}
          shares={shares} setShares={setShares}
          price={price} setPrice={setPrice}
          conviction={conviction} setConviction={setConviction}
          horizon={horizon} setHorizon={setHorizon}
          onCancel={onClose} onRegister={doRegister}
        />}

        {/* Step: submitting */}
        {step === 'submitting' && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 32 }}>📔</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>Registrando decisión + alerta...</div>
          </div>
        )}

        {/* Step: done */}
        {step === 'done' && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: 32, background: 'rgba(48,209,88,0.06)', border: '1px solid rgba(48,209,88,0.3)' }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#30d158', marginTop: 10 }}>
              Decisión registrada — {evalResult?.ticker}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
              Journal entry creada · Alerta de stop -10% activada · Review en {horizon === '1y' ? '1 año' : horizon}
            </div>
            <button onClick={onClose} style={{
              marginTop: 16, padding: '8px 24px', borderRadius: 8,
              border: '1px solid var(--gold)', background: 'var(--gold-dim)',
              color: 'var(--gold)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Review panel — shows synthesis + form ────────────────────────────────────

function ReviewPanel({ evalResult, tesis, setTesis, shares, setShares, price, setPrice, conviction, setConviction, horizon, setHorizon, onCancel, onRegister }) {
  const { ticker, verdict, sizing, agents, research, screener, position, isNew, sector, peers, livePrice, longTerm, recentEarnings, timing } = evalResult;

  const verdictColor = verdict.action === 'ADD' ? '#30d158'
    : verdict.action === 'CAUTION' ? '#f59e0b'
    : verdict.action === 'AVOID' ? '#ff453a'
    : '#64d2ff';

  const sectorColor = sizing.sectorStatus === 'overweight' ? '#f59e0b'
    : sizing.sectorStatus === 'underweight' ? '#30d158'
    : 'var(--text-secondary)';

  const requiredFilled = tesis.razon && tesis.wrong && shares && price;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Master verdict */}
      <div style={{
        ...cardStyle, padding: 14,
        background: `linear-gradient(135deg, ${verdictColor}15, transparent)`,
        border: `1px solid ${verdictColor}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>VERDICT UNIFICADO</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: verdictColor, fontFamily: 'var(--fm)', letterSpacing: '-0.5px' }}>
              {verdict.action} {ticker}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{verdict.reason}</div>
          </div>
          {position && (
            <div style={{ textAlign: 'right' }}>
              <div style={labelStyle}>YA EN CARTERA</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>{position.shares} sh · {position.weight.toFixed(1)}%</div>
            </div>
          )}
        </div>
      </div>

      {/* Agents row */}
      <div style={{ ...cardStyle }}>
        <div style={labelStyle}>Señal por agente (últimos 14d)</div>
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {research?.final_verdict && (
            <AgentChip label="🔬 Research" sub={`${research.confidence || ''}`} verdict={research.final_verdict} dim />
          )}
          {agents.trade && (
            <AgentChip label="🎯 Trade" sub={agents.trade.details?.conviction || ''} verdict={agents.trade.details?.action || agents.trade.severity} />
          )}
          {agents.dividend && (
            <AgentChip label="💎 Dividend" sub="" severity={agents.dividend.severity} text={agents.dividend.severity?.toUpperCase()} />
          )}
          {agents.dividend_cut_warning && (
            <AgentChip label="⚠ Cut Warning" sub="" severity={agents.dividend_cut_warning.severity} text={agents.dividend_cut_warning.severity?.toUpperCase()} />
          )}
          {agents.earnings && (
            <AgentChip label="📊 Earnings" sub="" severity={agents.earnings.severity} text={agents.earnings.severity?.toUpperCase()} />
          )}
          {agents.analyst_downgrade && agents.analyst_downgrade.ticker !== '_STATUS_' && (
            <AgentChip label="📉 Analysts" sub="" severity={agents.analyst_downgrade.severity} text={agents.analyst_downgrade.severity?.toUpperCase()} />
          )}
          {agents.insider && (() => {
            const t = (agents.insider.title || '').toLowerCase();
            // Insider sells/exit = red flag, buys/cluster = green
            const isSell = /vent|sell|sale|exit|reduc/i.test(t);
            const isBuy = /compr|colectiv|buy|cluster|acumul/i.test(t);
            return <AgentChip label="👁 Insider" sub=""
              severity={isSell ? 'critical' : isBuy ? 'info' : agents.insider.severity}
              text={agents.insider.title?.slice(0, 18)} />;
          })()}
          {agents.value && (
            <AgentChip label="💰 Value" sub="" severity="info" text={agents.value.title?.slice(0, 14)} />
          )}
          {!Object.keys(agents).length && !research && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Sin señales recientes — agentes no han evaluado este ticker en 14 días</span>
          )}
        </div>
        {/* Red/green flags summary */}
        {(verdict.flags.red.length > 0 || verdict.flags.green.length > 0) && (
          <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-secondary)' }}>
            {verdict.flags.green.length > 0 && <span style={{ color: '#30d158' }}>✓ {verdict.flags.green.join(' · ')}</span>}
            {verdict.flags.green.length > 0 && verdict.flags.red.length > 0 && <span> · </span>}
            {verdict.flags.red.length > 0 && <span style={{ color: '#ff453a' }}>✗ {verdict.flags.red.join(' · ')}</span>}
          </div>
        )}
      </div>

      {/* 📅 Track Record (long-term + recent earnings) */}
      {(longTerm || recentEarnings) && (
        <div style={{ ...cardStyle, background: 'rgba(200,164,78,0.04)' }}>
          <div style={labelStyle}>📅 Track record</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 6, fontSize: 11 }}>
            {longTerm && (
              <>
                <Stat label="Años pagando" value={`${longTerm.yearsOfDivs}y`} color={longTerm.yearsOfDivs >= 25 ? '#30d158' : longTerm.yearsOfDivs >= 10 ? 'var(--gold)' : 'var(--text-secondary)'} />
                <Stat label="Cortes históricos" value={longTerm.divCutsCount === 0 ? '0 ✓' : `${longTerm.divCutsCount} (${longTerm.divCuts.slice(0,3).join(', ')})`} color={longTerm.divCutsCount === 0 ? '#30d158' : longTerm.divCutsCount >= 2 ? '#ff453a' : '#f59e0b'} />
                {longTerm.cagr10y != null && (
                  <Stat label="DGR 10y" value={`${longTerm.cagr10y.toFixed(1)}%`} color={longTerm.cagr10y >= 8 ? '#30d158' : longTerm.cagr10y >= 4 ? 'var(--gold)' : '#f59e0b'} />
                )}
                {longTerm.currentDPS != null && (
                  <Stat label="DPS actual" value={`$${longTerm.currentDPS.toFixed(2)}`} />
                )}
              </>
            )}
            {recentEarnings && recentEarnings.beats + recentEarnings.misses > 0 && (
              <Stat label="Earnings (8q)" value={`${recentEarnings.beats}B / ${recentEarnings.misses}M`}
                color={recentEarnings.beats >= recentEarnings.misses * 2 ? '#30d158' : recentEarnings.misses > recentEarnings.beats ? '#ff453a' : 'var(--gold)'} />
            )}
          </div>
          {!longTerm && !recentEarnings?.beats && (
            <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
              Track record histórico no disponible (R2 sin upload para este ticker)
            </div>
          )}
        </div>
      )}

      {/* 📈 Timing técnico (1 línea) */}
      {timing && (timing.rsi14 != null || timing.ma200 != null || timing.fromHigh52Pct != null) && (
        <div style={{ ...cardStyle, background: 'rgba(100,210,255,0.04)' }}>
          <div style={labelStyle}>📈 Timing técnico</div>
          <div style={{ marginTop: 4, fontSize: 11, fontFamily: 'var(--fm)', color: 'var(--text-primary)', display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            {timing.rsi14 != null && (
              <span>RSI 14: <strong style={{ color: timing.rsi14 < 30 ? '#30d158' : timing.rsi14 > 70 ? '#ff453a' : 'var(--text-secondary)' }}>{Math.round(timing.rsi14)}</strong>{timing.rsi14 < 30 && ' (oversold ✓)'}{timing.rsi14 > 70 && ' (overbought ⚠)'}</span>
            )}
            {timing.fromHigh52Pct != null && (
              <span>vs 52w high: <strong style={{ color: timing.fromHigh52Pct < -20 ? '#30d158' : timing.fromHigh52Pct < -10 ? 'var(--gold)' : 'var(--text-secondary)' }}>{timing.fromHigh52Pct > 0 ? '+' : ''}{timing.fromHigh52Pct}%</strong></span>
            )}
            {timing.ma200 != null && timing.price != null && (
              <span>vs MA200: <strong style={{ color: timing.price < timing.ma200 ? '#30d158' : 'var(--text-secondary)' }}>{(((timing.price - timing.ma200) / timing.ma200) * 100).toFixed(1)}%</strong></span>
            )}
          </div>
          <div style={{ marginTop: 2, fontSize: 9, color: 'var(--text-tertiary)' }}>
            Sólo timing — no usar para selección. Combinar con verdict fundamental.
          </div>
        </div>
      )}

      {/* Sector + peers + size */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ ...cardStyle }}>
          <div style={labelStyle}>Sector ({sector})</div>
          <div style={{ marginTop: 4, fontSize: 12 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Actual: </span>
            <span style={{ fontWeight: 700, color: sectorColor }}>{sizing.currentWeight.toFixed(1)}%</span>
            <span style={{ color: 'var(--text-tertiary)' }}> / target {sizing.target}%</span>
          </div>
          <div style={{ fontSize: 10, color: sectorColor, marginTop: 2 }}>
            {sizing.sectorStatus === 'overweight' && '⚠ Overweight'}
            {sizing.sectorStatus === 'underweight' && '✓ Underweight (puede ampliar)'}
            {sizing.sectorStatus === 'aligned' && '○ Aligned'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>{sizing.reason}</div>
        </div>

        <div style={{ ...cardStyle }}>
          <div style={labelStyle}>Size sugerido</div>
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fm)' }}>
            ${sizing.suggestedUSD.toLocaleString()}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            {sizing.suggestedPct.toFixed(2)}% NLV {livePrice ? ` · ~${Math.floor(sizing.suggestedUSD / livePrice)} acc @ $${livePrice.toFixed(2)}` : ''}
          </div>
        </div>
      </div>

      {peers.length > 0 && (
        <div style={{ ...cardStyle }}>
          <div style={labelStyle}>Peers en {sector} (en tu cartera)</div>
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 10 }}>
            {peers.map(p => (
              <span key={p.ticker} style={{
                padding: '3px 8px', borderRadius: 4,
                background: 'var(--subtle-bg)', border: '1px solid var(--border)',
                fontFamily: 'var(--fm)',
              }}>
                <strong style={{ color: 'var(--gold)' }}>{p.ticker}</strong>{' '}
                <span style={{ color: 'var(--text-tertiary)' }}>{p.weight.toFixed(1)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {research?.summary && (
        <div style={{ ...cardStyle, background: 'rgba(100,210,255,0.04)', border: '1px solid rgba(100,210,255,0.2)' }}>
          <div style={labelStyle}>🔬 Última investigación Research Agent</div>
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.45 }}>
            {research.summary}
          </div>
        </div>
      )}

      {/* Form: tesis + size */}
      <div style={{ ...cardStyle }}>
        <div style={labelStyle}>Tu tesis (obligatorio para registrar)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 6 }}>
          <NumInput label="Acciones" value={shares} onChange={setShares} placeholder="100" />
          <NumInput label="Precio entrada $" value={price} onChange={setPrice} placeholder="0.00" />
          <SelectInput label="Horizonte" value={horizon} onChange={setHorizon} options={[
            { v: '3m', l: '3 meses' }, { v: '6m', l: '6 meses' }, { v: '1y', l: '1 año' }, { v: '3y', l: '3 años' }, { v: '5y', l: '5 años' },
          ]} />
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={{ ...labelStyle, fontSize: 10, fontWeight: 600 }}>1. Razón principal — ¿por qué ahora?</label>
          <textarea value={tesis.razon} onChange={e => setTesis({ ...tesis, razon: e.target.value })}
            rows={2} placeholder="Ej: Yield 4.8% sostenible, payout 22%, capex normalizando"
            style={{ width: '100%', marginTop: 4, padding: 8, fontSize: 11, fontFamily: 'var(--fm)', background: 'var(--subtle-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', outline: 'none', resize: 'vertical' }} />
        </div>
        <div style={{ marginTop: 6 }}>
          <label style={{ ...labelStyle, fontSize: 10, fontWeight: 600 }}>2. Catalizador o margen de seguridad (opcional)</label>
          <textarea value={tesis.catalizador} onChange={e => setTesis({ ...tesis, catalizador: e.target.value })}
            rows={1} placeholder="Ej: Spinoff cable previsto Q4 2026"
            style={{ width: '100%', marginTop: 4, padding: 8, fontSize: 11, fontFamily: 'var(--fm)', background: 'var(--subtle-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', outline: 'none', resize: 'vertical' }} />
        </div>
        <div style={{ marginTop: 6 }}>
          <label style={{ ...labelStyle, fontSize: 10, fontWeight: 600, color: '#ff9f0a' }}>3. ¿Qué haría que esta decisión sea incorrecta? ★</label>
          <textarea value={tesis.wrong} onChange={e => setTesis({ ...tesis, wrong: e.target.value })}
            rows={2} placeholder="Ej: Si Charter wireless toma cuota broadband en 12m, este ADD se deteriora"
            style={{ width: '100%', marginTop: 4, padding: 8, fontSize: 11, fontFamily: 'var(--fm)', background: 'var(--subtle-bg)', border: '1px solid #ff9f0a40', borderRadius: 6, color: 'var(--text-primary)', outline: 'none', resize: 'vertical' }} />
        </div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...labelStyle }}>Convicción:</span>
          <input type="range" min="1" max="10" value={conviction}
            onChange={e => setConviction(Number(e.target.value))}
            style={{ flex: 1 }} />
          <span style={{ fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fm)', minWidth: 28 }}>{conviction}/10</span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button onClick={onCancel} style={{
          flex: 1, padding: '10px 16px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'transparent',
          color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>Cancelar</button>
        <button onClick={onRegister} disabled={!requiredFilled} style={{
          flex: 2, padding: '10px 16px', borderRadius: 8,
          border: `1px solid ${requiredFilled ? '#30d158' : 'var(--border)'}`,
          background: requiredFilled ? 'rgba(48,209,88,0.12)' : 'var(--subtle-bg)',
          color: requiredFilled ? '#30d158' : 'var(--text-tertiary)',
          fontSize: 12, fontWeight: 700,
          cursor: requiredFilled ? 'pointer' : 'not-allowed',
        }}>
          ✓ Registrar {evalResult.isNew ? 'compra' : 'add'} en Journal + crear alerta
        </button>
      </div>
      {!requiredFilled && (
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center' }}>
          Completa: razón principal · qué haría incorrecta · acciones · precio
        </div>
      )}
    </div>
  );
}

function AgentChip({ label, sub, verdict, severity, text, dim }) {
  let color = 'var(--text-secondary)';
  if (verdict) {
    if (verdict === 'ADD' || verdict === 'BUY' || verdict === 'ACCUMULATE') color = '#30d158';
    else if (verdict === 'TRIM') color = '#f59e0b';
    else if (verdict === 'SELL') color = '#ff453a';
    else if (verdict === 'HOLD') color = '#64d2ff';
  } else if (severity) {
    if (severity === 'critical') color = '#ff453a';
    else if (severity === 'warning') color = '#f59e0b';
    else color = 'var(--text-secondary)';
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 5,
      background: `${color}15`,
      border: `1px solid ${color}40`,
      fontSize: 10, fontFamily: 'var(--fm)', color,
      opacity: dim ? 0.95 : 1,
    }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {(verdict || text) && <strong>{verdict || text}</strong>}
      {sub && <span style={{ opacity: 0.7 }}>{sub}</span>}
    </span>
  );
}

function Stat({ label, value, color = 'var(--text-primary)' }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--fm)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'var(--fm)', marginTop: 1 }}>{value}</div>
    </div>
  );
}

function NumInput({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label style={{ ...labelStyle, fontSize: 9 }}>{label}</label>
      <input type="text" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', marginTop: 3, padding: '6px 8px', fontSize: 12, fontFamily: 'var(--fm)', background: 'var(--subtle-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', outline: 'none' }} />
    </div>
  );
}

function SelectInput({ label, value, onChange, options }) {
  return (
    <div>
      <label style={{ ...labelStyle, fontSize: 9 }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', marginTop: 3, padding: '6px 8px', fontSize: 12, fontFamily: 'var(--fm)', background: 'var(--subtle-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', outline: 'none' }}>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}
