import { useState, useEffect, useCallback, useMemo } from 'react';
import { useHome } from '../../context/HomeContext';
import { API_URL, CURRENCIES } from '../../constants/index.js';
import { EmptyState, InlineLoading } from '../ui/EmptyState.jsx';

// ─── Categories matching user's budget spreadsheet ───
const CATEGORIAS = [
  { id: 'CASA', ico: '🏠', color: '#d69e2e' },
  { id: 'UTILITYS', ico: '💡', color: '#64d2ff' },
  { id: 'COCHES', ico: '🚗', color: '#ff6b6b' },
  { id: 'BARCO', ico: '⛵', color: '#4ecdc4' },
  { id: 'COMIDA_ROPA', ico: '🛒', color: '#ff9f43' },
  { id: 'SALUD', ico: '🏥', color: '#ee5a24' },
  { id: 'DEPORTE', ico: '🏋️', color: '#6c5ce7' },
  { id: 'SUBSCRIPCIONES', ico: '📱', color: '#a29bfe' },
  { id: 'OTROS', ico: '📦', color: '#636e72' },
];

const CAT_LABELS = {
  CASA: 'Casa', UTILITYS: "Utility's", COCHES: 'Coches', BARCO: 'Barco',
  COMIDA_ROPA: 'Comida y Ropa', SALUD: 'Salud', DEPORTE: 'Deporte',
  SUBSCRIPCIONES: 'Subscripciones', OTROS: 'Otros',
};

const FRECUENCIAS = ['MENSUAL', 'ANUAL', 'TRIMESTRAL', 'SEMESTRAL'];
const FREQ_DIVISOR = { MENSUAL: 1, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 };

const catOf = id => CATEGORIAS.find(c => c.id === id) || CATEGORIAS[CATEGORIAS.length - 1];

// ─── Styles ───
const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 8 };
const btn = (active) => ({
  padding: '6px 14px', borderRadius: 8, border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
  background: active ? 'var(--gold-dim)' : 'transparent', color: active ? 'var(--gold)' : 'var(--text-tertiary)',
  fontSize: 11, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: 'var(--fb)', transition: 'all .15s',
});
const inp = {
  padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text)', fontSize: 12, fontFamily: 'var(--fm)', width: '100%', boxSizing: 'border-box',
};
const sel = { ...inp, appearance: 'auto' };

// ─── Mapping presupuesto categories → gastos catCodes ───
const PRESU_TO_GASTO_CATS = {
  CASA: ['HOM', 'ALQ', 'HIP'],
  UTILITYS: ['UTI', 'UCH'],
  COCHES: ['TRA', 'COC'],
  BARCO: ['BAR'],
  COMIDA_ROPA: ['SUP', 'COM', 'ROP'],
  SALUD: ['HEA', 'MED', 'MAS'],
  DEPORTE: ['DEP'],
  SUBSCRIPCIONES: ['SUB'],
  OTROS: ['OTH', 'CAP', 'REG', 'VIA', 'ENT', 'EDU', 'SBL', 'AVI'],
};
const GASTO_CAT_TO_PRESU = {};
for (const [presu, codes] of Object.entries(PRESU_TO_GASTO_CATS)) {
  for (const code of codes) GASTO_CAT_TO_PRESU[code] = presu;
}

// ─── Warning/info section styles ───
const warningCard = { ...card, background: 'rgba(214,158,46,0.06)', borderColor: 'rgba(214,158,46,0.3)' };
const dangerCard = { ...card, background: 'rgba(255,107,107,0.06)', borderColor: 'rgba(255,107,107,0.3)' };
const infoCard = { ...card, background: 'rgba(100,210,255,0.06)', borderColor: 'rgba(100,210,255,0.3)' };

export default function PresupuestoTab() {
  const { displayCcy, fxRates, privacyMode, hide, hideN, gastosLog } = useHome();

  // ─── State ───
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ nombre: '', categoria: 'CASA', banco: '', frecuencia: 'MENSUAL', importe: '', notas: '' });
  const [catFilter, setCatFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('categoria');
  const [alerts, setAlerts] = useState([]);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // ─── Fetch ───
  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/presupuesto`);
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) { console.error('Fetch presupuesto error:', e); }
    setLoading(false);
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/presupuesto/alerts`);
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      setAlerts(Array.isArray(data) ? data : []);
    } catch (e) { /* silent */ }
  }, []);

  const fetchHistory = useCallback(async (itemId) => {
    try {
      const res = await fetch(`${API_URL}/api/presupuesto/history/${itemId}`);
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch (e) { setHistory([]); }
  }, []);

  useEffect(() => { fetchItems(); fetchAlerts(); }, [fetchItems, fetchAlerts]);

  // ─── CRUD ───
  const saveItem = async () => {
    const importe = parseFloat(form.importe);
    if (!form.nombre || isNaN(importe) || importe <= 0) return;
    const payload = { ...form, importe };

    try {
      if (editId) {
        const r1 = await fetch(`${API_URL}/api/presupuesto/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!r1.ok) throw new Error(r1.status);
      } else {
        const r2 = await fetch(`${API_URL}/api/presupuesto`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!r2.ok) throw new Error(r2.status);
      }
      setShowForm(false); setEditId(null);
      setForm({ nombre: '', categoria: 'CASA', banco: '', frecuencia: 'MENSUAL', importe: '', notas: '' });
      fetchItems(); fetchAlerts();
    } catch (e) { console.error('Save error:', e); }
  };

  const deleteItem = async (id) => {
    if (!confirm('¿Eliminar este gasto del presupuesto?')) return;
    try {
      const res = await fetch(`${API_URL}/api/presupuesto/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(res.status);
      fetchItems(); fetchAlerts();
    } catch (e) { console.error('Delete error:', e); }
  };

  const startEdit = (item) => {
    setEditId(item.id);
    setForm({ nombre: item.nombre, categoria: item.categoria, banco: item.banco || '', frecuencia: item.frecuencia, importe: String(item.importe), notas: item.notas || '' });
    setShowForm(true);
  };

  // ─── Expense increase detection ───
  const expenseIncreases = useMemo(() => {
    if (!gastosLog || gastosLog.length === 0 || items.length === 0) return [];
    const increases = [];
    for (const item of items) {
      const nameLower = (item.nombre || '').toLowerCase().trim();
      // Find gastos that match this budget item by name (detail field)
      const matching = gastosLog.filter(g => {
        const detailLower = (g.detail || '').toLowerCase().trim();
        // Match by name substring (e.g. "Netflix" matches detail containing "netflix")
        return detailLower.includes(nameLower) || nameLower.includes(detailLower);
      });
      if (matching.length === 0) continue;
      // Sort by date descending to find latest
      const sorted = [...matching].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const latest = sorted[0];
      const latestAmount = Math.abs(latest.amount);
      // Convert budget to per-charge amount based on frequency
      const budgetPerCharge = item.importe; // importe is already per-frequency
      if (budgetPerCharge <= 0) continue;
      const pctChange = ((latestAmount - budgetPerCharge) / budgetPerCharge) * 100;
      if (pctChange > 5) {
        increases.push({
          itemId: item.id,
          nombre: item.nombre,
          categoria: item.categoria,
          budgetAmount: budgetPerCharge,
          actualAmount: latestAmount,
          pctChange,
          date: latest.date,
          frecuencia: item.frecuencia,
        });
      }
    }
    return increases;
  }, [gastosLog, items]);

  // ─── YoY comparison by category ───
  const yoyComparison = useMemo(() => {
    if (!gastosLog || gastosLog.length === 0) return [];
    const now = new Date();
    const thisYear = now.getFullYear();
    const lastYear = thisYear - 1;
    // Group spending by presupuesto category and year
    const byYearCat = {};
    for (const g of gastosLog) {
      if (!g.date) continue;
      const year = parseInt(g.date.substring(0, 4), 10);
      if (year !== thisYear && year !== lastYear) continue;
      const presuCat = GASTO_CAT_TO_PRESU[g.catCode] || 'OTROS';
      const key = `${year}_${presuCat}`;
      byYearCat[key] = (byYearCat[key] || 0) + Math.abs(g.amount);
    }
    const results = [];
    // Calculate months elapsed this year for pro-rating
    const monthsThisYear = now.getMonth() + 1;
    for (const cat of CATEGORIAS) {
      const thisYearTotal = byYearCat[`${thisYear}_${cat.id}`] || 0;
      const lastYearTotal = byYearCat[`${lastYear}_${cat.id}`] || 0;
      if (lastYearTotal === 0 && thisYearTotal === 0) continue;
      // Annualize this year's spending
      const thisYearAnnualized = monthsThisYear > 0 ? (thisYearTotal / monthsThisYear) * 12 : 0;
      const pctChange = lastYearTotal > 0
        ? ((thisYearAnnualized - lastYearTotal) / lastYearTotal) * 100
        : (thisYearTotal > 0 ? 100 : 0);
      results.push({
        categoria: cat.id,
        thisYear: thisYearTotal,
        lastYear: lastYearTotal,
        thisYearAnnualized,
        pctChange,
      });
    }
    return results.filter(r => r.lastYear > 0 || r.thisYear > 0);
  }, [gastosLog]);

  // ─── Missing recurring expenses ───
  const missingExpenses = useMemo(() => {
    if (!gastosLog || gastosLog.length === 0 || items.length === 0) return [];
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    // Find expenses that repeat (same detail appears 2+ times in last 6 months)
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const recentGastos = gastosLog.filter(g => g.date && new Date(g.date) >= sixMonthsAgo);
    // Group by detail text (normalized)
    const byDetail = {};
    for (const g of recentGastos) {
      const detail = (g.detail || '').trim();
      if (!detail || detail.length < 3) continue;
      if (!byDetail[detail]) byDetail[detail] = [];
      byDetail[detail].push(g);
    }
    // Find recurring ones (2+ occurrences)
    const recurring = [];
    for (const [detail, entries] of Object.entries(byDetail)) {
      if (entries.length < 2) continue;
      // Check it's not already in presupuesto
      const detailLower = detail.toLowerCase();
      const inBudget = items.some(item => {
        const nameLower = (item.nombre || '').toLowerCase();
        return detailLower.includes(nameLower) || nameLower.includes(detailLower);
      });
      if (inBudget) continue;
      // Calculate average monthly amount
      const amounts = entries.map(e => Math.abs(e.amount));
      const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      const catCode = entries[0].catCode;
      recurring.push({
        detail,
        avgAmount: Math.round(avgAmount * 100) / 100,
        occurrences: entries.length,
        catCode,
        presuCat: GASTO_CAT_TO_PRESU[catCode] || 'OTROS',
        currency: entries[0].currency || 'EUR',
      });
    }
    // Sort by avg amount descending
    return recurring.sort((a, b) => b.avgAmount - a.avgAmount);
  }, [gastosLog, items]);

  // ─── Update budget item to new amount ───
  const updateBudgetAmount = useCallback(async (itemId, newAmount) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    try {
      const res = await fetch(`${API_URL}/api/presupuesto/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item, importe: newAmount }),
      });
      if (!res.ok) throw new Error(res.status);
      fetchItems();
      fetchAlerts();
    } catch (e) { console.error('Update budget error:', e); }
  }, [items, fetchItems, fetchAlerts]);

  // ─── Add missing expense to budget ───
  const addMissingToBudget = useCallback(async (expense) => {
    try {
      const res = await fetch(`${API_URL}/api/presupuesto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: expense.detail,
          categoria: expense.presuCat,
          banco: '',
          frecuencia: 'MENSUAL',
          importe: expense.avgAmount,
          notas: `Auto-detectado (${expense.occurrences} cargos recientes)`,
        }),
      });
      if (!res.ok) throw new Error(res.status);
      fetchItems();
    } catch (e) { console.error('Add missing budget item error:', e); }
  }, [fetchItems]);

  // ─── Computed ───
  const fxEurUsd = fxRates?.EUR ? 1 / fxRates.EUR : 1.177;

  const filtered = useMemo(() => {
    let list = catFilter === 'ALL' ? items : items.filter(i => i.categoria === catFilter);
    if (sortBy === 'categoria') list = [...list].sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre));
    else if (sortBy === 'importe') list = [...list].sort((a, b) => (b.importe / FREQ_DIVISOR[b.frecuencia]) - (a.importe / FREQ_DIVISOR[a.frecuencia]));
    else if (sortBy === 'nombre') list = [...list].sort((a, b) => a.nombre.localeCompare(b.nombre));
    return list;
  }, [items, catFilter, sortBy]);

  const totals = useMemo(() => {
    const byCat = {};
    let totalMensual = 0;
    for (const it of items) {
      const mensual = it.importe / FREQ_DIVISOR[it.frecuencia];
      totalMensual += mensual;
      byCat[it.categoria] = (byCat[it.categoria] || 0) + mensual;
    }
    return { byCat, totalMensual, totalAnual: totalMensual * 12 };
  }, [items]);

  const convertFromEur = (eur) => {
    if (displayCcy === 'EUR') return eur;
    if (displayCcy === 'USD') return eur * fxEurUsd;
    const eurToUsd = fxEurUsd;
    const usdToTarget = fxRates?.[displayCcy] || 1;
    return eur * eurToUsd * usdToTarget;
  };

  const sym = CURRENCIES[displayCcy]?.symbol || displayCcy;
  const fmt = (v) => privacyMode ? '•••' : `${sym}${convertFromEur(v).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const fmtEur = (v) => privacyMode ? '•••' : `€${v.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  // ─── Render ───
  return (
    <div>
      {/* ═══ Header ═══ */}
      <div style={{ ...card, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--fb)' }}>
            💰 Presupuesto Mensual
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {items.length} partidas · Actualizado en tiempo real desde D1
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => { setEditId(null); setForm({ nombre: '', categoria: 'CASA', banco: '', frecuencia: 'MENSUAL', importe: '', notas: '' }); setShowForm(!showForm); }} style={btn(!showForm)}>
            {showForm ? '✕ Cerrar' : '+ Añadir'}
          </button>
        </div>
      </div>

      {/* ═══ Alerts ═══ */}
      {alerts.length > 0 && (
        <div style={{ ...card, background: 'rgba(214,158,46,0.06)', borderColor: 'rgba(214,158,46,0.3)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 6 }}>⚠️ Cambios detectados</div>
          {alerts.map((a, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3, display: 'flex', gap: 6, alignItems: 'center' }}>
              <span>{catOf(a.categoria).ico}</span>
              <span style={{ fontWeight: 600 }}>{a.nombre}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>
                {fmtEur(a.importe_anterior)} → {fmtEur(a.importe_nuevo)}
              </span>
              <span style={{ color: a.cambio_pct > 0 ? '#ff6b6b' : '#51cf66', fontWeight: 700, fontSize: 10 }}>
                {a.cambio_pct > 0 ? '▲' : '▼'} {Math.abs(a.cambio_pct).toFixed(1)}%
              </span>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 9 }}>{a.fecha}</span>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Subidas detectadas ═══ */}
      {expenseIncreases.length > 0 && (
        <div style={warningCard}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#d69e2e', marginBottom: 8 }}>
            ⚠️ Subidas detectadas
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 8 }}>
            Estos gastos recientes superan el presupuesto en mas del 5%
          </div>
          {expenseIncreases.map((inc, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', minWidth: 100 }}>{inc.nombre}</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                presupuesto <span style={{ fontFamily: 'var(--fm)' }}>{fmtEur(inc.budgetAmount)}</span>
              </span>
              <span style={{ color: 'var(--text-tertiary)' }}>→</span>
              <span style={{ fontSize: 11, color: '#ff6b6b', fontWeight: 600, fontFamily: 'var(--fm)' }}>
                real {fmtEur(inc.actualAmount)}
              </span>
              <span style={{ fontSize: 10, color: '#ff6b6b', fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,107,107,0.1)' }}>
                +{inc.pctChange.toFixed(0)}%
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{inc.date}</span>
              <button
                onClick={() => updateBudgetAmount(inc.itemId, inc.actualAmount)}
                style={{ ...btn(false), padding: '3px 8px', fontSize: 9, color: '#d69e2e', borderColor: 'rgba(214,158,46,0.4)', marginLeft: 'auto' }}>
                Actualizar presupuesto
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ═══ YoY Comparison ═══ */}
      {yoyComparison.length > 0 && (
        <div style={{ ...card, marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            📊 Comparativa interanual
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 6 }}>
            {yoyComparison.map((yoy, i) => {
              const cat = catOf(yoy.categoria);
              const isUp = yoy.pctChange > 0;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: isUp ? 'rgba(255,107,107,0.04)' : 'rgba(81,207,102,0.04)', border: `1px solid ${isUp ? 'rgba(255,107,107,0.15)' : 'rgba(81,207,102,0.15)'}` }}>
                  <span style={{ fontSize: 13 }}>{cat.ico}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text)' }}>{CAT_LABELS[yoy.categoria]}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
                      {fmtEur(yoy.thisYear)} este año · {fmtEur(yoy.lastYear)} en {new Date().getFullYear() - 1}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: isUp ? '#ff6b6b' : '#51cf66', fontFamily: 'var(--fm)' }}>
                    {isUp ? '+' : ''}{yoy.pctChange.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ Gastos faltantes ═══ */}
      {missingExpenses.length > 0 && (
        <div style={infoCard}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64d2ff', marginBottom: 6 }}>
            📋 Gastos faltantes
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 8 }}>
            Estos gastos recurrentes no estan en tu presupuesto
          </div>
          {missingExpenses.slice(0, 15).map((exp, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', minWidth: 140 }}>{exp.detail}</span>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
                ~{exp.currency === 'EUR' ? '€' : '$'}{exp.avgAmount.toFixed(2)}/mes
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)', padding: '1px 5px', borderRadius: 3, background: 'rgba(100,210,255,0.1)' }}>
                {exp.occurrences}x en 6m
              </span>
              <button
                onClick={() => addMissingToBudget(exp)}
                style={{ ...btn(false), padding: '3px 8px', fontSize: 9, color: '#64d2ff', borderColor: 'rgba(100,210,255,0.4)', marginLeft: 'auto' }}>
                + Anadir al presupuesto
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Summary Cards ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6, marginBottom: 8 }}>
        {/* Total card */}
        <div style={{ ...card, padding: 12, textAlign: 'center', borderColor: 'rgba(214,158,46,0.3)' }}>
          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1 }}>Total Mensual</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--fm)' }}>{fmt(totals.totalMensual)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{fmt(totals.totalAnual)}/año</div>
        </div>
        {/* Category cards */}
        {CATEGORIAS.filter(c => totals.byCat[c.id]).map(cat => (
          <div key={cat.id} style={{ ...card, padding: 12, cursor: 'pointer', borderColor: catFilter === cat.id ? cat.color : 'var(--border)', transition: 'all .15s' }}
               onClick={() => setCatFilter(catFilter === cat.id ? 'ALL' : cat.id)}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>{cat.ico}</span> {CAT_LABELS[cat.id]}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: cat.color, fontFamily: 'var(--fm)', marginTop: 2 }}>{fmt(totals.byCat[cat.id])}</div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{((totals.byCat[cat.id] / (totals.totalMensual || 1)) * 100).toFixed(1)}%</div>
            {/* Mini bar */}
            <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(totals.byCat[cat.id] / (totals.totalMensual || 1)) * 100}%`, background: cat.color, borderRadius: 2 }} />
            </div>
          </div>
        ))}
      </div>

      {/* ═══ Donut Chart ═══ */}
      <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'center' }}>
        <svg viewBox="0 0 120 120" width={120} height={120}>
          {(() => {
            let offset = 0;
            const total = totals.totalMensual || 1;
            return CATEGORIAS.filter(c => totals.byCat[c.id]).map(cat => {
              const pct = (totals.byCat[cat.id] || 0) / total;
              const dash = pct * 314.16; // 2 * pi * 50
              const el = (
                <circle key={cat.id} cx="60" cy="60" r="50" fill="none" stroke={cat.color} strokeWidth="16"
                  strokeDasharray={`${dash} ${314.16 - dash}`} strokeDashoffset={-offset * 314.16}
                  transform="rotate(-90 60 60)" opacity={catFilter !== 'ALL' && catFilter !== cat.id ? 0.2 : 0.85}
                  style={{ cursor: 'pointer', transition: 'opacity .2s' }}
                  onClick={() => setCatFilter(catFilter === cat.id ? 'ALL' : cat.id)} />
              );
              offset += pct;
              return el;
            });
          })()}
          <text x="60" y="57" textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--gold)" fontFamily="var(--fm)">{fmtEur(totals.totalMensual)}</text>
          <text x="60" y="70" textAnchor="middle" fontSize="7" fill="var(--text-tertiary)">/mes</text>
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {CATEGORIAS.filter(c => totals.byCat[c.id]).map(cat => (
            <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, cursor: 'pointer', opacity: catFilter !== 'ALL' && catFilter !== cat.id ? 0.4 : 1 }}
                 onClick={() => setCatFilter(catFilter === cat.id ? 'ALL' : cat.id)}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: cat.color, flexShrink: 0 }} />
              <span style={{ color: 'var(--text-secondary)', minWidth: 90 }}>{CAT_LABELS[cat.id]}</span>
              <span style={{ color: cat.color, fontWeight: 600, fontFamily: 'var(--fm)' }}>{fmt(totals.byCat[cat.id])}</span>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 9 }}>{((totals.byCat[cat.id] / (totals.totalMensual || 1)) * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ Form ═══ */}
      {showForm && (
        <div style={{ ...card, borderColor: 'var(--gold)', background: 'rgba(214,158,46,0.04)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 10 }}>
            {editId ? '✏️ Editar partida' : '➕ Nueva partida'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            <div>
              <label style={{ fontSize: 9, color: 'var(--text-tertiary)', display: 'block', marginBottom: 2 }}>Nombre *</label>
              <input style={inp} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Netflix" />
            </div>
            <div>
              <label style={{ fontSize: 9, color: 'var(--text-tertiary)', display: 'block', marginBottom: 2 }}>Categoría</label>
              <select style={sel} value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
                {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.ico} {CAT_LABELS[c.id]}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 9, color: 'var(--text-tertiary)', display: 'block', marginBottom: 2 }}>Banco/Medio</label>
              <input style={inp} value={form.banco} onChange={e => setForm({ ...form, banco: e.target.value })} placeholder="Ej: Revolut, Santander" />
            </div>
            <div>
              <label style={{ fontSize: 9, color: 'var(--text-tertiary)', display: 'block', marginBottom: 2 }}>Frecuencia</label>
              <select style={sel} value={form.frecuencia} onChange={e => setForm({ ...form, frecuencia: e.target.value })}>
                {FRECUENCIAS.map(f => <option key={f} value={f}>{f.charAt(0) + f.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 9, color: 'var(--text-tertiary)', display: 'block', marginBottom: 2 }}>Importe (€) *</label>
              <input style={inp} type="number" step="0.01" value={form.importe} onChange={e => setForm({ ...form, importe: e.target.value })} placeholder="0.00" />
            </div>
            <div>
              <label style={{ fontSize: 9, color: 'var(--text-tertiary)', display: 'block', marginBottom: 2 }}>Notas</label>
              <input style={inp} value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} placeholder="Opcional" />
            </div>
          </div>
          {form.importe && !isNaN(parseFloat(form.importe)) && (
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-tertiary)' }}>
              Equivale a: <strong style={{ color: 'var(--gold)' }}>{fmtEur(parseFloat(form.importe) / FREQ_DIVISOR[form.frecuencia])}/mes</strong>
              {' · '}<strong>{fmtEur(parseFloat(form.importe) / FREQ_DIVISOR[form.frecuencia] * 12)}/año</strong>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={saveItem} style={{ ...btn(true), padding: '8px 20px' }}>
              {editId ? '💾 Guardar cambios' : '✅ Añadir'}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null); }} style={btn(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ═══ Filters & Sort ═══ */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 6 }}>
        <button onClick={() => setCatFilter('ALL')} style={btn(catFilter === 'ALL')}>Todas ({items.length})</button>
        {CATEGORIAS.filter(c => items.some(i => i.categoria === c.id)).map(c => (
          <button key={c.id} onClick={() => setCatFilter(c.id)} style={btn(catFilter === c.id)}>
            {c.ico} {CAT_LABELS[c.id]} ({items.filter(i => i.categoria === c.id).length})
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>Ordenar:</span>
          {['categoria', 'importe', 'nombre'].map(s => (
            <button key={s} onClick={() => setSortBy(s)} style={{ ...btn(sortBy === s), padding: '4px 8px', fontSize: 9 }}>
              {s === 'categoria' ? 'Cat' : s === 'importe' ? '€' : 'A-Z'}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ Items Table ═══ */}
      {loading ? (
        <InlineLoading message="Cargando presupuesto..." />
      ) : filtered.length === 0 ? (
        <EmptyState icon="📋" title={catFilter !== 'ALL' ? `Sin partidas en ${CAT_LABELS[catFilter]}` : "Sin partidas de presupuesto"} subtitle="Crea tu primera partida para empezar a controlar tu presupuesto mensual." action="+ Anadir partida" onAction={() => setShowForm(true)} />
      ) : (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--row-alt)' }}>
                <th style={th}>Cat</th>
                <th style={{ ...th, textAlign: 'left' }}>Nombre</th>
                <th style={th}>Banco</th>
                <th style={th}>Frecuencia</th>
                <th style={{ ...th, textAlign: 'right' }}>Importe</th>
                <th style={{ ...th, textAlign: 'right' }}>€/mes</th>
                <th style={{ ...th, textAlign: 'right' }}>€/año</th>
                {displayCcy !== 'EUR' && <th style={{ ...th, textAlign: 'right' }}>{sym}/mes</th>}
                <th style={th}>Notas</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let lastCat = '';
                return filtered.map(item => {
                  const mensual = item.importe / FREQ_DIVISOR[item.frecuencia];
                  const anual = mensual * 12;
                  const cat = catOf(item.categoria);
                  const showCatHeader = catFilter === 'ALL' && sortBy === 'categoria' && item.categoria !== lastCat;
                  lastCat = item.categoria;
                  const alert = alerts.find(a => a.item_id === item.id);
                  return (
                    <>
                      {showCatHeader && (
                        <tr key={`hdr-${item.categoria}`}>
                          <td colSpan={displayCcy !== 'EUR' ? 10 : 9} style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: cat.color, background: 'var(--row-alt)', borderBottom: '1px solid var(--border)' }}>
                            {cat.ico} {CAT_LABELS[item.categoria]}
                            <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 8, fontSize: 10 }}>
                              {fmtEur(totals.byCat[item.categoria] || 0)}/mes
                            </span>
                          </td>
                        </tr>
                      )}
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', background: alert ? 'rgba(214,158,46,0.04)' : 'transparent' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--row-alt)'}
                          onMouseLeave={e => e.currentTarget.style.background = alert ? 'rgba(214,158,46,0.04)' : 'transparent'}>
                        <td style={{ ...td, textAlign: 'center' }}>{cat.ico}</td>
                        <td style={{ ...td, fontWeight: 600, color: 'var(--text)' }}>
                          {item.nombre}
                          {alert && <span style={{ marginLeft: 4, fontSize: 9, color: alert.cambio_pct > 0 ? '#ff6b6b' : '#51cf66' }}>
                            {alert.cambio_pct > 0 ? '▲' : '▼'}{Math.abs(alert.cambio_pct).toFixed(0)}%
                          </span>}
                        </td>
                        <td style={{ ...td, color: 'var(--text-tertiary)', textAlign: 'center' }}>{item.banco || '—'}</td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: item.frecuencia === 'MENSUAL' ? 'rgba(100,210,255,0.1)' : item.frecuencia === 'ANUAL' ? 'rgba(214,158,46,0.1)' : 'var(--subtle-bg2)', color: item.frecuencia === 'MENSUAL' ? '#64d2ff' : item.frecuencia === 'ANUAL' ? 'var(--gold)' : 'var(--text-tertiary)' }}>
                            {item.frecuencia}
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 600, color: 'var(--text)' }}>{privacyMode ? '•••' : `€${item.importe.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}</td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', color: cat.color }}>{fmtEur(mensual)}</td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', color: 'var(--text-tertiary)' }}>{fmtEur(anual)}</td>
                        {displayCcy !== 'EUR' && <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', color: 'var(--text-secondary)' }}>{fmt(mensual)}</td>}
                        <td style={{ ...td, color: 'var(--text-tertiary)', fontSize: 10, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.notas || ''}</td>
                        <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button onClick={() => startEdit(item)} style={{ border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }} title="Editar">✏️</button>
                          <button onClick={() => { setShowHistory(item.id); fetchHistory(item.id); }} style={{ border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }} title="Historial">📊</button>
                          <button onClick={() => deleteItem(item.id)} style={{ border: 'none', background: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }} title="Eliminar">🗑</button>
                        </td>
                      </tr>
                    </>
                  );
                });
              })()}
            </tbody>
            <tfoot>
              <tr style={{ background: 'rgba(214,158,46,0.06)', fontWeight: 700 }}>
                <td colSpan={5} style={{ ...td, textAlign: 'right', color: 'var(--gold)' }}>TOTAL</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', color: 'var(--gold)' }}>{fmtEur(totals.totalMensual)}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', color: 'var(--gold)' }}>{fmtEur(totals.totalAnual)}</td>
                {displayCcy !== 'EUR' && <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', color: 'var(--gold)' }}>{fmt(totals.totalMensual)}</td>}
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ═══ History Modal ═══ */}
      {showHistory && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
             onClick={() => setShowHistory(false)}>
          <div style={{ ...card, width: 420, maxHeight: '60vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>📊 Historial de cambios</span>
              <button onClick={() => setShowHistory(false)} style={{ border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
            {history.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', padding: 20 }}>Sin cambios registrados</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead>
                  <tr><th style={th}>Fecha</th><th style={{ ...th, textAlign: 'right' }}>Anterior</th><th style={{ ...th, textAlign: 'right' }}>Nuevo</th><th style={th}>Cambio</th></tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={td}>{h.fecha}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)' }}>{fmtEur(h.importe_anterior)}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)' }}>{fmtEur(h.importe_nuevo)}</td>
                      <td style={{ ...td, textAlign: 'center', color: h.cambio_pct > 0 ? '#ff6b6b' : '#51cf66', fontWeight: 700 }}>
                        {h.cambio_pct > 0 ? '+' : ''}{h.cambio_pct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Table styles
const th = { padding: '8px 10px', fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const td = { padding: '7px 10px', fontSize: 11, color: 'var(--text-secondary)' };
