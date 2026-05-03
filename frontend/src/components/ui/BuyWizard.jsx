// Buy Wizard v2 — Oracle-powered institutional verdict.
//
// Flow:
//   1) User types ticker → POST /api/oracle-verdict (60-90s first time, <1s cached).
//   2) Oracle reads Deep Dividend report + Research Agent + 14 agent signals +
//      10y GF financials + 2 transcripts + FMP fundamentals and returns a
//      Warren-Buffett-grade structured verdict.
//   3) UI shows: ACTION + CONVICTION hero, Buffett 4-test checks, margin of
//      safety, permanent-loss probability, circle of competence, 5 razones
//      SÍ + NO with specific numbers, catalyst, exit trigger, size guidance,
//      key metrics, data gaps.
//   4) User fills tesis + size → journal entry + alert rules.
//
// Rewrite 2026-04-19: replaces chip-based synthesizeVerdict() which was
// aggregating 14d of stale agent signals. Oracle synthesizes on-demand with
// Opus over the complete document archive.

import { useState, useCallback, useEffect, useRef } from 'react';
import { useHome } from '../../context/HomeContext';
import { API_URL } from '../../constants/index.js';
import { VerdictBadge, verdictColor } from './VerdictBadge.jsx';

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
  const { _portfolio, portfolioList, portfolioTotals, screenerData, POS_STATIC } = useHome();
  const [ticker, setTicker] = useState(initialTicker || '');
  const [step, setStep] = useState('input');  // input | evaluating | review | submitting | done
  const [oracleResult, setOracleResult] = useState(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(null);
  const [tesis, setTesis] = useState({ razon: '', catalizador: '', wrong: '' });
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [conviction, setConviction] = useState(7);
  const [horizon, setHorizon] = useState('3y');
  const inputRef = useRef(null);
  const progressTimersRef = useRef([]);

  useEffect(() => {
    if (open) {
      setStep('input');
      setOracleResult(null);
      setError(null);
      setTesis({ razon: '', catalizador: '', wrong: '' });
      setShares(''); setPrice('');
      setConviction(7); setHorizon('3y');
      if (initialTicker) {
        setTicker(initialTicker);
        setTimeout(() => doEvaluate(initialTicker), 100);
      } else {
        setTicker('');
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
    return () => {
      progressTimersRef.current.forEach(t => clearTimeout(t));
      progressTimersRef.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTicker]);

  const runProgressMessages = useCallback(() => {
    // Staged messages so the 60-90s wait feels like progress, not freeze.
    const stages = [
      { ms: 0, text: 'Consultando Deep Dividend report…' },
      { ms: 6000, text: 'Leyendo Research Agent investigations…' },
      { ms: 14000, text: 'Sintetizando señales de 14 agentes…' },
      { ms: 24000, text: 'Repasando 10 años de fundamentals…' },
      { ms: 38000, text: 'Opus analizando transcripts + Deep Dividend…' },
      { ms: 55000, text: 'Puliendo veredicto Buffett-grade…' },
      { ms: 75000, text: 'Casi listo, validando JSON…' },
    ];
    progressTimersRef.current.forEach(t => clearTimeout(t));
    progressTimersRef.current = stages.map(s =>
      setTimeout(() => setProgress(s.text), s.ms)
    );
  }, []);

  const doEvaluate = useCallback(async (t, forceRefresh = false) => {
    const tk = String(t || ticker).trim().toUpperCase();
    if (!tk) return;
    setStep('evaluating');
    setError(null);
    setProgress('Buscando veredicto en caché…');
    runProgressMessages();

    try {
      const [oracleRes, posData] = await Promise.all([
        fetch(`${API_URL}/api/oracle-verdict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker: tk, force: forceRefresh }),
        }).then(r => r.json()),
        Promise.resolve(portfolioList.find(p => p.ticker === tk) || null),
      ]);
      progressTimersRef.current.forEach(tt => clearTimeout(tt));

      if (oracleRes.error) {
        throw new Error(oracleRes.error);
      }

      const pos = posData;
      const isNew = !pos || (pos.shares || 0) === 0;
      const totalNLV = portfolioTotals?.totalValueUSD || portfolioTotals?.totalValue || 0;
      const posValue = pos ? (pos.usdValue || pos.valueUSD || 0) : 0;
      const currentWeight = pos && totalNLV > 0 ? (posValue / totalNLV) * 100 : 0;
      const screenerEntry = (screenerData?.screener || []).find(s => s.symbol === tk);
      // Prefer local sources; fall back to Oracle's profile sector if available.
      const sector = screenerEntry?.sector
        || pos?.sector
        || POS_STATIC?.[tk]?.sec
        || oracleRes.verdict?.sector
        || 'Unknown';
      const sectorTarget = SECTOR_TARGET[sector] || 5;
      const sectorStatus = currentWeight > sectorTarget + 3 ? 'overweight'
        : currentWeight < sectorTarget - 3 ? 'underweight' : 'aligned';

      const sizeGuidance = oracleRes.verdict?.size_guidance;
      const baseSize = sizeGuidance?.base_case_pct_nlv || (isNew ? 1.0 : 0.5);
      const suggestedUSD = Math.round(totalNLV * baseSize / 100);

      const livePrice = pos?.lastPrice || screenerEntry?.price || null;
      if (livePrice) {
        setPrice(String(livePrice.toFixed(2)));
        if (suggestedUSD > 0) setShares(String(Math.max(1, Math.floor(suggestedUSD / livePrice))));
      }

      setOracleResult({
        ticker: tk,
        oracle: oracleRes,
        verdict: oracleRes.verdict,
        cached: oracleRes.cached,
        contextUsed: oracleRes.context_used,
        callMs: oracleRes.call_ms,
        generatedAt: oracleRes.generated_at,
        position: pos ? { shares: pos.shares, value: posValue, weight: currentWeight } : null,
        isNew,
        sector,
        sectorTarget,
        sectorStatus,
        currentWeight,
        suggestedUSD,
        suggestedPct: baseSize,
        livePrice,
        totalNLV,
      });

      // Default horizon from Oracle if provided
      if (oracleRes.verdict?.time_horizon_years) {
        const y = oracleRes.verdict.time_horizon_years;
        setHorizon(y <= 1 ? '1y' : y <= 3 ? '3y' : y <= 5 ? '5y' : '10y');
      }
      // Pre-fill user conviction = Oracle conviction (user can override)
      if (oracleRes.verdict?.conviction) setConviction(Math.min(10, Math.max(1, oracleRes.verdict.conviction)));

      setStep('review');
    } catch (e) {
      progressTimersRef.current.forEach(tt => clearTimeout(tt));
      setError(e.message || 'Fallo consultando Oracle');
      setStep('input');
    }
  }, [ticker, screenerData, portfolioList, portfolioTotals, POS_STATIC, runProgressMessages]);

  const doRegister = useCallback(async () => {
    if (!oracleResult) return;
    setStep('submitting');
    try {
      const jres = await fetch(`${API_URL}/api/journal/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision_date: new Date().toISOString().slice(0, 10),
          ticker: oracleResult.ticker,
          action: oracleResult.isNew ? 'BUY' : 'ADD',
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

      if (price) {
        const stopPrice = (Number(price) * 0.9).toFixed(2);
        try {
          await fetch(`${API_URL}/api/alert-rules/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticker: oracleResult.ticker,
              rule_type: 'price_below',
              threshold: Number(stopPrice),
              unit: '$',
              message: `${oracleResult.ticker} cayó 10% desde compra — revisar tesis`,
            }),
          });
        } catch {}
      }

      setStep('done');
    } catch (e) {
      setError(e.message);
      setStep('review');
    }
  }, [oracleResult, shares, price, tesis, conviction, horizon]);

  if (!open) return null;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      paddingTop: '3vh', paddingBottom: '3vh', overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg)', border: '1px solid var(--gold)',
        borderRadius: 16, padding: 20, maxWidth: 880, width: '94%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fd)' }}>
              🎯 Oracle — veredicto Buffett
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
              Síntesis Opus sobre Deep Dividend + Research + 14 agentes + 10y fundamentals + transcripts
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
                placeholder="Ej. KO, ITRK, AVGO, CMCSA…"
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
              }}>Consultar Oracle →</button>
            </div>
            <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
              El Oracle lee TODO lo que tenemos del ticker (10-K/10-Q, earnings calls, 10-15y de GF fundamentals,
              señales de 14 agentes, investigaciones del Research Agent con Red Team y Pre-mortem) y sintetiza
              un veredicto con persona Warren Buffett. Primera corrida: 60-90s. Subsiguientes: &lt;1s (24h cache).
            </div>
          </div>
        )}

        {step === 'evaluating' && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🧠</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)', marginBottom: 4 }}>
              Oracle analizando {ticker}…
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, minHeight: 18 }}>
              {progress}
            </div>
            <div style={{ marginTop: 14, fontSize: 10, color: 'var(--text-tertiary)' }}>
              Puede tardar hasta 90s la primera vez (Opus con contexto grande). No cierres la ventana.
            </div>
          </div>
        )}

        {step === 'review' && oracleResult && <OracleReviewPanel
          data={oracleResult}
          tesis={tesis} setTesis={setTesis}
          shares={shares} setShares={setShares}
          price={price} setPrice={setPrice}
          conviction={conviction} setConviction={setConviction}
          horizon={horizon} setHorizon={setHorizon}
          onCancel={onClose} onRegister={doRegister}
          onRefresh={() => doEvaluate(oracleResult.ticker, true)}
        />}

        {step === 'submitting' && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 32 }}>📔</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>Registrando decisión + alerta…</div>
          </div>
        )}

        {step === 'done' && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: 32, background: 'rgba(48,209,88,0.06)', border: '1px solid rgba(48,209,88,0.3)' }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#30d158', marginTop: 10 }}>
              Decisión registrada — {oracleResult?.ticker}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
              Journal entry creada · Alerta stop -10% activada · Review en {horizon}
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

// ── Oracle Review Panel — the hero display ────────────────────────────────

function OracleReviewPanel({ data, tesis, setTesis, shares, setShares, price, setPrice, conviction, setConviction, horizon, setHorizon, onCancel, onRegister, onRefresh }) {
  const { ticker, verdict, cached, contextUsed, callMs, generatedAt, position, isNew, sector, sectorTarget, sectorStatus, currentWeight, suggestedUSD, _suggestedPct, livePrice } = data;

  const action = verdict.action || 'HOLD';
  const actionColor = verdictColor(action);
  const convictionPct = ((verdict.conviction || 5) / 10) * 100;
  const requiredFilled = tesis.razon && tesis.wrong && shares && price;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ============ HERO: ACTION + CONVICTION + ONE-LINER ============ */}
      <div style={{
        ...cardStyle, padding: 16,
        background: `linear-gradient(135deg, ${actionColor}18, transparent)`,
        border: `2px solid ${actionColor}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', letterSpacing: '.5px' }}>
              VEREDICTO ORACLE
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 34, fontWeight: 800, color: actionColor, fontFamily: 'var(--fm)', letterSpacing: '-0.5px', lineHeight: 1 }}>
                {action} {ticker}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>CONVICCIÓN</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 100, height: 8, background: 'var(--subtle-bg)',
                    borderRadius: 4, overflow: 'hidden',
                  }}>
                    <div style={{ width: `${convictionPct}%`, height: '100%', background: actionColor }} />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 800, color: actionColor, fontFamily: 'var(--fm)' }}>
                    {verdict.conviction || '—'}/10
                  </span>
                </div>
              </div>
            </div>
            {verdict.one_liner && (
              <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-primary)', fontStyle: 'italic', fontWeight: 500 }}>
                "{verdict.one_liner}"
              </div>
            )}
          </div>
          {position && (
            <div style={{ textAlign: 'right' }}>
              <div style={labelStyle}>YA EN CARTERA</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fm)' }}>
                {position.shares} sh · {position.weight.toFixed(1)}%
              </div>
            </div>
          )}
        </div>
        {verdict.summary && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>
            {verdict.summary}
          </div>
        )}
        {/* Oracle meta + refresh */}
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, color: 'var(--text-tertiary)', flexWrap: 'wrap', gap: 6 }}>
          <div>
            {cached ? `📦 Cache · generado ${formatTimeAgo(generatedAt)}` : `⚡ Fresh · Opus ${(callMs/1000).toFixed(0)}s`}
            {' · '}
            {contextUsed?.sources?.length ? `fuentes: ${contextUsed.sources.join(', ')}` : 'sin fuentes'}
          </div>
          <button onClick={onRefresh} style={{
            background: 'transparent', border: '1px solid var(--border)', borderRadius: 4,
            color: 'var(--text-tertiary)', fontSize: 10, padding: '3px 10px', cursor: 'pointer',
            fontFamily: 'var(--fm)',
          }}>↻ Regenerar</button>
        </div>
      </div>

      {/* ============ BUFFETT 4 TESTS ============ */}
      {verdict.buffett_test && (
        <div style={{ ...cardStyle, background: 'rgba(200,164,78,0.04)' }}>
          <div style={labelStyle}>🎩 Test de Buffett</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 8 }}>
            <BuffettCheck label="Lo aguantaría 20 años" pass={verdict.buffett_test.would_own_20_years} />
            <BuffettCheck label="Management alineado" pass={verdict.buffett_test.management_aligned} />
            <BuffettCheck label="Negocio simple" pass={verdict.buffett_test.simple_business} />
            <BuffettCheck label="Ventaja durable" pass={verdict.buffett_test.durable_advantage} />
          </div>
          <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700,
            color: verdict.buffett_test.passes_all_four ? '#30d158' : '#f59e0b',
            textAlign: 'center',
          }}>
            {verdict.buffett_test.passes_all_four ? '✓ Pasa los 4 tests' : '⚠ Falla ≥1 test — revisar'}
          </div>
        </div>
      )}

      {/* ============ MARGIN OF SAFETY + LOSS PROB + CIRCLE ============ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 8 }}>
        {verdict.margin_of_safety && (
          <div style={{
            ...cardStyle,
            background: verdict.margin_of_safety.verdict === 'CHEAP' ? 'rgba(48,209,88,0.06)'
              : verdict.margin_of_safety.verdict === 'EXPENSIVE' ? 'rgba(239,68,68,0.06)'
              : 'rgba(245,158,11,0.04)',
            border: `1px solid ${verdict.margin_of_safety.verdict === 'CHEAP' ? '#30d158'
              : verdict.margin_of_safety.verdict === 'EXPENSIVE' ? '#ef4444' : '#f59e0b'}40`,
          }}>
            <div style={labelStyle}>💰 Margen de seguridad</div>
            <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800, color:
              verdict.margin_of_safety.verdict === 'CHEAP' ? '#30d158'
              : verdict.margin_of_safety.verdict === 'EXPENSIVE' ? '#ef4444' : '#f59e0b',
              fontFamily: 'var(--fm)',
            }}>
              {verdict.margin_of_safety.discount_pct != null ? (
                <>{verdict.margin_of_safety.discount_pct > 0 ? '-' : '+'}{Math.abs(verdict.margin_of_safety.discount_pct)}%</>
              ) : verdict.margin_of_safety.verdict}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
              FV: {verdict.margin_of_safety.fair_value_estimate || '—'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>
              Actual: {verdict.margin_of_safety.current_price || '—'}
            </div>
            {verdict.margin_of_safety.comment && (
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.4 }}>
                {verdict.margin_of_safety.comment}
              </div>
            )}
          </div>
        )}

        {verdict.permanent_loss_probability && (
          <div style={{ ...cardStyle, background: 'rgba(239,68,68,0.04)' }}>
            <div style={labelStyle}>☠ Prob. pérdida permanente</div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800, color:
              verdict.permanent_loss_probability.pct_estimate < 10 ? '#30d158'
              : verdict.permanent_loss_probability.pct_estimate < 25 ? '#f59e0b' : '#ef4444',
              fontFamily: 'var(--fm)',
            }}>
              {verdict.permanent_loss_probability.pct_estimate}%
            </div>
            {Array.isArray(verdict.permanent_loss_probability.scenarios) && (
              <ul style={{ margin: '6px 0 0 0', padding: '0 0 0 16px', fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {verdict.permanent_loss_probability.scenarios.slice(0, 3).map((s, i) => (
                  <li key={i} style={{ marginBottom: 2 }}>{s}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {verdict.circle_of_competence && (
          <div style={{
            ...cardStyle,
            background: verdict.circle_of_competence.in_circle ? 'rgba(48,209,88,0.04)' : 'rgba(239,68,68,0.04)',
            border: `1px solid ${verdict.circle_of_competence.in_circle ? '#30d158' : '#ef4444'}40`,
          }}>
            <div style={labelStyle}>🎯 Círculo de competencia</div>
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700,
              color: verdict.circle_of_competence.in_circle ? '#30d158' : '#ef4444',
            }}>
              {verdict.circle_of_competence.in_circle ? '✓ Dentro del círculo' : '✗ Fuera del círculo'}
            </div>
            {verdict.circle_of_competence.business_summary && (
              <div style={{ fontSize: 10, color: 'var(--text-primary)', marginTop: 4, lineHeight: 1.4 }}>
                {verdict.circle_of_competence.business_summary}
              </div>
            )}
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Moat: <strong style={{ color: 'var(--gold)' }}>{verdict.circle_of_competence.moat_type || '—'}</strong>
              {' · '}{verdict.circle_of_competence.moat_strength || '—'}
            </div>
          </div>
        )}
      </div>

      {/* ============ THESIS ============ */}
      {verdict.thesis && (
        <div style={{ ...cardStyle, background: 'rgba(200,164,78,0.04)', borderLeft: '3px solid var(--gold)' }}>
          <div style={labelStyle}>📖 Tesis central</div>
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.6 }}>
            {verdict.thesis}
          </div>
        </div>
      )}

      {/* ============ RAZONES SÍ / NO ============ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 8 }}>
        <ReasonsList title="✓ Razones SÍ" items={verdict.reasons_yes} color="#30d158" />
        <ReasonsList title="✗ Razones NO" items={verdict.reasons_no} color="#ef4444" />
      </div>

      {/* ============ DIVIDEND ANALYSIS (only if provided) ============ */}
      {verdict.dividend_analysis && (
        <div style={{ ...cardStyle }}>
          <div style={labelStyle}>💎 Análisis del dividendo</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 6, fontSize: 11 }}>
            <StatBlock label="Safety" value={`${verdict.dividend_analysis.safety_1to10 || '—'}/10`}
              color={verdict.dividend_analysis.safety_1to10 >= 7 ? '#30d158' : verdict.dividend_analysis.safety_1to10 >= 5 ? 'var(--gold)' : '#ef4444'} />
            <StatBlock label="Growth sostenible" value={`${verdict.dividend_analysis.growth_sustainability_1to10 || '—'}/10`}
              color={verdict.dividend_analysis.growth_sustainability_1to10 >= 7 ? '#30d158' : verdict.dividend_analysis.growth_sustainability_1to10 >= 5 ? 'var(--gold)' : '#ef4444'} />
            {verdict.dividend_analysis.streak_years != null && (
              <StatBlock label="Streak" value={`${verdict.dividend_analysis.streak_years}y`}
                color={verdict.dividend_analysis.streak_years >= 25 ? '#30d158' : verdict.dividend_analysis.streak_years >= 10 ? 'var(--gold)' : 'var(--text-secondary)'} />
            )}
          </div>
          {verdict.dividend_analysis.payout_comment && (
            <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-secondary)' }}>
              <strong>Payout:</strong> {verdict.dividend_analysis.payout_comment}
            </div>
          )}
          {verdict.dividend_analysis.cut_risk_comment && (
            <div style={{ marginTop: 2, fontSize: 10, color: 'var(--text-secondary)' }}>
              <strong>Riesgo de corte:</strong> {verdict.dividend_analysis.cut_risk_comment}
            </div>
          )}
        </div>
      )}

      {/* ============ KEY METRICS SNAPSHOT ============ */}
      {verdict.key_metrics_snapshot && (
        <div style={{ ...cardStyle }}>
          <div style={labelStyle}>📊 Métricas clave</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginTop: 6 }}>
            <Metric label="P/E TTM" value={verdict.key_metrics_snapshot.pe_ttm} />
            <Metric label="P/E Fwd" value={verdict.key_metrics_snapshot.pe_forward} />
            <Metric label="Yield %" value={verdict.key_metrics_snapshot.dividend_yield_pct} suffix="%" />
            <Metric label="Payout/FCF" value={verdict.key_metrics_snapshot.payout_fcf_pct} suffix="%" color={verdict.key_metrics_snapshot.payout_fcf_pct > 80 ? '#ef4444' : verdict.key_metrics_snapshot.payout_fcf_pct > 60 ? '#f59e0b' : '#30d158'} />
            <Metric label="Net Debt/EBITDA" value={verdict.key_metrics_snapshot.net_debt_to_ebitda} suffix="x" color={verdict.key_metrics_snapshot.net_debt_to_ebitda > 3 ? '#ef4444' : verdict.key_metrics_snapshot.net_debt_to_ebitda > 2 ? '#f59e0b' : '#30d158'} />
            <Metric label="ROIC 5y avg" value={verdict.key_metrics_snapshot.roic_5y_avg_pct} suffix="%" color={verdict.key_metrics_snapshot.roic_5y_avg_pct >= 15 ? '#30d158' : verdict.key_metrics_snapshot.roic_5y_avg_pct >= 10 ? 'var(--gold)' : '#f59e0b'} />
            <Metric label="FCF cover div" value={verdict.key_metrics_snapshot.fcf_coverage_dividend} suffix="x" color={verdict.key_metrics_snapshot.fcf_coverage_dividend >= 1.5 ? '#30d158' : verdict.key_metrics_snapshot.fcf_coverage_dividend >= 1 ? 'var(--gold)' : '#ef4444'} />
          </div>
        </div>
      )}

      {/* ============ VALUATION METHODS (5 methods) ============ */}
      {Array.isArray(verdict.valuation_methods) && verdict.valuation_methods.length > 0 && (
        <div style={{ ...cardStyle, background: 'rgba(200,164,78,0.03)' }}>
          <div style={labelStyle}>📐 Valoración — 5 métodos independientes</div>
          <div style={{ marginTop: 8 }}>
            {verdict.valuation_methods.map((m, i) => {
              const fv = m.fair_value;
              const price = verdict.margin_of_safety?.current_price
                ? parseFloat(String(verdict.margin_of_safety.current_price).replace(/[^\d.-]/g, ''))
                : null;
              const hasFv = fv != null && Number.isFinite(Number(fv)) && Number(fv) > 0;
              const pct = hasFv && price ? ((fv - price) / price) * 100 : null;
              // Color by price-vs-FV when usable; muted when Opus flagged unusable
              const color = !m.usable ? 'var(--text-tertiary)'
                : pct > 10 ? '#30d158'
                : pct < -10 ? '#ef4444'
                : 'var(--gold)';
              return (
                <div key={i} style={{
                  display: 'grid',
                  gridTemplateColumns: '1.4fr 0.9fr 0.6fr 2fr',
                  gap: 10,
                  padding: '7px 0',
                  borderBottom: i < verdict.valuation_methods.length - 1 ? '1px solid var(--border)' : 'none',
                  alignItems: 'center',
                  fontSize: 11,
                  opacity: m.usable ? 1 : 0.75,
                }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--fm)' }}>
                    {m.method}
                    {!m.usable && <span style={{ marginLeft: 4, fontSize: 9, color: '#f59e0b' }}>⚠</span>}
                  </div>
                  <div style={{ fontWeight: 700, color, fontFamily: 'var(--fm)' }}>
                    {hasFv ? `$${Number(fv).toFixed(2)}` : '—'}
                  </div>
                  <div style={{ fontWeight: 700, color, fontFamily: 'var(--fm)', fontSize: 10 }}>
                    {pct != null ? `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%` : ''}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 10, lineHeight: 1.4 }}>
                    {m.comment}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 6, fontSize: 9, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
            Fair value calculado por el backend (matemática determinística). Oracle interpreta, no calcula.
          </div>
        </div>
      )}

      {/* ============ CATALYST + EXIT TRIGGER ============ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {verdict.catalyst && (
          <div style={{ ...cardStyle, background: 'rgba(48,209,88,0.04)', borderLeft: '3px solid #30d158' }}>
            <div style={labelStyle}>🚀 Catalizador</div>
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.5 }}>
              {verdict.catalyst}
            </div>
          </div>
        )}
        {verdict.exit_trigger && (
          <div style={{ ...cardStyle, background: 'rgba(239,68,68,0.04)', borderLeft: '3px solid #ef4444' }}>
            <div style={labelStyle}>🚪 Exit trigger</div>
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.5 }}>
              {verdict.exit_trigger}
            </div>
          </div>
        )}
      </div>

      {/* ============ SIZE GUIDANCE + SECTOR ============ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {verdict.size_guidance && (
          <div style={{ ...cardStyle }}>
            <div style={labelStyle}>📐 Size sugerido (Oracle)</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold)', marginTop: 4, fontFamily: 'var(--fm)' }}>
              {verdict.size_guidance.base_case_pct_nlv || 0}% NLV
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
              max {verdict.size_guidance.max_pct_nlv || 0}% · {verdict.size_guidance.action_if_buying || '—'}
            </div>
            {verdict.size_guidance.comment && (
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.4 }}>
                {verdict.size_guidance.comment}
              </div>
            )}
            {suggestedUSD > 0 && (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--border)', fontSize: 10, color: 'var(--text-tertiary)' }}>
                = ${suggestedUSD.toLocaleString()} {livePrice ? ` · ~${Math.floor(suggestedUSD/livePrice)} acc @ $${livePrice.toFixed(2)}` : ''}
              </div>
            )}
          </div>
        )}
        <div style={{ ...cardStyle }}>
          <div style={labelStyle}>Sector ({sector})</div>
          <div style={{ marginTop: 4, fontSize: 12 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Actual: </span>
            <span style={{ fontWeight: 700,
              color: sectorStatus === 'overweight' ? '#f59e0b' : sectorStatus === 'underweight' ? '#30d158' : 'var(--text-secondary)',
            }}>{(currentWeight || 0).toFixed(1)}%</span>
            <span style={{ color: 'var(--text-tertiary)' }}> / target {sectorTarget}%</span>
          </div>
          <div style={{ fontSize: 10, marginTop: 2,
            color: sectorStatus === 'overweight' ? '#f59e0b' : sectorStatus === 'underweight' ? '#30d158' : 'var(--text-secondary)',
          }}>
            {sectorStatus === 'overweight' && '⚠ Overweight — reducir size'}
            {sectorStatus === 'underweight' && '✓ Underweight — puede ampliar'}
            {sectorStatus === 'aligned' && '○ Aligned con target'}
          </div>
        </div>
      </div>

      {/* ============ DATA GAPS ============ */}
      {Array.isArray(verdict.data_gaps) && verdict.data_gaps.length > 0 && (
        <div style={{ ...cardStyle, background: 'rgba(100,210,255,0.04)' }}>
          <div style={labelStyle}>🔎 Lo que le pediría al CFO</div>
          <ul style={{ margin: '6px 0 0 0', padding: '0 0 0 16px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {verdict.data_gaps.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        </div>
      )}

      {/* ============ REGISTRATION FORM ============ */}
      <div style={{ ...cardStyle, borderTop: '2px solid var(--gold)', marginTop: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fm)', marginBottom: 8 }}>
          ✍️ Tu decisión (registrar en Journal)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <NumInput label="Acciones" value={shares} onChange={setShares} placeholder="100" />
          <NumInput label="Precio entrada" value={price} onChange={setPrice} placeholder="0.00" />
          <SelectInput label="Horizonte" value={horizon} onChange={setHorizon} options={[
            { v: '3m', l: '3 meses' }, { v: '6m', l: '6 meses' }, { v: '1y', l: '1 año' },
            { v: '3y', l: '3 años' }, { v: '5y', l: '5 años' }, { v: '10y', l: '10 años' },
          ]} />
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={{ ...labelStyle, fontWeight: 600 }}>1. Mi tesis en 1-2 frases — ¿por qué compro?</label>
          <textarea value={tesis.razon} onChange={e => setTesis({ ...tesis, razon: e.target.value })}
            rows={2} placeholder={verdict.one_liner || 'Ej: Yield 4% sostenible, FCF 1.5x cover, sector underweight'}
            style={textareaStyle} />
        </div>
        <div style={{ marginTop: 6 }}>
          <label style={{ ...labelStyle, fontWeight: 600 }}>2. Catalizador esperado (opcional)</label>
          <textarea value={tesis.catalizador} onChange={e => setTesis({ ...tesis, catalizador: e.target.value })}
            rows={1} placeholder={verdict.catalyst || 'Ej: IRS ruling Q3, spinoff Q4'}
            style={textareaStyle} />
        </div>
        <div style={{ marginTop: 6 }}>
          <label style={{ ...labelStyle, fontWeight: 600, color: '#ff9f0a' }}>3. ¿Qué haría ESTA decisión errónea? ★</label>
          <textarea value={tesis.wrong} onChange={e => setTesis({ ...tesis, wrong: e.target.value })}
            rows={2} placeholder={verdict.exit_trigger || 'Ej: si FCF cover cae bajo 1.0x por 2y'}
            style={{ ...textareaStyle, borderColor: '#ff9f0a40' }} />
        </div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={labelStyle}>Mi convicción:</span>
          <input type="range" min="1" max="10" value={conviction}
            onChange={e => setConviction(Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fm)', minWidth: 28 }}>{conviction}/10</span>
        </div>
        {verdict.conviction && verdict.conviction !== conviction && (
          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 2, textAlign: 'right' }}>
            Oracle sugirió {verdict.conviction}/10
          </div>
        )}
      </div>

      {/* ============ ACTIONS ============ */}
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button onClick={onCancel} style={{
          flex: 1, padding: '10px 16px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'transparent',
          color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>Cancelar</button>
        <button onClick={onRegister} disabled={!requiredFilled} style={{
          flex: 2, padding: '10px 16px', borderRadius: 8,
          border: `1px solid ${requiredFilled ? actionColor : 'var(--border)'}`,
          background: requiredFilled ? `${actionColor}20` : 'var(--subtle-bg)',
          color: requiredFilled ? actionColor : 'var(--text-tertiary)',
          fontSize: 12, fontWeight: 700,
          cursor: requiredFilled ? 'pointer' : 'not-allowed',
        }}>
          ✓ Registrar {isNew ? 'compra' : 'add'} en Journal + alerta stop -10%
        </button>
      </div>
      {!requiredFilled && (
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center' }}>
          Completa: razón · qué haría incorrecta · acciones · precio
        </div>
      )}
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────

function ReasonsList({ title, items, color }) {
  if (!Array.isArray(items) || !items.length) return null;
  return (
    <div style={{ ...cardStyle, background: `${color}08`, border: `1px solid ${color}30` }}>
      <div style={{ ...labelStyle, color }}>{title}</div>
      <ol style={{ margin: '8px 0 0 0', padding: '0 0 0 18px', fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.5 }}>
        {items.slice(0, 5).map((r, i) => (
          <li key={i} style={{ marginBottom: 6 }}>
            <strong style={{ color, fontSize: 11 }}>{r.title || r}</strong>
            {r.detail && <div style={{ marginTop: 1, color: 'var(--text-secondary)', fontSize: 10, lineHeight: 1.5 }}>{r.detail}</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function BuffettCheck({ label, pass }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 10px', borderRadius: 6,
      background: pass ? 'rgba(48,209,88,0.08)' : 'rgba(239,68,68,0.08)',
      border: `1px solid ${pass ? '#30d158' : '#ef4444'}40`,
    }}>
      <span style={{ fontSize: 14 }}>{pass ? '✓' : '✗'}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: pass ? '#30d158' : '#ef4444' }}>{label}</span>
    </div>
  );
}

function StatBlock({ label, value, color = 'var(--text-primary)' }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--fm)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'var(--fm)', marginTop: 1 }}>{value}</div>
    </div>
  );
}

function Metric({ label, value, suffix = '', color = 'var(--text-primary)' }) {
  const display = value != null && !isNaN(value) ? `${Number(value).toFixed(Number(value) < 10 ? 2 : 1)}${suffix}` : '—';
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', letterSpacing: '.3px' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'var(--fm)', marginTop: 1 }}>{display}</div>
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

const textareaStyle = {
  width: '100%', marginTop: 4, padding: 8, fontSize: 11, fontFamily: 'var(--fm)',
  background: 'var(--subtle-bg)', border: '1px solid var(--border)', borderRadius: 6,
  color: 'var(--text-primary)', outline: 'none', resize: 'vertical',
};

function formatTimeAgo(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.round(hrs / 24)}d`;
}
