import { useState, useCallback, useEffect } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf } from '../../utils/formatters.js';
import { EmptyState } from '../ui/EmptyState.jsx';
import { useDraggableOrder } from '../../hooks/useDraggableOrder.js';

const WL_KEY = "ayr_wl_tabs";

// Sort pill definitions (id stable for persistence)
const WATCHLIST_SORT_OPTIONS = [
  { id: "name",   lbl: "A-Z" },
  { id: "price",  lbl: "Precio" },
  { id: "change", lbl: "Cambio" },
];

export default function WatchlistTab() {
  const {
    watchlistList,
    searchTicker, setSearchTicker, updatePosition,
    openAnalysis, CompanyRow, FLAGS, getCountry,
    displayCcy, privacyMode, hide,
  } = useHome();

  // Persistent tabs in localStorage
  const [tabs, setTabs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(WL_KEY)) || [{ id: "all", name: "Todas", tickers: null }]; }
    catch { return [{ id: "all", name: "Todas", tickers: null }]; }
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

  const saveTabs = useCallback((t) => { setTabs(t); localStorage.setItem(WL_KEY, JSON.stringify(t)); }, []);

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
        {tabs.map(t => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {editingTab === t.id ? (
              <input autoFocus value={t.name} onChange={e => saveTabs(tabs.map(x => x.id === t.id ? { ...x, name: e.target.value } : x))}
                onBlur={() => setEditingTab(null)} onKeyDown={e => e.key === "Enter" && setEditingTab(null)}
                style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid var(--gold)", background: "var(--gold-dim)", color: "var(--gold)", fontSize: 11, fontWeight: 700, fontFamily: "var(--fm)", outline: "none", width: 100 }} />
            ) : (
              <button onClick={() => setActiveTab(t.id)} onDoubleClick={() => t.id !== "all" && setEditingTab(t.id)}
                style={pill(activeTab === t.id)}>
                {t.name}{t.tickers ? ` (${t.tickers.length})` : ` (${allItems.length})`}
              </button>
            )}
            {t.id !== "all" && activeTab === t.id && (
              <button onClick={() => deleteTab(t.id)} title="Eliminar pestaña"
                style={{ padding: "2px 6px", border: "none", background: "transparent", color: "var(--text-tertiary)", fontSize: 11, cursor: "pointer", opacity: .5 }}>✕</button>
            )}
          </div>
        ))}
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

      {/* Items */}
      {sorted.length === 0 && (
        <EmptyState
          icon="👁"
          title={currentTab.tickers ? `"${currentTab.name}" esta vacia` : "Watchlist vacia"}
          subtitle={currentTab.tickers ? "Anade tickers usando el campo de busqueda de arriba." : "Anade empresas que te interesen para hacer seguimiento de sus precios y metricas."}
        />
      )}

      {/* Data table view */}
      {sorted.length > 0 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, minWidth: 700 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  {["", "TICKER", "PRECIO", "CAMBIO", "52W RANGE", "DIV YIELD", "SECTOR", ""].map((h, i) => (
                    <th key={i} style={{ padding: "6px 10px", textAlign: i <= 1 || i === 6 ? "left" : "right", color: "var(--text-tertiary)", fontSize: 9, fontWeight: 700, fontFamily: "var(--fm)", letterSpacing: .3, whiteSpace: "nowrap" }}>{h}</th>
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
                        <div style={{ fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--fm)", fontSize: 13 }}>
                          <span style={{ fontSize: 16, marginRight: 4 }}>{FLAGS[cc] || ""}</span>{p.ticker}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{p.name || ""}</div>
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
    </div>
  );
}
