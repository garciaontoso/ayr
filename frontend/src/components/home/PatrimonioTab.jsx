import { useState, useMemo } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf, fDol } from '../../utils/formatters.js';

// ═══════════════════════════════════════
// Proyección de Patrimonio Component
// ═══════════════════════════════════════
function ProyeccionSection({ CTRL_DATA, INCOME_DATA, DIV_BY_YEAR, GASTOS_MONTH, fxRates }) {
  const data = CTRL_DATA.filter(c => c.pu > 0).sort((a,b) => (a.d||"").localeCompare(b.d||""));
  const latest = data[data.length - 1] || {};
  const fxEurUsd = fxRates?.EUR ? 1/fxRates.EUR : latest?.fx || 1.15;

  // ─── Real data extraction ───
  const currentPat = latest.pu || 0;
  const currentYear = new Date().getFullYear();

  // Historical CAGR from real data
  const first = data[0] || {};
  const totalYears = data.length > 1 ? ((new Date(latest.d) - new Date(first.d)) / (365.25*24*3600*1000)) : 1;
  const historicalCAGR = first.pu > 0 ? ((Math.pow(latest.pu / first.pu, 1/totalYears) - 1) * 100) : 7;

  // Average salary from INCOME_DATA
  const salaries = INCOME_DATA.filter(d => d.sl > 0).map(d => d.sl);
  const avgSalaryUSD = salaries.length > 0 ? salaries.reduce((s,v) => s+v, 0) / salaries.length * 12 : 0;

  // Annual dividends (last full year)
  const divYears = Object.keys(DIV_BY_YEAR).sort();
  const lastDivYear = divYears.length >= 2 ? divYears[divYears.length - 2] : divYears[divYears.length - 1];
  const annualDivUSD = lastDivYear ? (DIV_BY_YEAR[lastDivYear]?.n || 0) : 0;

  // Annual options income from INCOME_DATA
  const last12Income = INCOME_DATA.slice(-12);
  const annualOptionsUSD = last12Income.reduce((s,d) => s + (d.cs||0) + (d.rop||0) + (d.roc||0) + (d.cal||0) + (d.leaps||0), 0);

  // Average annual gastos from GASTOS_MONTH
  const gMonths = Object.keys(GASTOS_MONTH).sort().slice(-12);
  const avgGastosMensual = gMonths.length > 0 ? gMonths.reduce((s,m) => {
    const d = GASTOS_MONTH[m];
    return s + (d.eur||0) * fxEurUsd + (d.cny||0) / 7.25 + (d.usd||0);
  }, 0) / gMonths.length : 7580;
  const annualGastosUSD = avgGastosMensual * 12;

  // ─── Editable Params ───
  const [params, setParams] = useState({
    patrimonioInicial: Math.round(currentPat),
    retorno: Math.round(historicalCAGR * 10) / 10 || 7,
    inflacion: 2.5,
    salarioAnual: Math.round(avgSalaryUSD),
    dividendosAnual: Math.round(annualDivUSD),
    opcionesAnual: Math.round(annualOptionsUSD),
    gastosAnual: Math.round(annualGastosUSD),
    crecimientoSueldo: 3,
    crecimientoDividendos: 8,
    anosProyeccion: 20,
    edadActual: 40,
    edadRetiro: 55,
    incluirSueldo: true,
    incluirOpciones: true,
  });

  const [scenario, setScenario] = useState('base');

  const SCENARIOS = {
    base: { name: '📊 Base', desc: 'Datos reales actuales', retorno: params.retorno, inflacion: params.inflacion },
    conservador: { name: '🛡️ Conservador', desc: '5% retorno, 3.5% inflación', retorno: 5, inflacion: 3.5 },
    optimista: { name: '🚀 Optimista', desc: '10% retorno, 2% inflación', retorno: 10, inflacion: 2 },
    crisis: { name: '💥 Crisis', desc: '2% retorno, 4% inflación, sin sueldo', retorno: 2, inflacion: 4 },
  };

  const up = (field, value) => setParams(p => ({ ...p, [field]: value }));

  // ─── Projection engine ───
  const projection = useMemo(() => {
    const sc = SCENARIOS[scenario];
    const retornoPct = scenario === 'base' ? params.retorno : sc.retorno;
    const inflacionPct = scenario === 'base' ? params.inflacion : sc.inflacion;
    const rows = [];

    let pat = params.patrimonioInicial;
    let gastos = params.gastosAnual;
    let sueldo = params.salarioAnual;
    let divs = params.dividendosAnual;
    let opciones = params.opcionesAnual;

    for (let i = 0; i <= params.anosProyeccion; i++) {
      const year = currentYear + i;
      const edad = params.edadActual + i;
      const retirado = edad >= params.edadRetiro;

      const patInicio = pat;
      const rentabilidad = pat * (retornoPct / 100);

      // After retirement: no salary, no options
      const ingresoSueldo = (retirado || !params.incluirSueldo) ? 0 : sueldo;
      const ingresoOpciones = (retirado || !params.incluirOpciones) ? 0 : opciones;
      const ingresoDividendos = divs;
      const ingresoTotal = rentabilidad + ingresoSueldo + ingresoDividendos + ingresoOpciones;
      const gastoInflado = gastos;
      const netCashFlow = ingresoSueldo + ingresoDividendos + ingresoOpciones - gastoInflado;
      const ahorro = ingresoSueldo - gastoInflado;

      pat = patInicio + rentabilidad + netCashFlow;
      if (pat < 0) pat = 0;

      const retReal = retornoPct - inflacionPct;
      const patReal = i === 0 ? patInicio : patInicio / Math.pow(1 + inflacionPct/100, i);
      const fireNumber = gastos / (retornoPct / 100);

      rows.push({
        year, edad, retirado,
        patInicio, rentabilidad, retornoPct,
        ingresoSueldo, ingresoDividendos, ingresoOpciones, ingresoTotal,
        gastos: gastoInflado, netCashFlow, ahorro,
        patFinal: pat,
        retReal,
        patReal: pat / Math.pow(1 + inflacionPct/100, i+1),
        inflacionAcum: Math.pow(1 + inflacionPct/100, i+1) - 1,
        fireNumber,
        firePct: pat / fireNumber * 100,
      });

      // Grow for next year
      gastos *= (1 + inflacionPct / 100);
      sueldo *= (1 + params.crecimientoSueldo / 100);
      divs *= (1 + params.crecimientoDividendos / 100);
      opciones *= 1.03; // modest 3% growth
    }
    return rows;
  }, [params, scenario, currentYear]);

  // ─── Milestones ───
  const milestones = useMemo(() => {
    const m = [];
    const targets = [500000, 1000000, 1500000, 2000000, 3000000, 5000000];
    for (const t of targets) {
      const row = projection.find(r => r.patFinal >= t);
      if (row && (projection[0]?.patInicio || 0) < t) m.push({ target: t, year: row.year, edad: row.edad });
    }
    const fireRow = projection.find(r => r.firePct >= 100);
    if (fireRow) m.push({ target: 'FIRE', year: fireRow.year, edad: fireRow.edad, label: '🔥 FIRE' });
    return m;
  }, [projection]);

  const fN = v => `$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const fNs = v => `${v >= 0 ? '' : '-'}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 };
  const retCol = v => v > 0 ? "var(--green)" : v < 0 ? "var(--red)" : "var(--text-secondary)";

  const lastRow = projection[projection.length - 1] || {};
  const retiroRow = projection.find(r => r.retirado) || {};
  const maxPat = Math.max(...projection.map(r => r.patFinal), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Scenario selector */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {Object.entries(SCENARIOS).map(([id, sc]) => (
          <button key={id} onClick={() => setScenario(id)}
            style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${scenario === id ? 'var(--gold)' : 'var(--border)'}`, background: scenario === id ? 'var(--gold-dim)' : 'transparent', color: scenario === id ? 'var(--gold)' : 'var(--text-tertiary)', fontSize: 11, fontWeight: scenario === id ? 700 : 500, cursor: 'pointer', fontFamily: 'var(--fb)' }}>
            {sc.name}
          </button>
        ))}
      </div>

      {/* KPI summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {[
          { l: 'PATRIMONIO HOY', v: fN(params.patrimonioInicial), c: 'var(--gold)' },
          { l: `PATRIMONIO ${lastRow.year}`, v: fN(lastRow.patFinal || 0), sub: `en ${params.anosProyeccion} años`, c: 'var(--green)' },
          { l: 'PATRIMONIO REAL', v: fN(lastRow.patReal || 0), sub: `ajust. inflación ${(lastRow.inflacionAcum*100).toFixed(0)}%`, c: '#64d2ff' },
          { l: 'MULTIPLICADOR', v: `${((lastRow.patFinal || 0) / (params.patrimonioInicial || 1)).toFixed(1)}x`, sub: `nominal`, c: 'var(--gold)' },
          { l: 'PAT. JUBILACIÓN', v: fN(retiroRow.patInicio || 0), sub: `edad ${params.edadRetiro} (${retiroRow.year || '?'})`, c: 'var(--orange)' },
          { l: 'FIRE %', v: `${((retiroRow.firePct || 0)).toFixed(0)}%`, sub: retiroRow.firePct >= 100 ? '✅ Cubierto' : '❌ Insuficiente', c: (retiroRow.firePct || 0) >= 100 ? 'var(--green)' : 'var(--red)' },
        ].map((k, i) => (
          <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', letterSpacing: .8, fontWeight: 600, marginBottom: 6 }}>{k.l}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--fm)', color: k.c, lineHeight: 1.1 }}>{k.v}</div>
            {k.sub && <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginTop: 3 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Params editor + Results side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {/* Params */}
        <div style={{ ...card }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 10, fontFamily: 'var(--fd)' }}>⚙️ Parámetros</div>
          {[
            ['Patrimonio inicial ($)', 'patrimonioInicial', 10000],
            ['Retorno anual (%)', 'retorno', 0.5],
            ['Inflación (%)', 'inflacion', 0.1],
            ['Salario anual ($)', 'salarioAnual', 5000],
            ['Crecimiento sueldo (%)', 'crecimientoSueldo', 0.5],
            ['Dividendos anuales ($)', 'dividendosAnual', 500],
            ['Crecimiento dividendos (%)', 'crecimientoDividendos', 1],
            ['Opciones anuales ($)', 'opcionesAnual', 500],
            ['Gastos anuales ($)', 'gastosAnual', 1000],
            ['Años proyección', 'anosProyeccion', 1],
            ['Edad actual', 'edadActual', 1],
            ['Edad retiro', 'edadRetiro', 1],
          ].map(([label, field, step]) => (
            <div key={field} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>{label}</span>
              <input type="number" step={step} value={params[field]}
                onChange={e => up(field, parseFloat(e.target.value) || 0)}
                style={{ width: 95, padding: '3px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 11, fontFamily: 'var(--fm)', textAlign: 'right' }} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {[['Incluir sueldo', 'incluirSueldo'], ['Incluir opciones', 'incluirOpciones']].map(([lbl, f]) => (
              <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--fm)', cursor: 'pointer' }}>
                <input type="checkbox" checked={params[f]} onChange={e => up(f, e.target.checked)} style={{ accentColor: 'var(--gold)' }} />
                {lbl}
              </label>
            ))}
          </div>
          <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginTop: 8, fontStyle: 'italic' }}>
            💡 Datos pre-cargados de tu cartera real. Ajusta según tu plan.
          </div>
        </div>

        {/* Milestones */}
        <div style={{ ...card }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 10, fontFamily: 'var(--fd)' }}>🏁 Hitos</div>
          {milestones.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Sin hitos alcanzables en el horizonte</div>
          ) : milestones.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < milestones.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: m.target === 'FIRE' ? 'rgba(255,159,10,.1)' : 'rgba(48,209,88,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                {m.target === 'FIRE' ? '🔥' : '💰'}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fm)' }}>
                  {m.label || (m.target >= 1e6 ? `$${(m.target/1e6).toFixed(1)}M` : `$${(m.target/1e3).toFixed(0)}K`)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
                  {m.year} · Edad {m.edad} · en {m.year - currentYear} años
                </div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 800, color: m.target === 'FIRE' ? 'var(--orange)' : 'var(--green)', fontFamily: 'var(--fm)' }}>
                {m.year - currentYear}a
              </div>
            </div>
          ))}
          {/* Mini insights */}
          <div style={{ marginTop: 12, padding: '10px', background: 'rgba(214,158,46,.04)', borderRadius: 8 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--gold)', fontFamily: 'var(--fm)', marginBottom: 4 }}>📌 DATOS REALES USADOS</div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', lineHeight: 1.6 }}>
              • Patrimonio actual: <b style={{ color: 'var(--text-secondary)' }}>{fN(currentPat)}</b><br/>
              • CAGR histórico ({_sf(totalYears,1)}a): <b style={{ color: 'var(--text-secondary)' }}>{_sf(historicalCAGR,1)}%</b><br/>
              • Sueldo medio: <b style={{ color: 'var(--text-secondary)' }}>{fN(avgSalaryUSD)}/año</b><br/>
              • Dividendos netos: <b style={{ color: 'var(--text-secondary)' }}>{fN(annualDivUSD)}/año</b><br/>
              • Opciones: <b style={{ color: 'var(--text-secondary)' }}>{fN(annualOptionsUSD)}/año</b><br/>
              • Gastos: <b style={{ color: 'var(--text-secondary)' }}>{fN(annualGastosUSD)}/año ({fN(avgGastosMensual)}/mes)</b>
            </div>
          </div>
        </div>
      </div>

      {/* Projection chart */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', fontFamily: 'var(--fd)', marginBottom: 12 }}>
          📈 Proyección Patrimonial — {SCENARIOS[scenario].name}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 200, padding: '0 4px' }}>
          {projection.map((r, i) => {
            const h = Math.max((r.patFinal / maxPat) * 100, 1);
            const isMilestone = milestones.some(m => m.year === r.year);
            const show = i === 0 || i === projection.length - 1 || i % Math.max(1, Math.floor(projection.length / 10)) === 0 || isMilestone;
            const isRetiro = r.year === retiroRow.year;
            const color = r.retirado ? (r.patFinal > 0 ? '#64d2ff' : 'var(--red)') : 'var(--gold)';
            return (
              <div key={r.year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', borderLeft: isRetiro ? '2px dashed var(--orange)' : 'none' }}
                title={`${r.year} (${r.edad} años)\nPatrimonio: ${fN(r.patFinal)}\nReal: ${fN(r.patReal)}\nIngresos: ${fN(r.ingresoTotal)}\nGastos: ${fN(r.gastos)}`}>
                {show && <div style={{ fontSize: 7, fontWeight: 600, color: r.patFinal >= 1e6 ? color : 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginBottom: 2, whiteSpace: 'nowrap' }}>
                  {r.patFinal >= 1e6 ? `$${(r.patFinal/1e6).toFixed(1)}M` : `$${(r.patFinal/1e3).toFixed(0)}K`}
                </div>}
                <div style={{ width: '100%', maxWidth: 18, height: `${h}%`, background: color, borderRadius: '2px 2px 0 0', opacity: 0.65 }} />
                {show && <div style={{ fontSize: 7, color: isRetiro ? 'var(--orange)' : 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginTop: 2, fontWeight: isRetiro ? 700 : 400, whiteSpace: 'nowrap' }}>
                  {isRetiro ? `🏖️${r.year}` : r.year}
                </div>}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8 }}>
          <span style={{ fontSize: 9, color: 'var(--gold)', fontFamily: 'var(--fm)' }}>● Fase trabajo</span>
          <span style={{ fontSize: 9, color: '#64d2ff', fontFamily: 'var(--fm)' }}>● Jubilación</span>
          <span style={{ fontSize: 9, color: 'var(--orange)', fontFamily: 'var(--fm)' }}>┊ Retiro ({params.edadRetiro})</span>
        </div>
      </div>

      {/* Nominal vs Real chart */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', fontFamily: 'var(--fd)', marginBottom: 12 }}>
          💡 Patrimonio Nominal vs Real (ajustado inflación)
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 140, padding: '0 4px' }}>
          {projection.map((r, i) => {
            const hNom = Math.max((r.patFinal / maxPat) * 100, 1);
            const hReal = Math.max((r.patReal / maxPat) * 100, 1);
            const show = i === 0 || i === projection.length - 1 || i % Math.max(1, Math.floor(projection.length / 6)) === 0;
            return (
              <div key={r.year} style={{ flex: 1, display: 'flex', gap: 1, alignItems: 'flex-end', justifyContent: 'center', height: '100%' }}>
                <div style={{ width: '40%', maxWidth: 8, height: `${hNom}%`, background: 'var(--gold)', borderRadius: '2px 2px 0 0', opacity: 0.5 }} title={`Nominal: ${fN(r.patFinal)}`} />
                <div style={{ width: '40%', maxWidth: 8, height: `${hReal}%`, background: '#64d2ff', borderRadius: '2px 2px 0 0', opacity: 0.5 }} title={`Real: ${fN(r.patReal)}`} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>{projection[0]?.year}</span>
          <span style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>{lastRow.year}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 6 }}>
          <span style={{ fontSize: 9, color: 'var(--gold)', fontFamily: 'var(--fm)' }}>● Nominal: {fN(lastRow.patFinal || 0)}</span>
          <span style={{ fontSize: 9, color: '#64d2ff', fontFamily: 'var(--fm)' }}>● Real: {fN(lastRow.patReal || 0)}</span>
          <span style={{ fontSize: 9, color: 'var(--red)', fontFamily: 'var(--fm)' }}>Inflación acum: {((lastRow.inflacionAcum||0)*100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Annual Projection Table */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', fontFamily: 'var(--fd)' }}>📋 Tabla Anual — {SCENARIOS[scenario].name}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, minWidth: 1100 }}>
            <thead>
              <tr>
                {['AÑO','EDAD','PAT. INICIO','RETORNO %','RENTAB. $','SUELDO','DIVS','OPC','GASTOS','AHORRO','PAT. FINAL','PAT. REAL','FIRE %'].map((h,i) => (
                  <th key={i} style={{ padding: '6px 8px', textAlign: i < 2 ? 'center' : 'right', color: 'var(--text-tertiary)', fontSize: 8, fontWeight: 600, fontFamily: 'var(--fm)', letterSpacing: .4, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--bg)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projection.map((r, i) => {
                const isRetiro = r.year === retiroRow.year;
                const bg = isRetiro ? 'rgba(255,159,10,.06)' : i % 2 ? 'rgba(255,255,255,.01)' : 'transparent';
                const td = { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--fm)', borderBottom: '1px solid rgba(255,255,255,.03)' };
                return (
                  <tr key={r.year} style={{ background: bg }}>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 600, color: isRetiro ? 'var(--orange)' : 'var(--text-secondary)' }}>{isRetiro ? `🏖️ ${r.year}` : r.year}</td>
                    <td style={{ ...td, textAlign: 'center', color: r.retirado ? 'var(--orange)' : 'var(--text-tertiary)' }}>{r.edad}</td>
                    <td style={{ ...td, color: 'var(--text-primary)', fontWeight: 600 }}>{fN(r.patInicio)}</td>
                    <td style={{ ...td, color: 'var(--text-tertiary)' }}>{r.retornoPct.toFixed(1)}%</td>
                    <td style={{ ...td, color: 'var(--green)' }}>{fN(r.rentabilidad)}</td>
                    <td style={{ ...td, color: r.ingresoSueldo > 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>{r.ingresoSueldo > 0 ? fN(r.ingresoSueldo) : '—'}</td>
                    <td style={{ ...td, color: '#64d2ff' }}>{fN(r.ingresoDividendos)}</td>
                    <td style={{ ...td, color: r.ingresoOpciones > 0 ? '#a29bfe' : 'var(--text-tertiary)' }}>{r.ingresoOpciones > 0 ? fN(r.ingresoOpciones) : '—'}</td>
                    <td style={{ ...td, color: 'var(--red)' }}>-{fN(r.gastos)}</td>
                    <td style={{ ...td, color: retCol(r.ahorro), fontWeight: 600 }}>{fNs(r.ahorro)}</td>
                    <td style={{ ...td, color: 'var(--gold)', fontWeight: 700 }}>{fN(r.patFinal)}</td>
                    <td style={{ ...td, color: '#64d2ff' }}>{fN(r.patReal)}</td>
                    <td style={{ ...td, fontWeight: 700, color: r.firePct >= 100 ? 'var(--green)' : r.firePct >= 70 ? 'var(--gold)' : 'var(--red)' }}>
                      {r.firePct.toFixed(0)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sensitivity: return % vs years */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', fontFamily: 'var(--fd)', marginBottom: 12 }}>
          🎯 Sensibilidad — Patrimonio Final según Retorno y Ahorro
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, minWidth: 500 }}>
            <thead>
              <tr>
                <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-tertiary)', fontSize: 8, fontWeight: 600, fontFamily: 'var(--fm)', borderBottom: '1px solid var(--border)' }}>
                  Retorno ↓ / Gastos →
                </th>
                {[60000, 80000, 100000, 120000, 150000].map(g => (
                  <th key={g} style={{ padding: '6px 8px', textAlign: 'center', color: Math.abs(params.gastosAnual - g) < 5000 ? 'var(--gold)' : 'var(--text-tertiary)', fontSize: 8, fontWeight: 600, fontFamily: 'var(--fm)', borderBottom: '1px solid var(--border)' }}>
                    ${(g/1e3).toFixed(0)}K
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[4, 5, 6, 7, 8, 10, 12].map(ret => (
                <tr key={ret}>
                  <td style={{ padding: '5px 8px', fontWeight: 600, fontFamily: 'var(--fm)', color: Math.abs(params.retorno - ret) < 0.5 ? 'var(--gold)' : 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,.03)' }}>{ret}%</td>
                  {[60000, 80000, 100000, 120000, 150000].map(g => {
                    // Quick sim: compound pat for N years
                    let p = params.patrimonioInicial;
                    let gs = g;
                    let sl = params.salarioAnual;
                    let dv = params.dividendosAnual;
                    for (let y = 0; y < params.anosProyeccion; y++) {
                      const edad = params.edadActual + y;
                      const retirado = edad >= params.edadRetiro;
                      p = p * (1 + ret/100) + (retirado ? 0 : sl) + dv - gs;
                      if (p < 0) { p = 0; break; }
                      gs *= 1.025; sl *= 1.03; dv *= 1.08;
                    }
                    const isActive = Math.abs(params.retorno - ret) < 0.5 && Math.abs(params.gastosAnual - g) < 5000;
                    return (
                      <td key={g} style={{
                        padding: '5px 8px', textAlign: 'center', fontWeight: isActive ? 800 : 600,
                        fontFamily: 'var(--fm)', borderBottom: '1px solid rgba(255,255,255,.03)',
                        color: p >= 2e6 ? 'var(--green)' : p >= 1e6 ? 'var(--gold)' : p > 0 ? 'var(--orange)' : 'var(--red)',
                        background: isActive ? 'rgba(214,158,46,.1)' : 'transparent',
                      }}>
                        {p >= 1e6 ? `$${(p/1e6).toFixed(1)}M` : p > 0 ? `$${(p/1e3).toFixed(0)}K` : '💀'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginTop: 6, textAlign: 'center' }}>
          Patrimonio final en {params.anosProyeccion} años · 🟢 ≥$2M · 🟡 ≥$1M · 🟠 &lt;$1M · 💀 quebrado
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// Main PatrimonioTab
// ═══════════════════════════════════════
export default function PatrimonioTab() {
  const { CTRL_DATA, INCOME_DATA, DIV_BY_YEAR, GASTOS_MONTH, fxRates } = useHome();
  const [section, setSection] = useState('historial');

  const data = CTRL_DATA.filter(c => c.pu > 0).sort((a,b) => (a.d||"").localeCompare(b.d||"")).map((c, i, arr) => {
  const prev = i > 0 ? arr[i-1] : null;
  const mReturnUsd = prev?.pu ? ((c.pu - prev.pu) / prev.pu * 100) : null;
  const mReturnEur = prev?.pe ? ((c.pe - prev.pe) / prev.pe * 100) : null;
  return { ...c, mReturnUsd, mReturnEur, idx: i };
});
const latest = data[data.length - 1] || {};
const first = data[0] || {};

// Group by year
const byYear = {};
data.forEach(d => {
  const y = d.d?.slice(0, 4);
  if (!y) return;
  if (!byYear[y]) byYear[y] = [];
  byYear[y].push(d);
});
const years = Object.keys(byYear).sort().reverse();

// Annual returns
const annualReturns = years.map(y => {
  const entries = byYear[y];
  const lastOfYear = entries[entries.length - 1];
  const prevYearEntries = byYear[String(parseInt(y, 10) - 1)];
  const lastOfPrevYear = prevYearEntries?.[prevYearEntries.length - 1];
  const ytdUsd = lastOfPrevYear?.pu ? ((lastOfYear.pu - lastOfPrevYear.pu) / lastOfPrevYear.pu * 100) : null;
  const ytdEur = lastOfPrevYear?.pe ? ((lastOfYear.pe - lastOfPrevYear.pe) / lastOfPrevYear.pe * 100) : null;
  return { y, ytdUsd, ytdEur, start: lastOfPrevYear?.pu, end: lastOfYear.pu, startEur: lastOfPrevYear?.pe, endEur: lastOfYear.pe, entries };
});

// CAGR
const totalYears = data.length > 1 ? ((new Date(latest.d) - new Date(first.d)) / (365.25 * 24 * 3600 * 1000)) : 1;
const cagrUsd = first.pu > 0 ? ((Math.pow(latest.pu / first.pu, 1 / totalYears) - 1) * 100) : 0;
const cagrEur = first.pe > 0 ? ((Math.pow(latest.pe / first.pe, 1 / totalYears) - 1) * 100) : 0;
const totalReturnUsd = first.pu ? ((latest.pu - first.pu) / first.pu * 100) : 0;
const totalReturnEur = first.pe ? ((latest.pe - first.pe) / first.pe * 100) : 0;

// Max drawdown (USD)
let peak = 0, maxDD = 0, ddEnd = "";
data.forEach(d => {
  if (d.pu > peak) peak = d.pu;
  const dd = peak > 0 ? ((d.pu - peak) / peak * 100) : 0;
  if (dd < maxDD) { maxDD = dd; ddEnd = d.d; }
});

// Chart data
const maxPu = Math.max(...data.map(d => d.pu || 0));

// Best and worst months
const monthlyReturns = data.filter(d => d.mReturnUsd != null);
const bestMonth = monthlyReturns.reduce((b, d) => (d.mReturnUsd > (b?.mReturnUsd || -Infinity)) ? d : b, null);
const worstMonth = monthlyReturns.reduce((w, d) => (d.mReturnUsd < (w?.mReturnUsd || Infinity)) ? d : w, null);
const avgMonthReturn = monthlyReturns.length > 0 ? monthlyReturns.reduce((s, d) => s + d.mReturnUsd, 0) / monthlyReturns.length : 0;
const positiveMonths = monthlyReturns.filter(d => d.mReturnUsd > 0).length;
const winRate = monthlyReturns.length > 0 ? (positiveMonths / monthlyReturns.length * 100) : 0;

const retCol = (v) => v > 0 ? "var(--green)" : v < 0 ? "var(--red)" : "var(--text-secondary)";
const retFmt = (v) => v == null ? "—" : `${v >= 0 ? "+" : ""}${_sf(v,1)}%`;

// Last month delta
const prevEntry = data.length >= 2 ? data[data.length - 2] : null;
const monthDeltaUsd = prevEntry ? (latest.pu - prevEntry.pu) : 0;
const monthDeltaPct = prevEntry?.pu ? ((latest.pu - prevEntry.pu) / prevEntry.pu * 100) : 0;

// Mini sparkline points (last 12 data points)
const spark = data.slice(-12);
const sparkMin = Math.min(...spark.map(d=>d.pu||0));
const sparkMax = Math.max(...spark.map(d=>d.pu||0));
const sparkRange = sparkMax - sparkMin || 1;
const sparkW = 120, sparkH = 32;
const sparkPath = spark.map((d,i) => {
  const x = spark.length > 1 ? (i / (spark.length-1)) * sparkW : sparkW/2;
  const y = sparkH - ((d.pu - sparkMin) / sparkRange) * sparkH;
  return `${i===0?"M":"L"}${_sf(x,1)},${_sf(y,1)}`;
}).join(" ");

return (
<div style={{display:"flex",flexDirection:"column",gap:16}}>
  {/* Section toggle */}
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
    <div style={{display:"flex",gap:4}}>
      {[{id:"historial",lbl:"📊 Historial"},{id:"proyeccion",lbl:"🔭 Proyección"}].map(t=>(
        <button key={t.id} onClick={()=>setSection(t.id)} style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${section===t.id?"var(--gold)":"var(--border)"}`,background:section===t.id?"var(--gold-dim)":"transparent",color:section===t.id?"var(--gold)":"var(--text-tertiary)",fontSize:11,fontWeight:section===t.id?700:500,cursor:"pointer",fontFamily:"var(--fb)"}}>{t.lbl}</button>
      ))}
    </div>
  </div>

  {section === "proyeccion" && <ProyeccionSection CTRL_DATA={CTRL_DATA} INCOME_DATA={INCOME_DATA} DIV_BY_YEAR={DIV_BY_YEAR} GASTOS_MONTH={GASTOS_MONTH} fxRates={fxRates} />}
  {section === "historial" && <>
  {/* Hero KPI — Patrimonio */}
  <div style={{background:"linear-gradient(135deg, rgba(201,169,80,.06), rgba(201,169,80,.02))",border:"1px solid rgba(201,169,80,.2)",borderRadius:20,padding:"28px 32px",display:"flex",flexDirection:"column",gap:16}}>
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
      <div>
        <div style={{fontSize:10,color:"var(--gold)",fontFamily:"var(--fm)",letterSpacing:1.5,fontWeight:700,marginBottom:8,opacity:.7}}>PATRIMONIO NETO</div>
        <div style={{fontSize:42,fontWeight:800,fontFamily:"var(--fm)",color:"var(--text-primary)",lineHeight:1,letterSpacing:-1}}>${(latest.pu||0).toLocaleString(undefined,{maximumFractionDigits:0})}</div>
        <div style={{fontSize:18,fontWeight:500,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginTop:4}}>€{(latest.pe||0).toLocaleString(undefined,{maximumFractionDigits:0})}</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
        <div style={{padding:"6px 14px",borderRadius:10,background:monthDeltaPct>=0?"rgba(48,209,88,.1)":"rgba(255,69,58,.1)",border:`1px solid ${monthDeltaPct>=0?"rgba(48,209,88,.2)":"rgba(255,69,58,.2)"}`}}>
          <span style={{fontSize:16,fontWeight:700,color:retCol(monthDeltaPct),fontFamily:"var(--fm)"}}>{monthDeltaPct>=0?"▲":"▼"} {retFmt(monthDeltaPct)}</span>
          <span style={{fontSize:11,color:retCol(monthDeltaPct),fontFamily:"var(--fm)",marginLeft:6,opacity:.7}}>({monthDeltaUsd>=0?"+":"−"}${fDol(Math.abs(monthDeltaUsd))})</span>
        </div>
        {spark.length > 2 && <div style={{opacity:.7}}>
          <svg width={sparkW+20} height={sparkH+8} viewBox={`-2 -2 ${sparkW+4} ${sparkH+4}`} style={{overflow:"visible"}}>
            <defs><linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--gold)" stopOpacity=".25"/><stop offset="100%" stopColor="var(--gold)" stopOpacity="0"/></linearGradient></defs>
            <path d={sparkPath + ` L${sparkW},${sparkH} L0,${sparkH} Z`} fill="url(#sparkGrad)"/>
            <path d={sparkPath} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx={sparkW} cy={sparkH - ((spark[spark.length-1].pu - sparkMin) / sparkRange) * sparkH} r="3" fill="var(--gold)"/>
          </svg>
          <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"center",marginTop:1}}>Últimos 12m</div>
        </div>}
      </div>
    </div>
    {latest.br > 0 && (() => {
      const total = (latest.pu || 1);
      const brokerPct = ((latest.br || 0) / total * 100);
      const bankPct = ((latest.bk || 0) * (latest.fx || 1.08) / total * 100);
      const otherPct = Math.max(0, 100 - brokerPct - bankPct);
      return <div style={{marginTop:4}}>
        <div style={{display:"flex",height:8,borderRadius:6,overflow:"hidden",background:"rgba(255,255,255,.03)"}}>
          <div style={{width:`${brokerPct}%`,background:"var(--gold)",transition:"width .5s"}}/>
          <div style={{width:`${bankPct}%`,background:"#64d2ff",transition:"width .5s"}}/>
          {otherPct > 1 && <div style={{width:`${otherPct}%`,background:"rgba(255,255,255,.1)"}}/>}
        </div>
        <div style={{display:"flex",gap:16,marginTop:6,fontSize:10,fontFamily:"var(--fm)"}}>
          <span style={{color:"var(--gold)"}}>● Brokers ${fDol(latest.br||0)} ({_sf(brokerPct,0)}%)</span>
          <span style={{color:"#64d2ff"}}>● Bancos €{fDol(latest.bk||0)} ({_sf(bankPct,0)}%)</span>
        </div>
      </div>;
    })()}
    <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",opacity:.6}}>Último snapshot: {latest.d || "—"} · FX: €1 = ${latest.fx?.toFixed(2) || "—"}</div>
  </div>
  {/* Secondary KPI row */}
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(150px, 1fr))",gap:10}}>
    {[
      {label:"RETORNO TOTAL",value:retFmt(totalReturnUsd),sub:`EUR ${retFmt(totalReturnEur)}`,color:retCol(totalReturnUsd)},
      {label:`CAGR (${_sf(totalYears,1)}a)`,value:retFmt(cagrUsd),sub:`EUR ${retFmt(cagrEur)}`,color:retCol(cagrUsd)},
      {label:"MAX DRAWDOWN",value:`${_sf(maxDD,1)}%`,sub:ddEnd?`Valle: ${ddEnd}`:"—",color:"var(--red)"},
      {label:"WIN RATE",value:`${_sf(winRate,0)}%`,sub:`${positiveMonths}/${monthlyReturns.length} meses +`,color:winRate>=50?"var(--green)":"var(--red)"},
      {label:"MEJOR MES",value:bestMonth?retFmt(bestMonth.mReturnUsd):"—",sub:bestMonth?.d||"—",color:"var(--green)"},
      {label:"PEOR MES",value:worstMonth?retFmt(worstMonth.mReturnUsd):"—",sub:worstMonth?.d||"—",color:"var(--red)"},
    ].map((k,i) => (
      <div key={i} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:"14px 16px"}}>
        <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.8,fontWeight:600,marginBottom:6}}>{k.label}</div>
        <div style={{fontSize:20,fontWeight:700,fontFamily:"var(--fm)",color:k.color,lineHeight:1.1}}>{k.value}</div>
        <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:3}}>{k.sub}</div>
      </div>
    ))}
  </div>

  {/* Patrimony Evolution Chart */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
      <div style={{fontSize:14,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)"}}>📈 Evolución Patrimonio (USD)</div>
      <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{data.length} meses · {first.d?.slice(0,4)}–{latest.d?.slice(0,4)}</div>
    </div>
    {(() => {
      const chartH = 220;
      const yMax = Math.ceil(maxPu / 200000) * 200000;
      const ySteps = [];
      for (let v = 0; v <= yMax; v += yMax <= 1000000 ? 200000 : 500000) ySteps.push(v);
      if (ySteps[ySteps.length-1] < maxPu) ySteps.push(ySteps[ySteps.length-1] + (yMax <= 1000000 ? 200000 : 500000));
      const yTop = ySteps[ySteps.length-1] || 1;
      const yearChanges = new Set();
      data.forEach((d,i) => { if(i > 0 && d.d?.slice(0,4) !== data[i-1].d?.slice(0,4)) yearChanges.add(i); });
      const labelBars = new Set([0, data.length-1]);
      data.forEach((d,i) => { if(yearChanges.has(i)) labelBars.add(i); });
      return (
        <div style={{display:"flex",gap:0}}>
          <div style={{display:"flex",flexDirection:"column",justifyContent:"space-between",height:chartH,paddingRight:8,flexShrink:0}}>
            {[...ySteps].reverse().map(v => (
              <div key={v} style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right",width:40,lineHeight:"1"}}>{v >= 1e6 ? `$${_sf(v/1e6,1)}M` : `$${_sf(v/1e3,0)}K`}</div>
            ))}
          </div>
          <div style={{flex:1,position:"relative"}}>
            <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",justifyContent:"space-between",pointerEvents:"none"}}>
              {ySteps.map(v => <div key={v} style={{borderBottom:"1px solid rgba(255,255,255,.04)",width:"100%"}}/>)}
            </div>
            <div style={{display:"flex",alignItems:"flex-end",gap:1,height:chartH,position:"relative"}}>
              {data.map((d, i) => {
                const h = yTop > 0 ? (d.pu / yTop * 100) : 0;
                const isLast = i === data.length - 1;
                const isYearStart = yearChanges.has(i);
                const showLabel = labelBars.has(i);
                const barColor = isLast ? "var(--gold)" : "rgba(201,169,80,0.5)";
                return (
                  <div key={d.d} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%",borderLeft:isYearStart?"1px solid rgba(255,255,255,.1)":"none",position:"relative"}} title={`${d.d}\n$${(d.pu||0).toLocaleString()}\n€${(d.pe||0).toLocaleString()}\n${d.mReturnUsd != null ? "Mes: "+retFmt(d.mReturnUsd) : ""}`}>
                    {showLabel && <div style={{fontSize:8,fontWeight:600,color:isLast?"var(--gold)":"var(--text-secondary)",fontFamily:"var(--fm)",marginBottom:2,whiteSpace:"nowrap"}}>{d.pu>=1e6?`$${_sf(d.pu/1e6,2)}M`:`$${_sf(d.pu/1e3,0)}K`}</div>}
                    <div style={{width:"100%",maxWidth:16,height:`${Math.max(h,2)}%`,background:barColor,borderRadius:"2px 2px 0 0",transition:"opacity .2s"}}/>
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:1,marginTop:4}}>
              {data.map((d,i) => {
                const isYearStart = yearChanges.has(i);
                const isFirst = i === 0;
                const isLast = i === data.length - 1;
                return (
                  <div key={d.d} style={{flex:1,textAlign:"center"}}>
                    {(isFirst || isYearStart || isLast) && <div style={{fontSize:8,color:isLast?"var(--gold)":"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:isLast?600:400,whiteSpace:"nowrap",overflow:"hidden"}}>{d.d?.slice(0,7)}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    })()}
  </div>

  {/* Monthly Returns heatmap */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
    <div style={{fontSize:14,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:4}}>📊 Rentabilidad Mensual (%)</div>
    <div style={{display:"flex",gap:8,marginBottom:12,fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>
      <span>Mejor: <span style={{color:"var(--green)",fontWeight:600}}>{retFmt(bestMonth?.mReturnUsd)} ({bestMonth?.d})</span></span>
      <span>·</span>
      <span>Peor: <span style={{color:"var(--red)",fontWeight:600}}>{retFmt(worstMonth?.mReturnUsd)} ({worstMonth?.d})</span></span>
      <span>·</span>
      <span>Media: <span style={{color:retCol(avgMonthReturn),fontWeight:600}}>{retFmt(avgMonthReturn)}</span></span>
    </div>
    <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
      {monthlyReturns.map(d => {
        const v = d.mReturnUsd;
        const intensity = Math.min(Math.abs(v) / 12, 1);
        const bg = v >= 0
          ? `rgba(48,209,88,${0.1 + intensity * 0.6})`
          : `rgba(255,69,58,${0.1 + intensity * 0.6})`;
        return (
          <div key={d.d} title={`${d.d}: ${retFmt(v)} · $${(d.pu||0).toLocaleString()}`} style={{width:28,height:28,borderRadius:4,background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:600,color:v>=0?"var(--green)":"var(--red)",fontFamily:"var(--fm)",cursor:"default"}}>
            {v>=0?"+":""}{_sf(v,0)}
          </div>
        );
      })}
    </div>
  </div>

  {/* Annual Returns */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
    <div style={{fontSize:14,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:16}}>📅 Rentabilidad Anual</div>
    <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
      {annualReturns.filter(a => a.ytdUsd != null).map(a => (
        <div key={a.y} style={{flex:"1 1 120px",padding:"12px 16px",background:"rgba(255,255,255,.02)",borderRadius:12,border:"1px solid var(--border)",textAlign:"center"}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginBottom:4}}>{a.y}</div>
          <div style={{fontSize:24,fontWeight:700,color:retCol(a.ytdUsd),fontFamily:"var(--fm)"}}>{retFmt(a.ytdUsd)}</div>
          <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>EUR {retFmt(a.ytdEur)}</div>
          <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:4}}>${fDol(a.start||0)} → ${fDol(a.end||0)}</div>
        </div>
      ))}
    </div>
  </div>

  {/* Full History Table */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,overflow:"hidden"}}>
    <div style={{padding:"14px 20px",borderBottom:"1px solid var(--border)"}}>
      <span style={{fontSize:14,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>📋 Detalle Mensual · {data.length} snapshots</span>
    </div>
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5,minWidth:800}}>
        <thead><tr>
          {["FECHA","PAT. USD","PAT. EUR","BROKERS","BANCOS","FX €/$","Δ USD","Δ EUR","SUELDO"].map((h,i)=>
            <th key={i} style={{padding:"7px 12px",textAlign:i>0?"right":"left",color:"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",letterSpacing:.4,borderBottom:"1px solid var(--border)",position:"sticky",top:0,background:"var(--bg)"}}>{h}</th>)}
        </tr></thead>
        <tbody>
          {[...data].reverse().map((d, i) => {
            const bg = i%2 ? "rgba(255,255,255,.01)" : "transparent";
            return (
              <tr key={d.d} style={{background:bg}} onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"} onMouseLeave={e=>e.currentTarget.style.background=bg}>
                <td style={{padding:"6px 12px",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)",fontWeight:500}}>{d.d}</td>
                <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)",fontWeight:600}}>${(d.pu||0).toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>€{(d.pe||0).toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--gold)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>${(d.br||0).toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",color:"#64d2ff",borderBottom:"1px solid rgba(255,255,255,.03)"}}>€{(d.bk||0).toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.fx?.toFixed(2)||"—"}</td>
                <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",fontWeight:600,color:retCol(d.mReturnUsd),borderBottom:"1px solid rgba(255,255,255,.03)"}}>{retFmt(d.mReturnUsd)}</td>
                <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",color:retCol(d.mReturnEur),borderBottom:"1px solid rgba(255,255,255,.03)"}}>{retFmt(d.mReturnEur)}</td>
                <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",color:d.sl?"var(--text-secondary)":"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.sl ? `$${fDol(d.sl)}` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
  </>}
</div>
);
}
