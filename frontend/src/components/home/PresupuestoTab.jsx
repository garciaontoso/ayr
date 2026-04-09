import { useState, useEffect, useCallback, useMemo } from 'react';
import { useHome } from '../../context/HomeContext';
import { API_URL, CURRENCIES } from '../../constants/index.js';
import { EmptyState, InlineLoading } from '../ui/EmptyState.jsx';
import { Modal, Toast } from '../ui';

// ─── Categories matching user's budget spreadsheet ───
const DEFAULT_CATEGORIAS = [
  { id: 'CASA', ico: '🏠', color: '#c8a44e' },
  { id: 'UTILITYS', ico: '💡', color: '#64d2ff' },
  { id: 'BARCO', ico: '⛵', color: '#4ecdc4' },
  { id: 'COCHES', ico: '🚗', color: '#ff6b6b' },
  { id: 'SUBSCRIPCIONES', ico: '📱', color: '#a29bfe' },
  { id: 'COMIDA_ROPA', ico: '🛒', color: '#ff9f43' },
  { id: 'SALUD', ico: '🏥', color: '#ee5a24' },
  { id: 'DEPORTE', ico: '🏋️', color: '#6c5ce7' },
  { id: 'OTROS', ico: '📦', color: '#636e72' },
];
const CAT_BY_ID = Object.fromEntries(DEFAULT_CATEGORIAS.map(c => [c.id, c]));
const loadCatOrder = () => DEFAULT_CATEGORIAS;

const CAT_LABELS = {
  CASA: 'Casa', UTILITYS: "Utility's", COCHES: 'Coches', BARCO: 'Barco',
  COMIDA_ROPA: 'Comida y Ropa', SALUD: 'Salud', DEPORTE: 'Deporte',
  SUBSCRIPCIONES: 'Subscripciones', OTROS: 'Otros',
};

const FRECUENCIAS = ['MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'BIANUAL', 'TRIANUAL', 'QUINQUENAL', 'PERSONALIZADO'];

// Normalize: strip stopwords and punctuation for fuzzy matching
const STOP = new Set(['de','del','la','el','los','las','s.l','sl','s.a','sa','to','y','e','en']);
const normalize = (s) => s.toLowerCase().trim().split(/[\s.,]+/).filter(w => w.length >= 2 && !STOP.has(w)).join(' ');

// Match a gasto detail against a presupuesto item — ONLY by explicit aliases
const matchesItem = (detailLower, item, gastoId) => {
  if (detailLower.length < 3) return false;
  // Check if this specific gasto is excluded
  if (gastoId) {
    let excluded = [];
    try { excluded = JSON.parse(item.excluded_gastos || '[]'); } catch(e) {}
    if (excluded.includes(gastoId)) return false;
  }
  let aliases = [];
  try { aliases = JSON.parse(item.aliases || '[]'); } catch(e) {}
  if (aliases.length === 0) return false;
  for (const alias of aliases) {
    const al = alias.toLowerCase().trim();
    if (al.length < 3) continue;
    if (detailLower.includes(al) || al.includes(detailLower)) return true;
    const nAlias = normalize(al), nDetail = normalize(detailLower);
    if (nAlias.length >= 5 && nDetail.length >= 5 && (nDetail.includes(nAlias) || nAlias.includes(nDetail))) return true;
  }
  return false;
};
const FREQ_DIVISOR = { MENSUAL: 1, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12, BIANUAL: 24, TRIANUAL: 36, QUINQUENAL: 60, PERSONALIZADO: 1 };
const getFreqDivisor = (item) => item.frecuencia === 'PERSONALIZADO' && item.custom_months ? item.custom_months : (FREQ_DIVISOR[item.frecuencia] || 1);

const catOf = id => CAT_BY_ID[id] || DEFAULT_CATEGORIAS[DEFAULT_CATEGORIAS.length - 1];

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
const warningCard = { ...card, background: 'rgba(200,164,78,0.06)', borderColor: 'rgba(200,164,78,0.3)' };
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
  const [calMonth, setCalMonth] = useState(null);
  const [expandedItem, setExpandedItem] = useState(null);
  const [CATEGORIAS, setCATEGORIAS] = useState(loadCatOrder);
  const [dragCat, setDragCat] = useState(null);
  const [toast, setToast] = useState(null);

  // Load cat order from API
  useEffect(() => {
    fetch(`${API_URL}/api/presupuesto/cat-order`).then(r=>r.json()).then(d => {
      if (d?.order && Array.isArray(d.order)) {
        const ordered = d.order.map(id => CAT_BY_ID[id]).filter(Boolean);
        // Add any missing categories at the end
        const missing = DEFAULT_CATEGORIAS.filter(c => !d.order.includes(c.id));
        setCATEGORIAS([...ordered, ...missing]);
      }
    }).catch(() => setCATEGORIAS(DEFAULT_CATEGORIAS));
  }, []);

  const saveCatOrder = (cats) => {
    setCATEGORIAS(cats);
    fetch(`${API_URL}/api/presupuesto/cat-order`, {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ order: cats.map(c => c.id) }),
    })
      .then(r => { if (!r.ok) throw new Error(r.status); setToast({ type: 'success', message: '✓ Orden guardado' }); })
      .catch(e => setToast({ type: 'error', message: 'Error: ' + (e?.message || e) }));
  }; // id of expanded row
  const [dismissedMissing, setDismissedMissing] = useState(() => { try { return JSON.parse(localStorage.getItem('presu_dismissed_missing') || '[]'); } catch { return []; } });
  const [dismissedIncreases, setDismissedIncreases] = useState(() => { try { return JSON.parse(localStorage.getItem('presu_dismissed_increases') || '[]'); } catch { return []; } });

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
    const payload = { ...form, importe, custom_months: form.custom_months ? parseInt(form.custom_months) : null, last_payment: form.last_payment || null };

    try {
      if (editId) {
        const r1 = await fetch(`${API_URL}/api/presupuesto/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!r1.ok) throw new Error(r1.status);
      } else {
        const r2 = await fetch(`${API_URL}/api/presupuesto`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!r2.ok) throw new Error(r2.status);
      }
      setShowForm(false); setEditId(null);
      setForm({ nombre: '', categoria: 'CASA', banco: '', frecuencia: 'MENSUAL', importe: '', notas: '', last_payment: '', custom_months: '' });
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
    setForm({ nombre: item.nombre, categoria: item.categoria, banco: item.banco || '', frecuencia: item.frecuencia, importe: String(item.importe), notas: item.notas || '', last_payment: item.last_payment || '', custom_months: item.custom_months ? String(item.custom_months) : '' });
    setShowForm(true);
  };

  // ─── Expense increase detection ───
  const expenseIncreases = useMemo(() => {
    if (!gastosLog || gastosLog.length === 0 || items.length === 0) return [];
    const increases = [];
    for (const item of items) {
      if ((item.nombre || '').trim().length < 3) continue;
      const matching = gastosLog.filter(g => matchesItem((g.detail || '').toLowerCase().trim(), item, g.id));
      if (matching.length === 0) continue;
      // Convert all matching amounts to EUR
      const toEur = (g) => {
        let amt = Math.abs(g.amount);
        const c = (g.currency || 'EUR').toUpperCase();
        if (c !== 'EUR' && fxRates) {
          const rf = fxRates[c]; const re = fxRates['EUR'];
          if (rf && re) amt = amt / rf * re;
          else if (c === 'CNY') amt = amt * 0.127;
          else if (c === 'USD') amt = amt * 0.926;
        }
        return amt;
      };
      // Compare annualized real spending vs annualized budget
      const twelveMAgo = new Date(); twelveMAgo.setMonth(twelveMAgo.getMonth() - 12);
      const recent = matching.filter(g => g.date && new Date(g.date) >= twelveMAgo);
      const latest = [...matching].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
      // Sum all spending in last 12 months = annualized real spend
      const realAnnual = recent.reduce((s, g) => s + toEur(g), 0);
      // If less than 12 months of data, extrapolate
      const months = new Set(recent.map(g => (g.date||'').slice(0,7)));
      const nMonths = Math.max(months.size, 1);
      const realAnnualEstimate = nMonths >= 12 ? realAnnual : (realAnnual / nMonths) * 12;
      // Budget annualized
      const freqDiv = getFreqDivisor(item);
      const budgetAnnual = (item.importe / freqDiv) * 12;
      if (budgetAnnual <= 0) continue;
      const pctChange = ((realAnnualEstimate - budgetAnnual) / budgetAnnual) * 100;
      const realMonthly = realAnnualEstimate / 12;
      if (pctChange > 5) {
        increases.push({
          itemId: item.id,
          nombre: item.nombre,
          categoria: item.categoria,
          budgetAmount: Math.round(budgetAnnual / 12), // monthly budget
          actualAmount: Math.round(realMonthly), // monthly real
          pctChange,
          date: latest.date,
          frecuencia: item.frecuencia,
          sampleSize: recent.length,
        });
      }
    }
    return increases;
  }, [gastosLog, items]);

  // ─── Match gastos to budget items (for detail expansion) ───
  const matchedGastos = useMemo(() => {
    if (!gastosLog || gastosLog.length === 0) return {};
    const result = {};
    for (const item of items) {
      if ((item.nombre || '').trim().length < 3) continue;
      const matches = gastosLog.filter(g => matchesItem((g.detail || '').toLowerCase().trim(), item, g.id))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      if (matches.length > 0) result[item.id] = matches;
    }
    return result;
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
    if (sortBy === 'categoria') {
      const catOrder = Object.fromEntries(CATEGORIAS.map((c, i) => [c.id, i]));
      list = [...list].sort((a, b) => (catOrder[a.categoria] ?? 99) - (catOrder[b.categoria] ?? 99) || a.nombre.localeCompare(b.nombre));
    }
    else if (sortBy === 'importe') list = [...list].sort((a, b) => (b.importe / getFreqDivisor(b)) - (a.importe / getFreqDivisor(a)));
    else if (sortBy === 'nombre') list = [...list].sort((a, b) => a.nombre.localeCompare(b.nombre));
    return list;
  }, [items, catFilter, sortBy]);

  const totals = useMemo(() => {
    const byCat = {};
    let totalMensual = 0;
    for (const it of items) {
      const mensual = it.importe / getFreqDivisor(it);
      totalMensual += mensual;
      byCat[it.categoria] = (byCat[it.categoria] || 0) + mensual;
    }
    return { byCat, totalMensual, totalAnual: totalMensual * 12 };
  }, [items]);

  // ─── Calendar: auto-detect billing months + compute per-month totals ───
  const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const DEFAULT_MONTHS = { ANUAL: [1], SEMESTRAL: [1,7], TRIMESTRAL: [1,4,7,10] };

  const calendarData = useMemo(() => {
    // Step 1: auto-detect billing months for non-monthly items
    const itemMonths = {}; // itemId → [month numbers]
    for (const item of items) {
      if (item.frecuencia === 'MENSUAL') {
        itemMonths[item.id] = [1,2,3,4,5,6,7,8,9,10,11,12];
        continue;
      }
      // Manual override
      if (item.billing_months) {
        try { itemMonths[item.id] = JSON.parse(item.billing_months); continue; } catch(e) {}
      }
      // Auto-detect from gastosLog
      if ((item.nombre || '').trim().length < 3) { itemMonths[item.id] = DEFAULT_MONTHS[item.frecuencia] || [1]; continue; }
      const matching = (gastosLog || []).filter(g => matchesItem((g.detail || '').toLowerCase().trim(), item, g.id));
      if (matching.length === 0) { itemMonths[item.id] = DEFAULT_MONTHS[item.frecuencia] || [1]; continue; }
      // Count months
      const monthCounts = {};
      matching.forEach(g => { const m = parseInt((g.date||'').slice(5,7)); if(m) monthCounts[m] = (monthCounts[m]||0) + 1; });
      const nPick = item.frecuencia === 'ANUAL' ? 1 : item.frecuencia === 'SEMESTRAL' ? 2 : 4;
      const sorted = Object.entries(monthCounts).sort((a,b) => b[1]-a[1]).slice(0, nPick).map(([m]) => parseInt(m)).sort((a,b)=>a-b);
      itemMonths[item.id] = sorted.length > 0 ? sorted : (DEFAULT_MONTHS[item.frecuencia] || [1]);
    }

    // Step 2: compute per-month totals
    const months = Array.from({length:12}, (_,i) => ({ month: i+1, total: 0, items: [], byCat: {} }));
    for (const item of items) {
      const ms = itemMonths[item.id] || [1];
      const cat = catOf(item.categoria);
      for (const m of ms) {
        const amount = item.frecuencia === 'MENSUAL' ? item.importe : item.importe;
        months[m-1].total += amount;
        months[m-1].items.push({ ...item, isMonthly: item.frecuencia === 'MENSUAL' });
        months[m-1].byCat[item.categoria] = (months[m-1].byCat[item.categoria] || 0) + amount;
      }
    }
    return { months, itemMonths };
  }, [items, gastosLog]);

  const updateBillingMonths = async (itemId, months) => {
    const val = months ? JSON.stringify(months) : null;
    try {
      await fetch(`${API_URL}/api/presupuesto/${itemId}/billing-months`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billing_months: val }),
      });
      setItems(prev => prev.map(it => it.id === itemId ? { ...it, billing_months: val } : it));
    } catch(e) { console.error('Failed to update billing months:', e); }
  };

  const convertFromEur = (eur) => {
    if (displayCcy === 'EUR') return eur;
    if (displayCcy === 'USD') return eur * fxEurUsd;
    const eurToUsd = fxEurUsd;
    const usdToTarget = fxRates?.[displayCcy] || 1;
    return eur * eurToUsd * usdToTarget;
  };

  const sym = CURRENCIES[displayCcy]?.symbol || displayCcy;
  // Kept local: depend on closure state (privacyMode, convertFromEur, sym) — cannot live in utils/formatters.js.
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
          <button onClick={() => { setEditId(null); setForm({ nombre: '', categoria: 'CASA', banco: '', frecuencia: 'MENSUAL', importe: '', notas: '', last_payment: '', custom_months: '' }); setShowForm(!showForm); }} style={btn(!showForm)}>
            {showForm ? '✕ Cerrar' : '+ Añadir'}
          </button>
        </div>
      </div>

      {/* ═══ 12-Month Calendar Strip ═══ */}
      {items.length > 0 && (() => {
        const currentMonth = new Date().getMonth() + 1;
        const maxMonth = Math.max(...calendarData.months.map(m => m.total), 1);
        return (
          <div style={card}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', marginBottom: 10, fontFamily: 'var(--fb)', letterSpacing: 0.5 }}>
              📅 CALENDARIO DE GASTOS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4 }}>
              {calendarData.months.map((md, i) => {
                const m = i + 1;
                const isCurrent = m === currentMonth;
                const isSelected = m === calMonth;
                const catEntries = Object.entries(md.byCat).sort((a,b) => b[1]-a[1]);
                const barH = maxMonth > 0 ? Math.max(md.total / maxMonth * 60, 4) : 4;
                return (
                  <div key={m} onClick={() => setCalMonth(isSelected ? null : m)}
                    style={{ padding: '6px 2px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                      border: isCurrent ? '1.5px solid var(--gold)' : isSelected ? '1.5px solid var(--text-tertiary)' : '1px solid transparent',
                      background: isSelected ? 'rgba(200,164,78,.08)' : isCurrent ? 'rgba(200,164,78,.04)' : 'transparent',
                      transition: 'all .15s' }}>
                    <div style={{ fontSize: 8, fontWeight: 600, color: isCurrent ? 'var(--gold)' : 'var(--text-tertiary)', fontFamily: 'var(--fm)', letterSpacing: 0.3 }}>
                      {MONTH_NAMES[i]}
                    </div>
                    {/* Stacked category bar */}
                    <div style={{ height: 60, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', margin: '4px 0' }}>
                      <div style={{ width: '60%', height: barH, borderRadius: 3, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        {catEntries.map(([cat, val]) => (
                          <div key={cat} style={{ height: `${val/md.total*100}%`, minHeight: 2, background: catOf(cat).color, opacity: 0.8 }} />
                        ))}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: isCurrent ? 'var(--gold)' : 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>
                      {fmt(md.total)}
                    </div>
                    <div style={{ fontSize: 7, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
                      {md.items.filter(it => !it.isMonthly).length} extra
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Expanded month detail */}
            {calMonth && (() => {
              const md = calendarData.months[calMonth - 1];
              const periodic = md.items.filter(it => !it.isMonthly).sort((a,b) => b.importe - a.importe);
              const monthly = md.items.filter(it => it.isMonthly).sort((a,b) => (b.importe - a.importe));
              const monthlyTotal = monthly.reduce((s, it) => s + it.importe, 0);
              const periodicTotal = periodic.reduce((s, it) => s + it.importe, 0);
              return (
                <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(200,164,78,.04)', borderRadius: 10, border: '1px solid rgba(200,164,78,.12)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fb)' }}>
                      {MONTH_NAMES[calMonth-1]} — {fmt(md.total)}
                    </div>
                    <button onClick={() => setCalMonth(null)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                  </div>

                  {/* Periodic (non-monthly) items */}
                  {periodic.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--gold)', marginBottom: 4, fontFamily: 'var(--fm)' }}>
                        GASTOS PERIÓDICOS ({fmt(periodicTotal)})
                      </div>
                      {periodic.map(it => {
                        const cat = catOf(it.categoria);
                        const autoMonths = calendarData.itemMonths[it.id] || [];
                        const isManual = !!it.billing_months;
                        return (
                          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--subtle-border)' }}>
                            <span style={{ fontSize: 12 }}>{cat.ico}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--fm)', flex: 1 }}>{it.nombre}</span>
                            <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, background: `${cat.color}20`, color: cat.color, fontFamily: 'var(--fm)', fontWeight: 600 }}>
                              {it.frecuencia}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--fm)' }}>{fmt(it.importe)}</span>
                            {/* Month selector: small 12-button grid */}
                            <div style={{ display: 'flex', gap: 2 }}>
                              {[1,2,3,4,5,6,7,8,9,10,11,12].map(mo => {
                                const active = autoMonths.includes(mo);
                                return (
                                  <button key={mo} onClick={(e) => {
                                    e.stopPropagation();
                                    const current = [...autoMonths];
                                    const next = active ? current.filter(x => x !== mo) : [...current, mo].sort((a,b)=>a-b);
                                    if (next.length > 0) updateBillingMonths(it.id, next);
                                  }} style={{
                                    width: 16, height: 16, fontSize: 6, fontWeight: active ? 700 : 400, borderRadius: 3, border: 'none',
                                    background: active ? cat.color : 'var(--subtle-border)', color: active ? '#fff' : 'var(--text-tertiary)',
                                    cursor: 'pointer', fontFamily: 'var(--fm)', padding: 0, lineHeight: '16px', textAlign: 'center',
                                  }}>{MONTH_NAMES[mo-1]}</button>
                                );
                              })}
                              {isManual && (
                                <button onClick={(e) => { e.stopPropagation(); updateBillingMonths(it.id, null); }}
                                  style={{ fontSize: 7, padding: '1px 4px', borderRadius: 3, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontFamily: 'var(--fm)' }}>
                                  Auto
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Monthly items (dimmed) */}
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 4, fontFamily: 'var(--fm)' }}>
                      MENSUALES ({fmt(monthlyTotal)})
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {monthly.slice(0, 20).map(it => (
                        <span key={it.id} style={{ fontSize: 8, padding: '2px 6px', borderRadius: 4, background: 'var(--subtle-bg)', color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
                          {catOf(it.categoria).ico} {it.nombre} {fmt(it.importe)}
                        </span>
                      ))}
                      {monthly.length > 20 && <span style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>+{monthly.length - 20} más</span>}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* ═══ Alerts ═══ */}
      {alerts.length > 0 && (
        <div style={{ ...card, background: 'rgba(200,164,78,0.06)', borderColor: 'rgba(200,164,78,0.3)' }}>
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
      {(() => {
        const visibleIncreases = expenseIncreases.filter(inc => !dismissedIncreases.includes(inc.itemId));
        return visibleIncreases.length > 0 && (
        <div style={warningCard}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#c8a44e', marginBottom: 8 }}>
            ⚠️ Subidas detectadas
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 8 }}>
            La media anual de estos gastos supera el presupuesto en mas del 5%
          </div>
          {visibleIncreases.map((inc, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <button onClick={() => { const next = [...dismissedIncreases, inc.itemId]; setDismissedIncreases(next); localStorage.setItem('presu_dismissed_increases', JSON.stringify(next)); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 11, padding: 0, opacity: 0.5 }} title="Descartar">✕</button>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', minWidth: 100 }}>{inc.nombre}</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                presupuesto <span style={{ fontFamily: 'var(--fm)' }}>{fmtEur(inc.budgetAmount)}/mes</span>
              </span>
              <span style={{ color: 'var(--text-tertiary)' }}>→</span>
              <span style={{ fontSize: 11, color: '#ff6b6b', fontWeight: 600, fontFamily: 'var(--fm)' }}>
                real {fmtEur(inc.actualAmount)}/mes
              </span>
              <span style={{ fontSize: 10, color: '#ff6b6b', fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,107,107,0.1)' }}>
                +{inc.pctChange.toFixed(0)}%
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{inc.date}</span>
              <button
                onClick={() => { const item = items.find(i=>i.id===inc.itemId); const freq = item ? getFreqDivisor(item) : 1; updateBudgetAmount(inc.itemId, Math.round(inc.actualAmount * freq)); }}
                style={{ ...btn(false), padding: '3px 8px', fontSize: 9, color: '#c8a44e', borderColor: 'rgba(200,164,78,0.4)', marginLeft: 'auto' }}>
                Actualizar presupuesto
              </button>
            </div>
          ))}
        </div>
      );})()}

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
      {(() => {
        const visibleMissing = missingExpenses.filter(exp => !dismissedMissing.includes(exp.detail.toLowerCase()));
        return visibleMissing.length > 0 && (
        <div style={infoCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64d2ff' }}>
              📋 Gastos faltantes
            </div>
            {dismissedMissing.length > 0 && (
              <button onClick={() => { setDismissedMissing([]); localStorage.removeItem('presu_dismissed_missing'); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 9, fontFamily: 'var(--fm)' }}>
                Mostrar descartados ({dismissedMissing.length})
              </button>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 8 }}>
            Estos gastos recurrentes no estan en tu presupuesto
          </div>
          {visibleMissing.slice(0, 15).map((exp, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
              <button onClick={() => { const next = [...dismissedMissing, exp.detail.toLowerCase()]; setDismissedMissing(next); localStorage.setItem('presu_dismissed_missing', JSON.stringify(next)); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 11, padding: 0, opacity: 0.5 }} title="Descartar">✕</button>
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
      );})()}

      {/* ═══ Summary Cards ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6, marginBottom: 8 }}>
        {/* Total card */}
        <div style={{ ...card, padding: 12, textAlign: 'center', borderColor: 'rgba(200,164,78,0.3)' }}>
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
        <div style={{ ...card, borderColor: 'var(--gold)', background: 'rgba(200,164,78,0.04)' }}>
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
            {form.frecuencia === 'PERSONALIZADO' && (
              <div>
                <label style={{ fontSize: 9, color: 'var(--gold)', display: 'block', marginBottom: 2, fontWeight: 600 }}>Cada X meses *</label>
                <input style={inp} type="number" value={form.custom_months} onChange={e => setForm({ ...form, custom_months: e.target.value })} placeholder="Ej: 60 = cada 5 años" />
              </div>
            )}
            <div>
              <label style={{ fontSize: 9, color: 'var(--text-tertiary)', display: 'block', marginBottom: 2 }}>Último pago</label>
              <input style={inp} type="date" value={form.last_payment || ''} onChange={e => setForm({ ...form, last_payment: e.target.value })} />
            </div>
          </div>
          {form.importe && !isNaN(parseFloat(form.importe)) && (
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-tertiary)' }}>
              Equivale a: <strong style={{ color: 'var(--gold)' }}>{fmtEur(parseFloat(form.importe) / getFreqDivisor(form))}/mes</strong>
              {' · '}<strong>{fmtEur(parseFloat(form.importe) / getFreqDivisor(form) * 12)}/año</strong>
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
          <div key={c.id} draggable="true"
            onClick={() => setCatFilter(c.id)}
            onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id); setDragCat(c.id); }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.style.borderLeft = '3px solid var(--gold)'; }}
            onDragLeave={(e) => { e.currentTarget.style.borderLeft = ''; }}
            onDrop={(e) => {
              e.preventDefault(); e.currentTarget.style.borderLeft = '';
              const fromId = e.dataTransfer.getData('text/plain') || dragCat;
              if (!fromId || fromId === c.id) return;
              const cats = [...CATEGORIAS];
              const fromIdx = cats.findIndex(x => x.id === fromId);
              const toIdx = cats.findIndex(x => x.id === c.id);
              const [moved] = cats.splice(fromIdx, 1);
              cats.splice(toIdx, 0, moved);
              saveCatOrder(cats);
              setDragCat(null);
            }}
            onDragEnd={() => setDragCat(null)}
            style={{...btn(catFilter === c.id), cursor: 'grab', opacity: dragCat === c.id ? 0.4 : 1, display: 'inline-block', userSelect: 'none'}}>
            {c.ico} {CAT_LABELS[c.id]} ({items.filter(i => i.categoria === c.id).length})
          </div>
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
                  const mensual = item.importe / getFreqDivisor(item);
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
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', background: alert ? 'rgba(200,164,78,0.04)' : 'transparent' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--row-alt)'}
                          onMouseLeave={e => e.currentTarget.style.background = alert ? 'rgba(200,164,78,0.04)' : 'transparent'}>
                        <td style={{ ...td, textAlign: 'center' }}>{cat.ico}</td>
                        <td style={{ ...td, fontWeight: 600, color: 'var(--text)' }}>
                          {item.nombre}
                          {alert && <span style={{ marginLeft: 4, fontSize: 9, color: alert.cambio_pct > 0 ? '#ff6b6b' : '#51cf66' }}>
                            {alert.cambio_pct > 0 ? '▲' : '▼'}{Math.abs(alert.cambio_pct).toFixed(0)}%
                          </span>}
                        </td>
                        <td style={{ ...td, color: 'var(--text-tertiary)', textAlign: 'center' }}>{item.banco || '—'}</td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: item.frecuencia === 'MENSUAL' ? 'rgba(100,210,255,0.1)' : item.frecuencia === 'ANUAL' ? 'rgba(200,164,78,0.1)' : 'var(--subtle-bg2)', color: item.frecuencia === 'MENSUAL' ? '#64d2ff' : item.frecuencia === 'ANUAL' ? 'var(--gold)' : 'var(--text-tertiary)' }}>
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
                          <button onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)} style={{ border: 'none', background: 'none', color: expandedItem === item.id ? 'var(--gold)' : 'var(--text-tertiary)', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }} title="Ver gastos asociados">📊</button>
                          <button onClick={() => deleteItem(item.id)} style={{ border: 'none', background: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }} title="Eliminar">🗑</button>
                        </td>
                      </tr>
                      {expandedItem === item.id && (() => {
                        const gastos = matchedGastos[item.id] || [];
                        const last = gastos[0];
                        const freqMonths = getFreqDivisor(item);
                        let nextDate = null;
                        // Prefer manual last_payment, then auto from gastos
                        const lastPayDate = item.last_payment || last?.date;
                        if (lastPayDate && item.frecuencia !== 'MENSUAL') {
                          const d = new Date(lastPayDate);
                          d.setMonth(d.getMonth() + freqMonths);
                          nextDate = d;
                        }
                        const toEurG = (g) => {
                          let amt = Math.abs(g.amount);
                          const c = (g.currency || 'EUR').toUpperCase();
                          if (c !== 'EUR' && fxRates) {
                            const rf = fxRates[c]; const re = fxRates['EUR'];
                            if (rf && re) amt = amt / rf * re;
                            else if (c === 'CNY') amt = amt * 0.127;
                            else if (c === 'USD') amt = amt * 0.926;
                          }
                          return amt;
                        };
                        const avg = gastos.length > 0 ? gastos.slice(0, 12).reduce((s, g) => s + toEurG(g), 0) / Math.min(gastos.length, 12) : 0;
                        const colCount = displayCcy !== 'EUR' ? 10 : 9;
                        return (
                          <tr key={`exp-${item.id}`}>
                            <td colSpan={colCount} style={{ padding: '8px 16px', background: 'rgba(200,164,78,.04)', borderBottom: '1px solid var(--border)' }}>
                              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                {/* Stats */}
                                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                  {last && (
                                    <div>
                                      <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', fontWeight: 600 }}>ÚLTIMO PAGO</div>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--fm)' }}>
                                        {fmtEur(toEurG(last))}
                                      </div>
                                      <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{last.date}</div>
                                    </div>
                                  )}
                                  {nextDate && (
                                    <div>
                                      <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', fontWeight: 600 }}>PRÓXIMO PAGO</div>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: nextDate <= new Date() ? '#ff6b6b' : 'var(--gold)', fontFamily: 'var(--fm)' }}>
                                        {nextDate.toISOString().slice(0, 10)}
                                      </div>
                                      <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{nextDate <= new Date() ? '⚠️ Pendiente' : `en ${Math.ceil((nextDate - new Date()) / 86400000)} días`}</div>
                                    </div>
                                  )}
                                  {avg > 0 && (
                                    <div>
                                      <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', fontWeight: 600 }}>MEDIA (12m)</div>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>
                                        {fmtEur(avg)}
                                      </div>
                                      <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{Math.min(gastos.length, 12)} pagos</div>
                                    </div>
                                  )}
                                </div>
                                {/* Recent payments timeline */}
                                <div style={{ flex: 1, minWidth: 200 }}>
                                  <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', fontWeight: 600, marginBottom: 4 }}>HISTORIAL DE PAGOS</div>
                                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {gastos.slice(0, 20).map((g, gi) => (
                                      <div key={gi} style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--subtle-bg)', fontSize: 8, fontFamily: 'var(--fm)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                        <span style={{ color: 'var(--text-tertiary)' }}>{(g.date||'').slice(0,10)}</span>
                                        <span style={{ fontWeight: 600, color: toEurG(g) > item.importe * 1.1 ? '#ff6b6b' : 'var(--text-secondary)' }}>
                                          {fmtEur(toEurG(g))}
                                        </span>
                                        <span style={{ color: 'var(--text-tertiary)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 7 }} title={g.detail}>{g.detail}</span>
                                        <button onClick={async () => {
                                          await fetch(`${API_URL}/api/presupuesto/${item.id}/exclude-gasto`, {
                                            method: 'POST', headers: {'Content-Type':'application/json'},
                                            body: JSON.stringify({ gasto_id: g.id }),
                                          });
                                          let excl = []; try { excl = JSON.parse(item.excluded_gastos || '[]'); } catch(e) {}
                                          excl.push(g.id);
                                          setItems(prev => prev.map(it => it.id === item.id ? { ...it, excluded_gastos: JSON.stringify(excl) } : it));
                                        }} title="Excluir este gasto" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 7, padding: 0, opacity: 0.4, lineHeight: 1 }}>✕</button>
                                      </div>
                                    ))}
                                    {gastos.length === 0 && <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>Sin gastos asociados — añade un alias para vincular</span>}
                                  </div>
                                </div>
                              </div>
                              {/* Aliases management */}
                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--subtle-border)' }}>
                                <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', fontWeight: 600, marginBottom: 4 }}>
                                  ALIASES (nombres de proveedores asociados)
                                </div>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                                  {(() => {
                                    let aliases = [];
                                    try { aliases = JSON.parse(item.aliases || '[]'); } catch(e) {}
                                    return aliases.map((al, ai) => (
                                      <span key={ai} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 4, background: 'rgba(200,164,78,.1)', fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--gold)' }}>
                                        {al}
                                        <button onClick={async () => {
                                          const next = aliases.filter((_, i) => i !== ai);
                                          await fetch(`${API_URL}/api/presupuesto/${item.id}`, {
                                            method: 'PUT', headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ ...item, aliases: next.length > 0 ? JSON.stringify(next) : null }),
                                          });
                                          setItems(prev => prev.map(it => it.id === item.id ? { ...it, aliases: next.length > 0 ? JSON.stringify(next) : null } : it));
                                        }} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 8, padding: 0, lineHeight: 1 }}>✕</button>
                                      </span>
                                    ));
                                  })()}
                                  <button onClick={() => {
                                    const alias = prompt('Nombre del proveedor (ej: "Linea Directa", "Mapfre"):');
                                    if (!alias || alias.trim().length < 3) return;
                                    fetch(`${API_URL}/api/presupuesto/${item.id}/alias`, {
                                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ alias: alias.trim() }),
                                    }).then(r => r.json()).then(data => {
                                      if (data.aliases) setItems(prev => prev.map(it => it.id === item.id ? { ...it, aliases: JSON.stringify(data.aliases) } : it));
                                    });
                                  }} style={{ padding: '2px 8px', borderRadius: 4, border: '1px dashed var(--gold)', background: 'transparent', color: 'var(--gold)', cursor: 'pointer', fontSize: 8, fontFamily: 'var(--fm)' }}>
                                    + Añadir alias
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })()}
                    </>
                  );
                });
              })()}
            </tbody>
            <tfoot>
              {(() => {
                const filtMensual = filtered.reduce((s, it) => s + it.importe / getFreqDivisor(it), 0);
                const filtAnual = filtMensual * 12;
                return (
                  <tr style={{ background: 'rgba(200,164,78,0.06)', fontWeight: 700 }}>
                    <td colSpan={5} style={{ ...td, textAlign: 'right', color: 'var(--gold)' }}>TOTAL</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', color: 'var(--gold)' }}>{fmtEur(filtMensual)}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', color: 'var(--gold)' }}>{fmtEur(filtAnual)}</td>
                    {displayCcy !== 'EUR' && <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', color: 'var(--gold)' }}>{fmt(filtMensual)}</td>}
                    <td colSpan={2}></td>
                  </tr>
                );
              })()}
            </tfoot>
          </table>
        </div>
      )}

      {/* ═══ History Modal ═══ */}
      <Modal open={showHistory} onClose={() => setShowHistory(false)} title="📊 Historial de cambios" width={460}>
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
      </Modal>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

// Table styles
const th = { padding: '8px 10px', fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const td = { padding: '7px 10px', fontSize: 11, color: 'var(--text-secondary)' };
