import { useState, useCallback, useEffect, useMemo } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf } from '../../utils/formatters.js';
import { EmptyState } from '../ui/EmptyState.jsx';
import { useDraggableOrder } from '../../hooks/useDraggableOrder.js';
import BuyWizard from '../ui/BuyWizard.jsx';
import FiveFiltersBars from '../ui/FiveFiltersBars.jsx';
import { API_URL } from '../../constants/index.js';
import {
  PASTORES_DIVIDENDO,
  PASTORES_TAB_ID,
  PASTORES_TAB_NAME,
  priceZone,
  zoneColors,
} from '../../data/pastoresDividendo.js';

const WL_KEY = "ayr_wl_tabs";

// Map for quick lookup of ranges when the Pastores tab is active.
const PASTORES_BY_TICKER = Object.fromEntries(
  PASTORES_DIVIDENDO.map(r => [r.ticker, r])
);

// Sort pill definitions (id stable for persistence)
const WATCHLIST_SORT_OPTIONS = [
  { id: "ticker", lbl: "Ticker" },
  { id: "name",   lbl: "Nombre" },
  { id: "price",  lbl: "Precio" },
  { id: "change", lbl: "Cambio" },
];

export default function WatchlistTab() {
  const {
    watchlistList,
    searchTicker, setSearchTicker, updatePosition,
    openAnalysis, CompanyRow, FLAGS, getCountry,
    displayCcy, privacyMode, hide, openScoresModal,
  } = useHome();

  // Persistent tabs in localStorage. Seeds the curated "Pastores del Dividendo"
  // tab on first mount with all tickers from the data file. The tab can still
  // be deleted/renamed by the user — we only add it once.
  const [tabs, setTabs] = useState(() => {
    let initial;
    try {
      initial = JSON.parse(localStorage.getItem(WL_KEY)) || [{ id: "all", name: "Todas", tickers: null }];
    } catch {
      initial = [{ id: "all", name: "Todas", tickers: null }];
    }
    const hasPastores = initial.some(t => t.id === PASTORES_TAB_ID);
    const seenSeed = (() => { try { return localStorage.getItem('ayr_wl_pastores_seeded') === '1'; } catch { return false; } })();
    if (!hasPastores && !seenSeed) {
      initial = [...initial, {
        id: PASTORES_TAB_ID,
        name: PASTORES_TAB_NAME,
        tickers: PASTORES_DIVIDENDO.map(r => r.ticker),
      }];
      try {
        localStorage.setItem(WL_KEY, JSON.stringify(initial));
        localStorage.setItem('ayr_wl_pastores_seeded', '1');
      } catch {}
    }
    return initial;
  });
  const [activeTab, setActiveTab] = useState("all");
  const [quickFilter, setQuickFilter] = useState("");
  const [showAddTab, setShowAddTab] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [editingTab, setEditingTab] = useState(null);
  const [sortBy, setSortBy] = useState("name");

  // Drag-reorder the sort pills — persisted per user via cloud
  const {
    orderedItems: orderedSortOptions,
    dragHandlers: sortDragHandlers,
    getDragVisuals: sortDragVisuals,
  } = useDraggableOrder(WATCHLIST_SORT_OPTIONS, 'ui_watchlist_sort_options');

  // Drag-reorder watchlist custom tabs
  const {
    orderedItems: orderedTabs,
    dragHandlers: tabDragHandlers,
    getDragVisuals: tabDragVisuals,
  } = useDraggableOrder(tabs, 'ui_watchlist_tabs_order');

  const saveTabs = useCallback((t) => { setTabs(t); localStorage.setItem(WL_KEY, JSON.stringify(t)); }, []);

  // ─── Enrichment: Quality/Safety, 5 Filters, Oracle verdicts ─────────────
  // All three are READ-ONLY fetches (no Opus). Oracle batch only returns
  // whatever is already cached in D1 — user generates new verdicts by
  // clicking the 🎯 cell (opens BuyWizard → $0.75 per request).
  const [qsScores, setQsScores] = useState({});
  const [fiveFilters, setFiveFilters] = useState({});
  const [oracleVerdicts, setOracleVerdicts] = useState({});
  const [oracleWizardTicker, setOracleWizardTicker] = useState(null);

  // Pastores del Dividendo — precios live independientes (no dependen del
  // watchlistList del usuario, ya que esos 19 tickers EU no están en su
  // watchlist como posiciones). Tira de /api/prices?live=1 directamente.
  const [pastoresPrices, setPastoresPrices] = useState({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tickers = PASTORES_DIVIDENDO.map(r => r.ticker).join(',');
        const r = await fetch(`${API_URL}/api/prices?tickers=${encodeURIComponent(tickers)}&live=1`);
        const d = await r.json();
        if (cancelled) return;
        const map = {};
        const arr = d.prices || d.results || [];
        for (const row of arr) {
          const t = row.ticker || row.symbol;
          if (t) map[t] = row.price ?? row.lastPrice ?? row.close ?? null;
        }
        // Soporte para shape {SYM: price, …}
        if (Object.keys(map).length === 0 && d && typeof d === 'object') {
          for (const [k, v] of Object.entries(d)) {
            if (typeof v === 'number') map[k] = v;
            else if (v && typeof v === 'object') map[k] = v.price ?? v.lastPrice ?? v.close ?? null;
          }
        }
        setPastoresPrices(map);
      } catch (e) {
        console.warn('pastores prices fetch failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/scores`);
        const d = await r.json();
        const map = {};
        for (const row of (d.scores || [])) map[row.ticker] = row;
        setQsScores(map);
      } catch {}
    })();
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/five-filters`);
        const d = await r.json();
        if (d.ok && d.scores) setFiveFilters(d.scores);
      } catch {}
    })();
  }, []);

  const watchlistTickers = useMemo(
    () => (watchlistList || []).map(p => p.ticker).filter(Boolean),
    [watchlistList]
  );
  const loadOracleBatch = useCallback(async (tickers) => {
    if (!tickers?.length) return;
    try {
      const qs = tickers.join(',');
      const r = await fetch(`${API_URL}/api/oracle-verdict/batch?tickers=${encodeURIComponent(qs)}`);
      const d = await r.json();
      if (d?.verdicts) setOracleVerdicts(d.verdicts);
    } catch {}
  }, []);
  useEffect(() => { loadOracleBatch(watchlistTickers); }, [watchlistTickers, loadOracleBatch]);

  const addTab = () => {
    if (!newTabName.trim()) return;
    const id = "wl_" + Date.now();
    saveTabs([...tabs, { id, name: newTabName.trim(), tickers: [] }]);
    setActiveTab(id);
    setNewTabName("");
    setShowAddTab(false);
  };

  const renameTab = (id, name) => {
    saveTabs(tabs.map(t => t.id === id ? { ...t, name } : t));
    setEditingTab(null);
  };

  const deleteTab = (id) => {
    if (id === "all") return;
    saveTabs(tabs.filter(t => t.id !== id));
    if (activeTab === id) setActiveTab("all");
  };

  const addToTab = (tabId, ticker) => {
    saveTabs(tabs.map(t => {
      if (t.id !== tabId || !t.tickers) return t;
      if (t.tickers.includes(ticker)) return t;
      return { ...t, tickers: [...t.tickers, ticker] };
    }));
  };

  const removeFromTab = (tabId, ticker) => {
    saveTabs(tabs.map(t => {
      if (t.id !== tabId || !t.tickers) return t;
      return { ...t, tickers: t.tickers.filter(x => x !== ticker) };
    }));
  };

  const currentTab = tabs.find(t => t.id === activeTab) || tabs[0];
  const allItems = watchlistList;

  // Filter by tab + search
  const filtered = allItems.filter(p => {
    if (currentTab.tickers && !currentTab.tickers.includes(p.ticker)) return false;
    if (quickFilter) {
      const q = quickFilter.toLowerCase();
      return p.ticker.toLowerCase().includes(q) || (p.name || "").toLowerCase().includes(q);
    }
    return true;
  });

  // Sort
  const sortFns = {
    ticker: (a, b) => (a.ticker || "").localeCompare(b.ticker || ""),
    name: (a, b) => (a.name || a.ticker).localeCompare(b.name || b.ticker),
    price: (a, b) => (b.lastPrice || 0) - (a.lastPrice || 0),
    change: (a, b) => (b.dayChange || 0) - (a.dayChange || 0),
    value: (a, b) => (b.usdValue || 0) - (a.usdValue || 0),
  };
  const sorted = [...filtered].sort(sortFns[sortBy] || sortFns.name);

  // Custom tabs that aren't "all" for the dropdown
  const customTabs = tabs.filter(t => t.id !== "all" && t.tickers);

  const pill = (active) => ({
    padding: "5px 12px", borderRadius: 8,
    border: `1px solid ${active ? "var(--gold)" : "var(--border)"}`,
    background: active ? "var(--gold-dim)" : "transparent",
    color: active ? "var(--gold)" : "var(--text-tertiary)",
    fontSize: 11, fontWeight: active ? 700 : 500,
    cursor: "pointer", fontFamily: "var(--fm)", transition: "all .15s",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        {orderedTabs.map(t => {
          const { extraStyle } = tabDragVisuals(t.id);
          return (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {editingTab === t.id ? (
              <input autoFocus value={t.name} onChange={e => saveTabs(tabs.map(x => x.id === t.id ? { ...x, name: e.target.value } : x))}
                onBlur={() => setEditingTab(null)} onKeyDown={e => e.key === "Enter" && setEditingTab(null)}
                style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid var(--gold)", background: "var(--gold-dim)", color: "var(--gold)", fontSize: 11, fontWeight: 700, fontFamily: "var(--fm)", outline: "none", width: 100 }} />
            ) : (
              <button
                {...tabDragHandlers(t.id)}
                onClick={() => setActiveTab(t.id)}
                onDoubleClick={() => t.id !== "all" && setEditingTab(t.id)}
                title="Arrastra para reordenar · Doble-click para renombrar"
                style={{ ...pill(activeTab === t.id), ...extraStyle }}
              >
                {t.name}{t.tickers ? ` (${t.tickers.length})` : ` (${allItems.length})`}
              </button>
            )}
            {t.id !== "all" && activeTab === t.id && (
              <button onClick={() => deleteTab(t.id)} title="Eliminar pestaña"
                style={{ padding: "2px 6px", border: "none", background: "transparent", color: "var(--text-tertiary)", fontSize: 11, cursor: "pointer", opacity: .5 }}>✕</button>
            )}
          </div>
          );
        })}
        {showAddTab ? (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input autoFocus value={newTabName} onChange={e => setNewTabName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addTab()}
              placeholder="Nombre..." style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid var(--gold)", background: "var(--subtle-border)", color: "var(--text-primary)", fontSize: 11, fontFamily: "var(--fm)", outline: "none", width: 100 }} />
            <button onClick={addTab} style={{ ...pill(true), padding: "5px 10px" }}>✓</button>
            <button onClick={() => setShowAddTab(false)} style={{ ...pill(false), padding: "5px 8px" }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setShowAddTab(true)} style={{ ...pill(false), padding: "5px 10px" }}>+ Nueva</button>
        )}
      </div>

      {/* Add ticker + search + sort */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input type="text" placeholder="Añadir ticker..." value={searchTicker} onChange={e => setSearchTicker(e.target.value.toUpperCase())}
          onKeyDown={e => {
            if (e.key === "Enter" && searchTicker) {
              updatePosition(searchTicker, { list: "watchlist", targetPrice: 0, dps: 0, name: searchTicker, lastPrice: 0 });
              if (currentTab.tickers) addToTab(currentTab.id, searchTicker);
              setSearchTicker("");
            }
          }}
          style={{ padding: "7px 12px", background: "var(--subtle-border)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 12, outline: "none", fontFamily: "var(--fm)", width: 130 }}
          onFocus={e => e.target.style.borderColor = "var(--gold)"} onBlur={e => e.target.style.borderColor = "var(--border)"} />
        <button onClick={() => {
          if (searchTicker) {
            updatePosition(searchTicker, { list: "watchlist", targetPrice: 0, dps: 0, name: searchTicker, lastPrice: 0 });
            if (currentTab.tickers) addToTab(currentTab.id, searchTicker);
            setSearchTicker("");
          }
        }}
          style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(255,214,10,.3)", background: "rgba(255,214,10,.06)", color: "#ffd60a", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--fm)" }}>+ Añadir</button>

        {allItems.length > 3 && (
          <input type="text" placeholder="🔍 Buscar..." value={quickFilter} onChange={e => setQuickFilter(e.target.value)}
            style={{ padding: "7px 12px", background: "var(--subtle-bg)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 12, outline: "none", fontFamily: "var(--fm)", flex: 1, minWidth: 120 }} />
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
          {orderedSortOptions.map(s => {
            const active = sortBy === s.id;
            const { extraStyle } = sortDragVisuals(s.id);
            return (
              <button
                key={s.id}
                {...sortDragHandlers(s.id)}
                onClick={() => setSortBy(s.id)}
                title="Arrastra para reordenar"
                style={{
                  padding: "4px 8px", borderRadius: 6,
                  border: `1px solid ${active ? "var(--gold)" : "var(--border)"}`,
                  background: active ? "var(--gold-dim)" : "transparent",
                  color: active ? "var(--gold)" : "var(--text-tertiary)",
                  fontSize: 9, fontWeight: active ? 700 : 500,
                  fontFamily: "var(--fm)",
                  ...extraStyle,
                }}
              >
                {s.lbl}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pastores del Dividendo — vista propia (no usa watchlistList).
          Se muestra cuando esta tab está activa, en lugar de la tabla
          normal del watchlist (que estaría vacía porque esos 19 tickers
          EU no están en posiciones del usuario). Al estar precargados
          en data/pastoresDividendo.js, basta con tirar de /api/prices. */}
      {currentTab.id === PASTORES_TAB_ID && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--gold)", fontFamily: "var(--fm)", letterSpacing: 0.5 }}>
              🎯 PASTORES DEL DIVIDENDO · {PASTORES_DIVIDENDO.length} EMPRESAS
            </div>
            <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
              {Object.keys(pastoresPrices).length === 0 ? '⏳ cargando precios…' : `✓ ${Object.keys(pastoresPrices).length}/${PASTORES_DIVIDENDO.length} con precio`}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 8 }}>
            {PASTORES_DIVIDENDO.map(p => {
              const price = pastoresPrices[p.ticker];
              const zone = priceZone(price, p.buyLow, p.buyHigh);
              const c = zoneColors(zone);
              const cur = p.currency === 'EUR' ? '€' : p.currency === 'GBP' ? '£' : '$';
              const lo = p.buyLow != null ? p.buyLow.toFixed(2) : '—';
              const hi = p.buyHigh != null ? p.buyHigh.toFixed(2) : '—';
              const px = price != null ? price.toFixed(2) : '—';
              return (
                <button
                  key={p.ticker}
                  onClick={() => openAnalysis?.(p.ticker)}
                  title={`Ver análisis de ${p.name}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 10px", background: c.bg,
                    border: `1px solid ${c.fg}33`, borderRadius: 8,
                    cursor: openAnalysis ? 'pointer' : 'default',
                    textAlign: 'left', fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontSize: 9, fontWeight: 700, color: c.fg, fontFamily: "var(--fm)", padding: "2px 5px", borderRadius: 4, background: `${c.fg}22`, minWidth: 60, textAlign: "center" }}>{c.label}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                      <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>{p.ticker}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginTop: 2 }}>
                      Compra {cur}{lo}–{cur}{hi} · ahora <span style={{ color: c.fg, fontWeight: 700 }}>{cur}{px}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 10, lineHeight: 1.6 }}>
            🟢 COMPRA = precio ≤ rango bajo · 🟡 ZONA = dentro del rango · 🔴 CARO = por encima del rango alto · <strong>S/D</strong> = sin precio (puede tardar unos segundos).
            <br/>Click en cualquier empresa para abrir su análisis completo. Unilever y Reckitt sin rango aún — fíjalos cuando quieras.
          </div>
        </div>
      )}

      {/* Items — sólo para watchlists normales, NO para Pastores */}
      {currentTab.id !== PASTORES_TAB_ID && sorted.length === 0 && (
        <EmptyState
          icon="👁"
          title={currentTab.tickers ? `"${currentTab.name}" esta vacia` : "Watchlist vacia"}
          subtitle={currentTab.tickers ? "Anade tickers usando el campo de busqueda de arriba." : "Anade empresas que te interesen para hacer seguimiento de sus precios y metricas."}
        />
      )}

      {/* Data table view — sólo para watchlists normales */}
      {currentTab.id !== PASTORES_TAB_ID && sorted.length > 0 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, minWidth: 700 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  {[
                    { l: "", align: "left" },
                    { l: "TICKER", align: "left" },
                    { l: "NOMBRE", align: "left" },
                    { l: "PRECIO", align: "right" },
                    { l: "CAMBIO", align: "right" },
                    { l: "52W RANGE", align: "right" },
                    { l: "DIV YIELD", align: "right" },
                    { l: "Q", align: "center" },
                    { l: "S", align: "center" },
                    { l: "5F", align: "center" },
                    { l: "🎯", align: "center" },
                    { l: "SECTOR", align: "left" },
                    { l: "", align: "center" },
                  ].map((h, i) => (
                    <th key={i} style={{ padding: "6px 10px", textAlign: h.align, color: "var(--text-tertiary)", fontSize: 9, fontWeight: 700, fontFamily: "var(--fm)", letterSpacing: .3, whiteSpace: "nowrap" }}>{h.l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => {
                  const chgPct = p.dayChange || 0;
                  const high52 = p.fiftyTwoWeekHigh || 0;
                  const low52 = p.fiftyTwoWeekLow || 0;
                  const range52 = high52 > low52 ? ((p.lastPrice - low52) / (high52 - low52) * 100) : 50;
                  const cc = getCountry(p.ticker, p.currency);
                  return (
                    <tr key={p.ticker} onClick={() => openAnalysis(p.ticker)}
                      style={{ borderBottom: "1px solid var(--subtle-border)", cursor: "pointer", transition: "background .15s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--card-hover)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "5px 6px", width: 32 }}>
                        <img src={`https://images.financialmodelingprep.com/symbol/${p.ticker.replace(':', '.')}.png`} alt=""
                          style={{ width: 28, height: 28, borderRadius: 6, background: "#161b22" }} onError={e => { e.target.style.display = "none"; }} />
                      </td>
                      <td style={{ padding: "5px 10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 16 }}>{FLAGS[cc] || ""}</span>
                          <span style={{ fontWeight: 700, color: "var(--gold)", fontFamily: "var(--fm)", fontSize: 12, letterSpacing: "0.5px", whiteSpace: "nowrap" }}>{p.ticker}</span>
                        </div>
                      </td>
                      <td style={{ padding: "5px 10px", maxWidth: 200 }}>
                        <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-primary)", fontFamily: "var(--fm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }} title={p.name || p.ticker}>{p.name || p.ticker}</span>
                      </td>
                      <td style={{ padding: "5px 10px", textAlign: "right", fontFamily: "var(--fm)", fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>
                        ${_sf(p.lastPrice || 0, 2)}
                      </td>
                      <td style={{ padding: "5px 10px", textAlign: "right" }}>
                        <div style={{ fontFamily: "var(--fm)", fontWeight: 600, color: chgPct >= 0 ? "var(--green)" : "var(--red)", fontSize: 12 }}>
                          {chgPct >= 0 ? "+" : ""}{_sf(chgPct, 2)}%
                        </div>
                        <div style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--text-tertiary)" }}>
                          {p.dayChangeAbs ? (p.dayChangeAbs >= 0 ? "+$" : "-$") + _sf(Math.abs(p.dayChangeAbs), 2) : ""}
                        </div>
                      </td>
                      <td style={{ padding: "5px 10px", textAlign: "right" }}>
                        {high52 > 0 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                            <span style={{ fontSize: 8, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>${_sf(low52, 0)}</span>
                            <div style={{ width: 50, height: 4, background: "var(--subtle-bg2)", borderRadius: 2, overflow: "hidden", position: "relative" }}>
                              <div style={{ position: "absolute", left: `${Math.max(0, Math.min(100, range52))}%`, top: -1, width: 6, height: 6, borderRadius: 3, background: "var(--gold)", transform: "translateX(-3px)" }} />
                            </div>
                            <span style={{ fontSize: 8, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>${_sf(high52, 0)}</span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "5px 10px", textAlign: "right", fontFamily: "var(--fm)", color: "var(--gold)", fontSize: 11 }}>
                        {(p.divYieldTTM || 0) > 0 ? _sf(p.divYieldTTM * 100, 1) + "%" : "—"}
                      </td>
                      {/* Q / S / 5F — read-only scoring fetched above */}
                      {(() => {
                        const qs = qsScores[p.ticker];
                        const qVal = qs?.quality_score;
                        const sVal = qs?.safety_score;
                        const qColor = v => v == null ? 'var(--text-tertiary)' : v >= 80 ? 'var(--gold)' : v >= 65 ? 'var(--green)' : v >= 50 ? '#ffd60a' : '#ff6b6b';
                        const onScoreClick = qs ? (e) => { e.stopPropagation(); openScoresModal && openScoresModal(p.ticker); } : undefined;
                        return (
                          <>
                            <td onClick={onScoreClick} title={qs ? `Quality ${qVal}/100 · click para detalles` : 'Sin datos'} style={{ padding: "5px 10px", textAlign: "center", fontFamily: "var(--fm)", fontSize: 11, fontWeight: 800, color: qColor(qVal), cursor: qs ? 'pointer' : 'default' }}>
                              {qVal != null ? qVal.toFixed(0) : '—'}
                            </td>
                            <td onClick={onScoreClick} title={qs ? `Safety ${sVal}/100` : 'Sin datos'} style={{ padding: "5px 10px", textAlign: "center", fontFamily: "var(--fm)", fontSize: 11, fontWeight: 800, color: qColor(sVal), cursor: qs ? 'pointer' : 'default' }}>
                              {sVal != null ? sVal.toFixed(0) : '—'}
                            </td>
                          </>
                        );
                      })()}
                      <td onClick={e => e.stopPropagation()} style={{ padding: "5px 10px", textAlign: "center" }}>
                        <FiveFiltersBars scores={fiveFilters[p.ticker]} ticker={p.ticker} />
                      </td>
                      {/* Oracle badge — cached only; click opens BuyWizard (~$0.75/request) */}
                      {(() => {
                        const o = oracleVerdicts[p.ticker];
                        const onClickOracle = (e) => { e.stopPropagation(); setOracleWizardTicker(p.ticker); };
                        if (o && o.action) {
                          const rank = { BUY: 6, ADD: 5, ACCUMULATE: 5, HOLD: 3, TRIM: 2, SELL: 1, AVOID: 0 }[o.action] ?? 3;
                          const color = rank >= 5 ? "#22c55e" : rank === 3 ? "#64d2ff" : rank === 2 ? "#f59e0b" : "#ef4444";
                          const tip = `${o.action} ${o.conviction || ''}/10\n${o.one_liner || ''}\n\nClick para ver análisis completo.`;
                          return (
                            <td title={tip} onClick={onClickOracle} style={{ padding: "5px 10px", textAlign: "center", cursor: "pointer" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 5px", borderRadius: 4, background: `${color}22`, border: `1px solid ${color}66`, color, fontSize: 9, fontWeight: 800, fontFamily: "var(--fm)", letterSpacing: .2 }}>
                                {o.action}{o.conviction ? ` ${o.conviction}` : ''}
                              </span>
                            </td>
                          );
                        }
                        return (
                          <td title="Generar veredicto Oracle — ~$0.75" onClick={onClickOracle}
                            style={{ padding: "5px 10px", textAlign: "center", cursor: "pointer", fontSize: 12, color: "var(--text-tertiary)", opacity: .6 }}
                            onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "var(--gold)"; }}
                            onMouseLeave={e => { e.currentTarget.style.opacity = ".6"; e.currentTarget.style.color = "var(--text-tertiary)"; }}>
                            ↻
                          </td>
                        );
                      })()}
                      <td style={{ padding: "5px 10px", fontFamily: "var(--fm)", color: "var(--text-tertiary)", fontSize: 10 }}>
                        {p.sector || ""}
                      </td>
                      <td style={{ padding: "5px 6px", textAlign: "center" }} onClick={e => e.stopPropagation()}>
                        {customTabs.length > 0 && (
                          <select value="" onChange={e => { if (e.target.value) addToTab(e.target.value, p.ticker); e.target.value = ""; }}
                            style={{ padding: "2px 4px", borderRadius: 4, border: "1px solid var(--border)", background: "transparent", color: "var(--text-tertiary)", fontSize: 8, fontFamily: "var(--fm)", outline: "none", cursor: "pointer", width: 24 }}>
                            <option value="">+</option>
                            {customTabs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        )}
                        {currentTab.tickers && (
                          <button onClick={e => { e.stopPropagation(); removeFromTab(currentTab.id, p.ticker); }}
                            style={{ padding: "1px 5px", border: "none", background: "transparent", color: "var(--text-tertiary)", fontSize: 10, cursor: "pointer", opacity: .5 }} title="Quitar de esta pestaña">✕</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>
        Doble-click en el nombre de una pestaña para renombrarla · Las pestañas se guardan en tu navegador
      </div>

      {/* Oracle BuyWizard — opens from 🎯 column. Refresca verdicts on close. */}
      <BuyWizard
        open={!!oracleWizardTicker}
        initialTicker={oracleWizardTicker}
        onClose={() => {
          setOracleWizardTicker(null);
          if (watchlistTickers.length) loadOracleBatch(watchlistTickers);
        }}
      />
    </div>
  );
}
