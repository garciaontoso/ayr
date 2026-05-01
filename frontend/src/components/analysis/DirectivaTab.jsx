import { useState, useEffect, useCallback } from 'react';
import { useAnalysis } from '../../context/AnalysisContext';
import { API_URL } from '../../constants';
import { Card } from '../ui';

/**
 * 👥 Directiva Tab
 *
 * Shows the executive team (C-suite) of the current ticker with:
 * - Tenure years (color-coded badge)
 * - Age, year born
 * - Total compensation
 * - Prior employers (regex'd from FMP fullDescription)
 * - Insider buying/selling last 12 months
 * - AI qualitative assessment (Claude Haiku 4.5)
 * - Green/red flags
 *
 * Endpoint:
 *   GET /api/directiva?ticker=X
 *   GET /api/directiva?ticker=X&force=1   (skip cache)
 *
 * Cache: R2 directiva/{ticker}.json — TTL 30 days.
 */

const fmtUSD = (n) => {
  if (!n || isNaN(n)) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

const tenureColor = (years) => {
  if (years == null || isNaN(years)) return { bg: 'rgba(150,150,150,.12)', c: 'var(--text-secondary)' };
  if (years >= 5) return { bg: 'rgba(48,209,88,.12)', c: '#30d158' };
  if (years >= 2) return { bg: 'rgba(255,214,10,.12)', c: '#ffd60a' };
  return { bg: 'rgba(255,69,58,.12)', c: '#ff453a' };
};

export default function DirectivaTab() {
  const { cfg } = useAnalysis();
  const ticker = (cfg?.ticker || '').toUpperCase();

  // TDZ-safe — declare state first
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDirectiva = useCallback(async (force = false) => {
    if (!ticker) return;
    if (force) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const qs = force ? `&force=1` : '';
      const r = await fetch(`${API_URL}/api/directiva?ticker=${encodeURIComponent(ticker)}${qs}`);
      const d = await r.json();
      if (!r.ok || d.error) {
        setError(d.error || `HTTP ${r.status}`);
        setData(null);
      } else {
        setData(d);
      }
    } catch (e) {
      setError(`Error: ${e.message}`);
    }
    setLoading(false);
    setRefreshing(false);
  }, [ticker]);

  useEffect(() => { fetchDirectiva(false); }, [fetchDirectiva]);

  if (!ticker) return <Card><div style={{padding:24,color:'var(--text-secondary)'}}>Selecciona un ticker</div></Card>;

  if (loading) {
    return <Card>
      <div style={{padding:24,color:'var(--text-secondary)'}}>Cargando directiva de {ticker}…</div>
    </Card>;
  }

  if (error) {
    return <Card>
      <div style={{padding:24}}>
        <div style={{color:'#ff453a',marginBottom:12}}>{error}</div>
        <button
          onClick={() => fetchDirectiva(true)}
          style={btnStyle}
        >Reintentar</button>
      </div>
    </Card>;
  }

  if (!data || !data.executives || data.executives.length === 0) {
    return <Card>
      <div style={{padding:24,color:'var(--text-secondary)'}}>
        Sin datos de directiva para {ticker}. FMP puede no cubrir tickers extranjeros.
      </div>
    </Card>;
  }

  // CEO highlight: first exec whose title matches CEO/Chief Executive
  const ceo = data.executives.find(e => /chief\s*executive|^ceo\b/i.test(e.title)) || data.executives[0];
  const others = data.executives.filter(e => e !== ceo).slice(0, 8);
  const insider = data.insider_activity_12m || {};
  const totalComp = data.total_compensation_usd || 0;

  // Top 5 by pay for the bar
  const topPaid = [...data.executives]
    .filter(e => e.pay_usd > 0)
    .sort((a, b) => b.pay_usd - a.pay_usd)
    .slice(0, 5);
  const maxPay = topPaid[0]?.pay_usd || 1;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      {/* CEO featured card */}
      <Card glow title={`${data.company || ticker} — Equipo directivo`} icon="👥">
        <div style={{display:'flex',gap:20,flexWrap:'wrap',alignItems:'flex-start'}}>
          {/* CEO avatar (initials in a gold ring) */}
          <div style={{
            width:88,height:88,borderRadius:'50%',
            display:'flex',alignItems:'center',justifyContent:'center',
            background:'linear-gradient(135deg,#c8a44e 0%,#8a6f2f 100%)',
            color:'#000',fontSize:28,fontWeight:700,letterSpacing:-1,
            border:'2px solid rgba(200,164,78,.3)',
            boxShadow:'0 0 24px rgba(200,164,78,.25)',
            flexShrink:0,
          }}>
            {(ceo.name || '??').split(' ').slice(-2).map(s => s[0] || '').join('').toUpperCase()}
          </div>
          {/* CEO info */}
          <div style={{flex:1,minWidth:240}}>
            <div style={{fontSize:11,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:1.2}}>{ceo.title}</div>
            <div style={{fontSize:22,fontWeight:600,marginTop:4,color:'var(--text-primary)'}}>{ceo.name}</div>
            <div style={{display:'flex',gap:14,marginTop:10,flexWrap:'wrap',fontSize:13,color:'var(--text-secondary)'}}>
              {ceo.tenure_years != null && (
                <span><b style={{color:tenureColor(ceo.tenure_years).c}}>{ceo.tenure_years}y</b> en el cargo</span>
              )}
              {ceo.age && <span>· edad {ceo.age}</span>}
              {ceo.since_year && <span>· desde {ceo.since_year}</span>}
              {ceo.pay_usd > 0 && <span>· comp {fmtUSD(ceo.pay_usd)}</span>}
            </div>
            {ceo.prior_companies && ceo.prior_companies.length > 0 && (
              <div style={{marginTop:8,fontSize:12,color:'var(--text-secondary)'}}>
                Empresas previas: {ceo.prior_companies.join(' · ')}
              </div>
            )}
          </div>
          {/* Sector badges */}
          <div style={{display:'flex',flexDirection:'column',gap:6,fontSize:11,minWidth:140}}>
            {data.sector && <Pill label="Sector" value={data.sector} />}
            {data.industry && <Pill label="Industria" value={data.industry} />}
            {data.country && <Pill label="País" value={data.country} />}
          </div>
        </div>
      </Card>

      {/* AI Assessment */}
      {data.ai_assessment && (
        <Card glow title="Evaluación AI (Haiku 4.5)" icon="🧠">
          <div style={{
            padding:16,
            background:'rgba(200,164,78,.04)',
            border:'1px solid rgba(200,164,78,.2)',
            borderRadius:12,
            fontSize:14,
            lineHeight:1.6,
            color:'var(--text-primary)',
          }}>
            {data.ai_assessment}
          </div>
          {(data.green_flags?.length || data.red_flags?.length) ? (
            <div style={{display:'flex',gap:14,marginTop:14,flexWrap:'wrap'}}>
              {data.green_flags?.length > 0 && (
                <div style={{flex:1,minWidth:240}}>
                  <div style={{fontSize:11,color:'#30d158',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>✅ Green flags</div>
                  <ul style={{margin:0,padding:'0 0 0 18px',fontSize:13,color:'var(--text-primary)',lineHeight:1.7}}>
                    {data.green_flags.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}
              {data.red_flags?.length > 0 && (
                <div style={{flex:1,minWidth:240}}>
                  <div style={{fontSize:11,color:'#ff453a',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>⚠️ Red flags</div>
                  <ul style={{margin:0,padding:'0 0 0 18px',fontSize:13,color:'var(--text-primary)',lineHeight:1.7}}>
                    {data.red_flags.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </Card>
      )}

      {/* Insider activity 12m */}
      <Card title="Insider activity (12m)" icon="🕵️">
        <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
          <Stat label="Compras" value={insider.buy_count || 0} sub={fmtUSD(insider.buy_value_usd)} color="#30d158" />
          <Stat label="Ventas" value={insider.sell_count || 0} sub={fmtUSD(insider.sell_value_usd)} color="#ff453a" />
          <Stat
            label="Net"
            value={(insider.net_value_usd || 0) >= 0 ? `+${fmtUSD(insider.net_value_usd)}` : `−${fmtUSD(Math.abs(insider.net_value_usd))}`}
            sub={insider.net_value_usd >= 0 ? 'comprando' : 'vendiendo'}
            color={(insider.net_value_usd || 0) >= 0 ? '#30d158' : '#ff453a'}
          />
        </div>
      </Card>

      {/* Compensation bar chart top 5 */}
      {topPaid.length > 0 && (
        <Card title={`Top ${topPaid.length} compensación · total ${fmtUSD(totalComp)}`} icon="💰">
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {topPaid.map((e, i) => (
              <div key={i} style={{display:'flex',alignItems:'center',gap:12}}>
                <div style={{flex:'0 0 200px',fontSize:12,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  <span style={{fontWeight:600}}>{e.name}</span>
                  <span style={{color:'var(--text-secondary)',marginLeft:6,fontSize:11}}>{shortTitle(e.title)}</span>
                </div>
                <div style={{flex:1,height:14,background:'rgba(255,255,255,.05)',borderRadius:7,overflow:'hidden'}}>
                  <div style={{
                    height:'100%',
                    width:`${(e.pay_usd / maxPay) * 100}%`,
                    background:'linear-gradient(90deg,#c8a44e,#8a6f2f)',
                    borderRadius:7,
                  }}/>
                </div>
                <div style={{flex:'0 0 70px',textAlign:'right',fontSize:12,color:'var(--text-primary)',fontVariantNumeric:'tabular-nums'}}>{fmtUSD(e.pay_usd)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Full executives table */}
      <Card title={`Todos los ejecutivos (${data.executives.length})`} icon="📋">
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{borderBottom:'1px solid var(--border)',color:'var(--text-secondary)',fontSize:11,textTransform:'uppercase',letterSpacing:.8}}>
                <th style={th}>Nombre</th>
                <th style={th}>Cargo</th>
                <th style={{...th,textAlign:'center'}}>Tenure</th>
                <th style={{...th,textAlign:'center'}}>Edad</th>
                <th style={{...th,textAlign:'center'}}>Desde</th>
                <th style={{...th,textAlign:'right'}}>Comp</th>
              </tr>
            </thead>
            <tbody>
              {data.executives.map((e, i) => {
                const tc = tenureColor(e.tenure_years);
                return (
                  <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={td}>
                      <div style={{fontWeight:600,color:'var(--text-primary)'}}>{e.name}</div>
                      {e.prior_companies?.length > 0 && (
                        <div style={{fontSize:10,color:'var(--text-secondary)',marginTop:2}}>prev: {e.prior_companies.slice(0,2).join(', ')}</div>
                      )}
                    </td>
                    <td style={{...td,color:'var(--text-secondary)'}}>{shortTitle(e.title)}</td>
                    <td style={{...td,textAlign:'center'}}>
                      <span style={{
                        display:'inline-block',padding:'3px 8px',borderRadius:6,fontSize:11,fontWeight:600,
                        background:tc.bg,color:tc.c,
                      }}>{e.tenure_years != null ? `${e.tenure_years}y` : '—'}</span>
                    </td>
                    <td style={{...td,textAlign:'center',color:'var(--text-secondary)'}}>{e.age ?? '—'}</td>
                    <td style={{...td,textAlign:'center',color:'var(--text-secondary)'}}>{e.since_year || '—'}</td>
                    <td style={{...td,textAlign:'right',fontVariantNumeric:'tabular-nums',color:'var(--text-primary)'}}>{e.pay_usd > 0 ? fmtUSD(e.pay_usd) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Refresh footer */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:11,color:'var(--text-secondary)',padding:'4px 8px'}}>
        <div>
          {data.source === 'r2_cache' ? '📦 Cache R2 · 30d TTL' : '🔄 Live · FMP + Haiku'}
          {data.cached_at && <span style={{marginLeft:8}}>· {new Date(data.cached_at).toLocaleString('es-ES')}</span>}
        </div>
        <button onClick={() => fetchDirectiva(true)} disabled={refreshing} style={btnStyle}>
          {refreshing ? 'Refrescando…' : '🔄 Refrescar'}
        </button>
      </div>
    </div>
  );
}

const Pill = ({ label, value }) => (
  <div style={{
    padding:'6px 10px',
    background:'rgba(255,255,255,.04)',
    border:'1px solid var(--border)',
    borderRadius:8,
    fontSize:11,
  }}>
    <div style={{color:'var(--text-secondary)',fontSize:9,textTransform:'uppercase',letterSpacing:.8}}>{label}</div>
    <div style={{color:'var(--text-primary)',marginTop:2,fontWeight:500}}>{value}</div>
  </div>
);

const Stat = ({ label, value, sub, color }) => (
  <div style={{
    flex:1,minWidth:120,
    padding:'12px 14px',
    background:'rgba(255,255,255,.03)',
    border:'1px solid var(--border)',
    borderRadius:10,
  }}>
    <div style={{fontSize:10,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:1}}>{label}</div>
    <div style={{fontSize:20,fontWeight:600,color:color || 'var(--text-primary)',marginTop:4,fontVariantNumeric:'tabular-nums'}}>{value}</div>
    {sub && <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>{sub}</div>}
  </div>
);

const shortTitle = (t) => {
  if (!t) return '—';
  return t
    .replace(/Chief Executive Officer/i, 'CEO')
    .replace(/Chief Financial Officer/i, 'CFO')
    .replace(/Chief Operating Officer/i, 'COO')
    .replace(/Chief Technology Officer/i, 'CTO')
    .replace(/Chief Marketing Officer/i, 'CMO')
    .replace(/Chief Information Officer/i, 'CIO')
    .replace(/Chief Strategy Officer/i, 'CSO')
    .replace(/Chief Legal Officer/i, 'CLO')
    .replace(/Chief People Officer/i, 'CPO')
    .replace(/Executive Vice President/i, 'EVP')
    .replace(/Senior Vice President/i, 'SVP');
};

const th = { padding:'10px 8px', textAlign:'left', fontWeight:600 };
const td = { padding:'10px 8px', verticalAlign:'top' };
const btnStyle = {
  padding:'6px 12px',
  background:'rgba(200,164,78,.1)',
  color:'#c8a44e',
  border:'1px solid rgba(200,164,78,.3)',
  borderRadius:8,
  fontSize:12,
  fontWeight:600,
  cursor:'pointer',
};
