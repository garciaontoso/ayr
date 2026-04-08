import { useState, useMemo, useCallback, useEffect } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf, fDol } from '../../utils/formatters.js';
import { API_URL } from '../../constants/index.js';
import { EmptyState, InlineLoading } from '../ui/EmptyState.jsx';
import { useFireMetrics } from '../../hooks/useFireMetrics.js';

/* Charts removed — integrated inline in dashboard */
/* ═══════════════════════════════════════════════════════════════
   📅 CalendarioSection — Mac Calendar-style dividend calendar
   ═══════════════════════════════════════════════════════════════ */
function CalendarioSection({ divLog, POS_STATIC, ownedTickers, soloActuales }) {
  const now = new Date();
  const [calMonth, setCalMonth] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDay, setSelectedDay] = useState(null);
  const [showProjected, setShowProjected] = useState(true);
  const [viewMode, setViewMode] = useState("month"); // month | year
  const [realExDates, setRealExDates] = useState({});

  // Load real ex-dates from FMP (worker handles FMP_MAP conversion)
  useEffect(() => {
    const tickers = Object.keys(POS_STATIC).join(",");
    if (!tickers) return;
    fetch(`${API_URL}/api/dividend-calendar?symbols=${tickers}`)
      .then(r => r.json())
      .then(d => {
        const byDate = {};
        // Upcoming ex-dates
        (d.upcoming || []).forEach(x => {
          if (!x.exDate) return;
          if (!byDate[x.exDate]) byDate[x.exDate] = [];
          byDate[x.exDate].push({ ticker: x.symbol, type: "exdate", dividend: x.dividend, payDate: x.payDate });
        });
        // Historical ex-dates from last 12 months
        for (const [sym, hist] of Object.entries(d.history || {})) {
          (hist || []).forEach(h => {
            if (!h.exDate) return;
            if (!byDate[h.exDate]) byDate[h.exDate] = [];
            byDate[h.exDate].push({ ticker: sym, type: "exdate_past", dividend: h.dividend, payDate: h.payDate });
          });
        }
        setRealExDates(byDate);
      })
      .catch(() => setRealExDates({}));
  }, []);

  const DOW = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
  const MNAMES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  // Group divs by date (filter to owned tickers when soloActuales)
  const divByDate = useMemo(() => {
    const map = {};
    divLog.forEach(d => {
      if (!d.date) return;
      if (soloActuales && d.ticker && !ownedTickers.has(d.ticker)) return;
      if (!map[d.date]) map[d.date] = [];
      map[d.date].push(d);
    });
    return map;
  }, [divLog, soloActuales, ownedTickers]);

  // Projected future dividends from frequency
  const projectedDivs = useMemo(() => {
    const tickerDates = {};
    divLog.forEach(d => {
      if (!d.date || !d.ticker) return;
      if (soloActuales && !ownedTickers.has(d.ticker)) return;
      if (!tickerDates[d.ticker]) tickerDates[d.ticker] = [];
      tickerDates[d.ticker].push({ date: d.date, gross: d.gross || 0, net: d.net || 0 });
    });
    const projected = {};
    const today = new Date().toISOString().slice(0, 10);
    for (const [ticker, entries] of Object.entries(tickerDates)) {
      const dates = entries.map(e => e.date).sort();
      if (dates.length < 2) continue;
      const gaps = [];
      for (let i = 1; i < dates.length; i++) {
        const d1 = new Date(dates[i - 1]), d2 = new Date(dates[i]);
        gaps.push((d2 - d1) / 864e5);
      }
      const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      if (avgGap > 400) continue;
      const lastDate = dates[dates.length - 1];
      const avgGross = entries.slice(-4).reduce((s, e) => s + e.gross, 0) / Math.min(entries.length, 4);
      const avgNet = entries.slice(-4).reduce((s, e) => s + e.net, 0) / Math.min(entries.length, 4);
      let nextDate = new Date(lastDate);
      for (let p = 0; p < 12; p++) {
        nextDate = new Date(nextDate.getTime() + avgGap * 864e5);
        const nf = nextDate.toISOString().slice(0, 10);
        if (nf <= today) continue;
        if (nf > new Date(Date.now() + 400 * 864e5).toISOString().slice(0, 10)) break;
        if (!projected[nf]) projected[nf] = [];
        projected[nf].push({ ticker, gross: avgGross, net: avgNet, projected: true });
      }
    }
    return projected;
  }, [divLog, soloActuales, ownedTickers]);

  // Merge real + projected for display
  const allDivsByDate = useMemo(() => {
    const merged = { ...divByDate };
    if (showProjected) {
      for (const [date, entries] of Object.entries(projectedDivs)) {
        if (!merged[date]) merged[date] = [];
        merged[date] = [...merged[date], ...entries];
      }
    }
    // Add real ex-dates from FMP
    for (const [date, entries] of Object.entries(realExDates)) {
      if (!merged[date]) merged[date] = [];
      entries.forEach(e => {
        // Don't add if we already have a real dividend entry for this ticker+date
        const exists = merged[date].some(x => x.ticker === e.ticker && !x.projected);
        if (!exists) {
          merged[date].push({
            ticker: e.ticker, gross: e.dividend || 0, net: (e.dividend || 0) * 0.75,
            projected: e.type === "exdate", exDate: true,
            payDate: e.payDate,
          });
        }
      });
    }
    return merged;
  }, [divByDate, projectedDivs, showProjected, realExDates]);

  // Calendar grid
  const { year, month } = calMonth;
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = (firstDay.getDay() + 6) % 7; // Monday = 0

  const weeks = useMemo(() => {
    const w = [];
    let week = new Array(7).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = (new Date(year, month, d).getDay() + 6) % 7;
      week[dow] = d;
      if (dow === 6 || d === daysInMonth) {
        w.push(week);
        week = new Array(7).fill(null);
      }
    }
    return w;
  }, [year, month, daysInMonth]);

  // Stats for current month
  const monthStats = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    let gross = 0, net = 0, count = 0, projGross = 0;
    const tickers = new Set();
    for (const [date, entries] of Object.entries(allDivsByDate)) {
      if (!date.startsWith(prefix)) continue;
      entries.forEach(e => {
        if (e.projected) { projGross += e.gross || 0; }
        else { gross += e.gross || 0; net += e.net || 0; count++; }
        tickers.add(e.ticker);
      });
    }
    return { gross, net, count, projGross, tickers: tickers.size };
  }, [allDivsByDate, year, month]);

  // Year view: aggregate by month
  const yearData = useMemo(() => {
    const months = Array.from({ length: 12 }, () => ({ gross: 0, net: 0, count: 0, projGross: 0, tickers: new Set() }));
    for (const [date, entries] of Object.entries(allDivsByDate)) {
      if (!date.startsWith(String(year))) continue;
      const mi = parseInt(date.slice(5, 7), 10) - 1;
      entries.forEach(e => {
        if (e.projected) months[mi].projGross += e.gross || 0;
        else { months[mi].gross += e.gross || 0; months[mi].net += e.net || 0; months[mi].count++; }
        months[mi].tickers.add(e.ticker);
      });
    }
    return months;
  }, [allDivsByDate, year]);

  const navMonth = (dir) => {
    setCalMonth(prev => {
      let m = prev.month + dir, y = prev.year;
      if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
      return { year: y, month: m };
    });
    setSelectedDay(null);
  };

  const goToday = () => { setCalMonth({ year: now.getFullYear(), month: now.getMonth() }); setSelectedDay(null); };

  // Max daily amount for heat map
  const maxDayAmount = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    let max = 0;
    for (const [date, entries] of Object.entries(allDivsByDate)) {
      if (!date.startsWith(prefix)) continue;
      const total = entries.reduce((s, e) => s + (e.gross || 0), 0);
      if (total > max) max = total;
    }
    return max || 1;
  }, [allDivsByDate, year, month]);

  const selectedDate = selectedDay ? `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}` : null;
  const selectedEntries = selectedDate ? (allDivsByDate[selectedDate] || []) : [];
  const todayStr = now.toISOString().slice(0, 10);

  // iCal URL
  const icsUrl = `${API_URL}/api/dividendos/calendar.ics`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header: Navigation + Stats */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => viewMode === "month" ? navMonth(-1) : setCalMonth(p => ({ ...p, year: p.year - 1 }))} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>◀</button>
          <div style={{ minWidth: 160, textAlign: "center" }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--fd)", cursor: "pointer" }} onClick={() => setViewMode(v => v === "month" ? "year" : "month")}>
              {viewMode === "month" ? `${MNAMES[month]} ${year}` : year}
            </span>
          </div>
          <button onClick={() => viewMode === "month" ? navMonth(1) : setCalMonth(p => ({ ...p, year: p.year + 1 }))} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>▶</button>
          <button onClick={goToday} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--gold)", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "var(--fm)" }}>Hoy</button>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => setShowProjected(!showProjected)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${showProjected ? "rgba(100,210,255,.4)" : "var(--border)"}`, background: showProjected ? "rgba(100,210,255,.08)" : "transparent", color: showProjected ? "#64d2ff" : "var(--text-tertiary)", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "var(--fm)" }}>
            {showProjected ? "🔮 Proyectados ON" : "🔮 Proyectados OFF"}
          </button>
          <button onClick={() => setViewMode(v => v === "month" ? "year" : "month")} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-tertiary)", fontSize: 10, cursor: "pointer", fontFamily: "var(--fm)" }}>
            {viewMode === "month" ? "📅 Año" : "📅 Mes"}
          </button>
        </div>
      </div>

      {/* Month KPIs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          { l: "GROSS", v: `$${monthStats.gross >= 1000 ? _sf(monthStats.gross / 1000, 1) + "K" : _sf(monthStats.gross, 0)}`, c: "var(--gold)" },
          { l: "NET", v: `$${monthStats.net >= 1000 ? _sf(monthStats.net / 1000, 1) + "K" : _sf(monthStats.net, 0)}`, c: "var(--green)" },
          { l: "COBROS", v: monthStats.count, c: "var(--text-primary)" },
          { l: "TICKERS", v: monthStats.tickers, c: "var(--text-secondary)" },
          ...(monthStats.projGross > 0 ? [{ l: "ESTIMADO", v: `$${monthStats.projGross >= 1000 ? _sf(monthStats.projGross / 1000, 1) + "K" : _sf(monthStats.projGross, 0)}`, c: "#64d2ff" }] : []),
        ].map((k, i) => (
          <div key={i} style={{ flex: "1 1 80px", padding: "10px 14px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }}>
            <div style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)", letterSpacing: .5, fontWeight: 600 }}>{k.l}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.c, fontFamily: "var(--fm)" }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* YEAR VIEW */}
      {viewMode === "year" && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
            {yearData.map((md, mi) => {
              const total = md.gross + md.projGross;
              const maxY = Math.max(...yearData.map(m => m.gross + m.projGross), 1);
              const intensity = total / maxY;
              const isCurrentMonth = year === now.getFullYear() && mi === now.getMonth();
              return (
                <div key={mi} onClick={() => { setCalMonth({ year, month: mi }); setViewMode("month"); }}
                  style={{ padding: 12, borderRadius: 10, border: `1px solid ${isCurrentMonth ? "var(--gold)" : "var(--border)"}`, background: total > 0 ? `rgba(200,164,78,${0.03 + intensity * 0.12})` : "var(--row-alt)", cursor: "pointer", transition: "all .15s" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: isCurrentMonth ? "var(--gold)" : "var(--text-secondary)", fontFamily: "var(--fm)", marginBottom: 6 }}>{MNAMES[mi].slice(0, 3)}</div>
                  {md.gross > 0 && <div style={{ fontSize: 15, fontWeight: 700, color: "var(--gold)", fontFamily: "var(--fm)" }}>${md.gross >= 1000 ? _sf(md.gross / 1000, 1) + "K" : _sf(md.gross, 0)}</div>}
                  {md.projGross > 0 && md.gross === 0 && <div style={{ fontSize: 15, fontWeight: 700, color: "#64d2ff", fontFamily: "var(--fm)", opacity: .7 }}>~${md.projGross >= 1000 ? _sf(md.projGross / 1000, 1) + "K" : _sf(md.projGross, 0)}</div>}
                  {md.count > 0 && <div style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginTop: 2 }}>{md.count} cobros · {md.tickers.size} tickers</div>}
                  {md.count === 0 && md.projGross > 0 && <div style={{ fontSize: 9, color: "rgba(100,210,255,.5)", fontFamily: "var(--fm)", marginTop: 2 }}>{md.tickers.size} estimados</div>}
                </div>
              );
            })}
          </div>
          {/* Year total bar */}
          <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(200,164,78,.05)", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--fm)" }}>Total {year}</span>
            <div style={{ display: "flex", gap: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--gold)", fontFamily: "var(--fm)" }}>${yearData.reduce((s, m) => s + m.gross, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              {yearData.some(m => m.projGross > 0) && <span style={{ fontSize: 14, fontWeight: 600, color: "#64d2ff", fontFamily: "var(--fm)", opacity: .7 }}>+~${yearData.reduce((s, m) => s + m.projGross, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} est.</span>}
            </div>
          </div>
        </div>
      )}

      {/* MONTH CALENDAR GRID */}
      {viewMode === "month" && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 16 }}>
          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 6 }}>
            {DOW.map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", fontFamily: "var(--fm)", padding: "4px 0" }}>{d}</div>
            ))}
          </div>
          {/* Weeks */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                {week.map((day, di) => {
                  if (day === null) return <div key={di} style={{ minHeight: 72 }} />;
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const entries = allDivsByDate[dateStr] || [];
                  const realEntries = entries.filter(e => !e.projected);
                  const projEntries = entries.filter(e => e.projected);
                  const dayTotal = entries.reduce((s, e) => s + (e.gross || 0), 0);
                  const isToday = dateStr === todayStr;
                  const isSelected = day === selectedDay;
                  const isWeekend = di >= 5;
                  const intensity = dayTotal > 0 ? Math.min(dayTotal / maxDayAmount, 1) : 0;

                  return (
                    <div key={di} onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                      style={{
                        minHeight: 72, borderRadius: 8, padding: "4px 5px",
                        border: `1px solid ${isSelected ? "var(--gold)" : isToday ? "rgba(200,164,78,.5)" : entries.length > 0 ? `rgba(200,164,78,${0.1 + intensity * 0.3})` : "var(--subtle-border)"}`,
                        background: entries.length > 0 ? `rgba(200,164,78,${0.06 + intensity * 0.3})` : isWeekend ? "var(--row-alt)" : "transparent",
                        cursor: "pointer", transition: "all .12s", position: "relative",
                      }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: isToday ? 800 : 500, color: isToday ? "var(--gold)" : "var(--text-secondary)", fontFamily: "var(--fm)",
                          ...(isToday ? { background: "var(--gold)", color: "#000", borderRadius: "50%", width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10 } : {})
                        }}>{day}</span>
                        {dayTotal > 0 && <span style={{ fontSize: 8, fontWeight: 700, color: projEntries.length > 0 && realEntries.length === 0 ? "#64d2ff" : "var(--gold)", fontFamily: "var(--fm)" }}>${dayTotal >= 1000 ? _sf(dayTotal / 1000, 1) + "K" : _sf(dayTotal, 0)}</span>}
                      </div>
                      {/* Ticker badges: gold=cobrado, green=ex-date real, blue=proyectado */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                        {realEntries.filter(e=>!e.exDate).slice(0, 3).map((e, ei) => (
                          <span key={ei} style={{ fontSize: 7, padding: "1px 3px", borderRadius: 3, background: "rgba(200,164,78,.15)", color: "var(--gold)", fontWeight: 600, fontFamily: "var(--fm)", lineHeight: 1.2 }}>{e.ticker}</span>
                        ))}
                        {entries.filter(e=>e.exDate&&!e.projected).slice(0, 3).map((e, ei) => (
                          <span key={`ex${ei}`} style={{ fontSize: 7, padding: "1px 3px", borderRadius: 3, background: "rgba(48,209,88,.12)", color: "var(--green)", fontWeight: 600, fontFamily: "var(--fm)", lineHeight: 1.2 }} title={`Ex-date real · Pay: ${e.payDate||"?"}`}>📅{e.ticker}</span>
                        ))}
                        {projEntries.filter(e=>!e.exDate).slice(0, 3).map((e, ei) => (
                          <span key={`p${ei}`} style={{ fontSize: 7, padding: "1px 3px", borderRadius: 3, background: "rgba(100,210,255,.1)", color: "#64d2ff", fontWeight: 600, fontFamily: "var(--fm)", lineHeight: 1.2, fontStyle: "italic" }}>{e.ticker}</span>
                        ))}
                        {entries.length > 6 && <span style={{ fontSize: 7, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>+{entries.length - 6}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", alignItems: "center", marginTop: 10, fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)", flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(200,164,78,.3)" }} /> Cobrado</span>
            {showProjected && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(100,210,255,.2)" }} /> Estimado</span>}
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--gold)" }} /> Hoy</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>$0</span>
              <span style={{ display: "flex", gap: 1 }}>
                {[0.08, 0.15, 0.22, 0.32, 0.45].map((op, i) => (
                  <span key={i} style={{ width: 12, height: 10, borderRadius: 2, background: `rgba(200,164,78,${op})` }} />
                ))}
              </span>
              <span style={{ fontSize: 9, fontWeight: 600, color: "var(--gold)" }}>${maxDayAmount >= 1000 ? _sf(maxDayAmount / 1000, 1) + "K" : _sf(maxDayAmount, 0)}</span>
            </span>
          </div>
        </div>
      )}

      {/* Selected day detail */}
      {selectedDay && selectedEntries.length > 0 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--gold-dim)", borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gold)", fontFamily: "var(--fd)", marginBottom: 10 }}>
            💰 {selectedDay} {MNAMES[month]} {year} — {selectedEntries.length} cobro{selectedEntries.length > 1 ? "s" : ""}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {selectedEntries.sort((a, b) => (b.gross || 0) - (a.gross || 0)).map((e, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: e.projected ? "rgba(100,210,255,.04)" : "rgba(200,164,78,.04)", borderRadius: 8, border: `1px solid ${e.projected ? "rgba(100,210,255,.12)" : "rgba(200,164,78,.12)"}` }}>
                <div style={{ width: 42, height: 24, borderRadius: 6, background: e.projected ? "rgba(100,210,255,.1)" : "rgba(200,164,78,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: e.projected ? "#64d2ff" : "var(--gold)", fontFamily: "var(--fm)" }}>{e.ticker?.slice(0, 5)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--fm)" }}>${_sf(e.gross || 0, 2)}</div>
                  {e.net != null && !e.projected && <div style={{ fontSize: 9, color: "var(--green)", fontFamily: "var(--fm)" }}>Net: ${_sf(e.net, 2)} · Tax: {e.gross > 0 ? _sf((1 - e.net / e.gross) * 100, 0) : 0}%</div>}
                </div>
                {e.projected && <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 4, background: "rgba(100,210,255,.1)", color: "#64d2ff", fontFamily: "var(--fm)", fontWeight: 600 }}>ESTIMADO</span>}
                {e.shares && !e.projected && <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>{e.shares} sh · ${_sf((e.gross || 0) / e.shares, 4)}/sh</span>}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(200,164,78,.04)", borderRadius: 8, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--fm)" }}>Total del día</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gold)", fontFamily: "var(--fm)" }}>${selectedEntries.reduce((s, e) => s + (e.gross || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      )}

      {/* Upcoming dividends timeline */}
      {showProjected && (() => {
        const today = new Date().toISOString().slice(0, 10);
        const upcoming = [];
        for (const [date, entries] of Object.entries(projectedDivs)) {
          if (date <= today) continue;
          entries.forEach(e => upcoming.push({ ...e, date }));
        }
        upcoming.sort((a, b) => a.date.localeCompare(b.date));
        if (upcoming.length === 0) return null;
        const next30 = upcoming.filter(u => u.date <= new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10));
        const next30total = next30.reduce((s, e) => s + (e.gross || 0), 0);
        return (
          <div style={{ background: "var(--card)", border: "1px solid rgba(100,210,255,.15)", borderRadius: 14, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#64d2ff", fontFamily: "var(--fd)" }}>🔮 Próximos Dividendos Estimados</div>
              <div style={{ fontSize: 10, color: "#64d2ff", fontFamily: "var(--fm)", opacity: .7 }}>30d: ~${next30total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {upcoming.slice(0, 20).map((u, i) => {
                const daysAway = Math.round((new Date(u.date) - new Date()) / 864e5);
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 6, background: "rgba(100,210,255,.02)" }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: daysAway <= 7 ? "var(--green)" : "#64d2ff", fontFamily: "var(--fm)", minWidth: 75 }}>{u.date}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: "var(--gold)", fontFamily: "var(--fm)", minWidth: 40 }}>{u.ticker}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--fm)" }}>~${_sf(u.gross, 2)}</span>
                    <span style={{ fontSize: 8, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginLeft: "auto" }}>en {daysAway}d</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* iCal subscribe */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gold)", fontFamily: "var(--fd)", marginBottom: 8 }}>🗓 Suscribirse al Calendario</div>
        <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginBottom: 12, lineHeight: 1.5 }}>
          Añade tus dividendos (cobrados + estimados) a Apple Calendar, Google Calendar o Outlook.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => { window.open(`webcal://${icsUrl.replace(/^https?:\/\//, '')}`, '_blank'); }}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--gold)", background: "var(--gold-dim)", color: "var(--gold)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--fm)", display: "flex", alignItems: "center", gap: 6 }}>
            🍎 Apple Calendar
          </button>
          <button onClick={() => { window.open(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(icsUrl)}`, '_blank'); }}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--fm)", display: "flex", alignItems: "center", gap: 6 }}>
            📅 Google Calendar
          </button>
          <button onClick={() => { navigator.clipboard.writeText(icsUrl); alert('URL copiada: ' + icsUrl); }}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-tertiary)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--fm)", display: "flex", alignItems: "center", gap: 6 }}>
            📋 Copiar URL
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)", opacity: .6, wordBreak: "break-all" }}>{icsUrl}</div>
      </div>
    </div>
  );
}

export default function DividendosTab() {
  const {
    divLog, divLoading, divShowForm, setDivShowForm,
    divForm, setDivForm, divFilter, setDivFilter,
    divSort, setDivSort, divCalYear, setDivCalYear,
    addDivEntry, deleteDivEntry,
    POS_STATIC, getCountry, FLAGS,
    DIV_BY_YEAR, DIV_BY_MONTH,
    portfolioTotals, FORWARD_DIV,
    GASTOS_MONTH, ibData, fxRates,
  } = useHome();

  // ── Canonical FIRE metrics (single source of truth) ────────────────
  // Compute annual expenses in USD from last 12m of GASTOS_MONTH (multi-currency)
  const fxEurUsdDiv = fxRates?.EUR ? 1/fxRates.EUR : 1.18;
  const fxCnyUsdDiv = fxRates?.CNY ? 1/fxRates.CNY : 1/7.25;
  const annualExpensesUSD = useMemo(() => {
    const months = Object.keys(GASTOS_MONTH || {}).sort().slice(-12);
    if (!months.length) return 0;
    const sum = months.reduce((s, m) => {
      const d = GASTOS_MONTH[m] || {};
      return s + (d.eur||0) * fxEurUsdDiv + (d.cny||0) * fxCnyUsdDiv + (d.usd||0);
    }, 0);
    return (sum / months.length) * 12;
  }, [GASTOS_MONTH, fxEurUsdDiv, fxCnyUsdDiv]);
  const nlvUSD = ibData?.summary?.nlv?.amount || 0;
  // Annual net dividends from divLog (last 12 months by date)
  const annualDivNetUSD = useMemo(() => {
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth()-12);
    const cs = cutoff.toISOString().slice(0,10);
    return divLog
      .filter(d => d.date && d.date >= cs)
      .reduce((s, d) => s + (d.net || 0), 0);
  }, [divLog]);
  const fire = useFireMetrics({
    nlv: nlvUSD,
    annualExpenses: annualExpensesUSD,
    annualDividendsNet: annualDivNetUSD,
  });

  const [section, setSection] = useState("dashboard");
  const [soloActuales, setSoloActuales] = useState(true);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('div_view') || "neto"); // "bruto" | "neto"
  const isNeto = viewMode === "neto";

  // Set of tickers currently owned (sh > 0)
  const ownedTickers = useMemo(() => {
    const set = new Set();
    for (const [t, pos] of Object.entries(POS_STATIC || {})) {
      if (pos && pos.sh > 0) set.add(t);
    }
    return set;
  }, [POS_STATIC]);

  const divTTM = portfolioTotals?.totalDivUSD || 0;
  const avgWhtRate = divLog.length > 0 ? divLog.reduce((s,d) => s + (d.gross||0), 0) : 0;
  // Fallback 0.90 (10% China-US treaty) for new positions with no payment history.
  // Previously 0.94 which assumed 6% WHT — wrong for a Chinese fiscal resident on
  // US dividends (Discrepancy Audit #7, 2026-04-08).
  const avgNetRate = avgWhtRate > 0 ? divLog.reduce((s,d) => s + (d.net||0), 0) / avgWhtRate : 0.90;
  const avgWhtPct = avgWhtRate > 0 ? (1 - avgNetRate) * 100 : 0;

  // Per-ticker WHT net rates — computed from historical dividends
  const tickerNetRates = useMemo(() => {
    const byTicker = {};
    divLog.forEach(d => {
      if (!d.ticker || !d.gross) return;
      if (!byTicker[d.ticker]) byTicker[d.ticker] = { gross: 0, net: 0 };
      byTicker[d.ticker].gross += d.gross || 0;
      byTicker[d.ticker].net += d.net || 0;
    });
    const rates = {};
    for (const [t, v] of Object.entries(byTicker)) {
      rates[t] = v.gross > 0 ? v.net / v.gross : avgNetRate;
    }
    return rates;
  }, [divLog, avgNetRate]);

  // Helper: get net rate for a ticker (falls back to global avg)
  const getTickerNetRate = useCallback((ticker) => tickerNetRates[ticker] ?? avgNetRate, [tickerNetRates, avgNetRate]);

  const divTTMnet = divTTM * avgNetRate;
  const currentYear = String(new Date().getFullYear());
  const lastYear = String(new Date().getFullYear() - 1);
  const currentYearEntries = divLog.filter(d => d.date?.startsWith(currentYear));
  const currentYearGross = currentYearEntries.reduce((s,d) => s + (d.gross || 0), 0);
  const currentYearNet = currentYearEntries.reduce((s,d) => s + (d.net || 0), 0);
  const lastYearEntries = divLog.filter(d => d.date?.startsWith(lastYear));
  const lastYearGross = lastYearEntries.reduce((s,d) => s + (d.gross || 0), 0);
  const lastYearNet = lastYearEntries.reduce((s,d) => s + (d.net || 0), 0);
  // YTD comparison: same period last year
  const today = new Date();
  const currentDOY = Math.floor((today - new Date(today.getFullYear(),0,1)) / 86400000);
  const lastYearSamePeriod = lastYearEntries.filter(d => {
    const dt = new Date(d.date);
    return Math.floor((dt - new Date(dt.getFullYear(),0,1)) / 86400000) <= currentDOY;
  });
  const lastYearYTDGross = lastYearSamePeriod.reduce((s,d) => s + (d.gross || 0), 0);
  const timeUnits = [
    {u:"a\u00f1o",div:1,d:0},{u:"mes",div:12,d:0},{u:"d\u00eda",div:365,d:2},{u:"hora",div:8760,d:3},{u:"min",div:525600,d:4}
  ];

  return (
<div style={{display:"flex",flexDirection:"column",gap:12}}>
  {/* Proyectado + Cobrado año pasado */}
  <div style={{display:"grid",gridTemplateColumns:divTTM>0&&lastYearGross>0?"1fr 1fr":"1fr",gap:8}}>
  {divTTM > 0 && (
    <div style={{background:"var(--card)",border:"1px solid rgba(200,164,78,.2)",borderRadius:14,padding:"14px 18px"}}>
      <div style={{fontSize:11,fontWeight:600,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5,marginBottom:8}}>PROYECCIÓN ANUAL</div>
      <div style={{display:"grid",gridTemplateColumns:`repeat(${timeUnits.length}, 1fr)`,gap:4}}>
        {timeUnits.map((t,i) => {
          const primary = isNeto ? divTTMnet : divTTM;
          const secondary = isNeto ? divTTM : divTTMnet;
          const pColor = isNeto ? "var(--green)" : "var(--gold)";
          const sColor = isNeto ? "var(--gold)" : "var(--green)";
          return (
          <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"6px 4px",background:i===0?`${pColor}11`:"transparent",borderRadius:8}}>
            <span style={{fontSize:i===0?18:13,fontWeight:800,color:pColor,fontFamily:"var(--fm)"}}>${primary/t.div>=1000?_sf(primary/t.div/1000,1)+"K":_sf(primary/t.div,t.d)}</span>
            <span style={{fontSize:i===0?14:10,fontWeight:600,color:sColor,fontFamily:"var(--fm)",marginTop:1,opacity:.6}}>${secondary/t.div>=1000?_sf(secondary/t.div/1000,1)+"K":_sf(secondary/t.div,t.d)}</span>
            <span style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:1}}>/ {t.u}</span>
          </div>);
        })}
      </div>
    </div>
  )}
  {/* Cobrado año actual YTD */}
  {(currentYearGross > 0 || lastYearGross > 0) && (
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:"14px 18px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:600,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5}}>COBRADO {currentYear} (YTD)</span>
        <span style={{fontSize:10,fontFamily:"var(--fm)"}}>
          <span style={{color:"var(--red)"}}>{currentYearGross>0?_sf((1-currentYearNet/currentYearGross)*100,1):avgWhtPct>0?_sf(avgWhtPct,1):"0"}% WHT</span>
          <span style={{color:"var(--text-tertiary)"}}> · {currentYearEntries.length} cobros</span>
          {lastYearYTDGross>0 && (() => {
            const curr = isNeto ? currentYearNet : currentYearGross;
            const prev = isNeto ? lastYearSamePeriod.reduce((s,d)=>s+(d.net||0),0) : lastYearYTDGross;
            return <span style={{color:curr>=prev?"var(--green)":"var(--red)",marginLeft:6}}>
              {curr>=prev?"+":""}{prev>0?_sf((curr/prev-1)*100,0):"—"}% vs {lastYear}
            </span>;
          })()}
        </span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        <div style={{textAlign:"center",padding:"8px 4px",background:"rgba(200,164,78,.06)",borderRadius:8}}>
          <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>BRUTO</div>
          <div style={{fontSize:20,fontWeight:800,color:"var(--gold)",fontFamily:"var(--fm)"}}>${currentYearGross>=1000?_sf(currentYearGross/1000,1)+"K":_sf(currentYearGross,0)}</div>
        </div>
        <div style={{textAlign:"center",padding:"8px 4px",background:"rgba(48,209,88,.06)",borderRadius:8}}>
          <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>NETO</div>
          <div style={{fontSize:20,fontWeight:800,color:"var(--green)",fontFamily:"var(--fm)"}}>${currentYearNet>=1000?_sf(currentYearNet/1000,1)+"K":_sf(currentYearNet,0)}</div>
        </div>
        <div style={{textAlign:"center",padding:"8px 4px",background:"rgba(255,69,58,.04)",borderRadius:8}}>
          <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>RETENIDO</div>
          <div style={{fontSize:20,fontWeight:800,color:"var(--red)",fontFamily:"var(--fm)"}}>${(currentYearGross-currentYearNet)>=1000?_sf((currentYearGross-currentYearNet)/1000,1)+"K":_sf(currentYearGross-currentYearNet,0)}</div>
        </div>
      </div>
      {lastYearGross > 0 && (
        <div style={{marginTop:8,padding:"6px 10px",background:"var(--subtle-bg)",borderRadius:8,display:"flex",justifyContent:"space-between",fontSize:10,fontFamily:"var(--fm)"}}>
          <span style={{color:"var(--text-tertiary)"}}>{lastYear} total:</span>
          <span><span style={{color:"var(--text-secondary)"}}>B ${fDol(lastYearGross)}</span> · <span style={{color:"var(--green)"}}>N ${fDol(lastYearNet)}</span> · <span style={{color:"var(--red)"}}>{_sf((1-lastYearNet/lastYearGross)*100,1)}% ret</span> · <span style={{color:"var(--text-tertiary)"}}>{lastYearEntries.length} cobros</span></span>
        </div>
      )}
    </div>
  )}
  </div>

  {/* Sub-tab toggle + Bruto/Neto switch */}
  <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
    {[{id:"dashboard",lbl:"📊 Dashboard"},{id:"ranking",lbl:"🏆 Ranking"},{id:"proyeccion",lbl:"🔭 Proyección"},{id:"calendario",lbl:"📅 Calendario"}].map(t=>(
      <button key={t.id} onClick={()=>setSection(t.id)} style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${section===t.id?"var(--gold)":"transparent"}`,background:section===t.id?"var(--gold-dim)":"transparent",color:section===t.id?"var(--gold)":"var(--text-tertiary)",fontSize:11,fontWeight:section===t.id?700:500,cursor:"pointer",fontFamily:"var(--fb)",transition:"all .15s"}}>{t.lbl}</button>
    ))}
    <div style={{marginLeft:"auto"}} />
    <button onClick={()=>{const next=isNeto?"bruto":"neto";setViewMode(next);localStorage.setItem('div_view',next);}}
      style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${isNeto?"rgba(48,209,88,.3)":"rgba(200,164,78,.3)"}`,
        background:isNeto?"rgba(48,209,88,.08)":"rgba(200,164,78,.08)",
        color:isNeto?"var(--green)":"var(--gold)",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)",transition:"all .15s"}}>
      {isNeto?"NETO":"BRUTO"}
    </button>
  </div>

  {/* Proyección Section — Forward 12 months */}
  {section === "proyeccion" && (() => {
    const fwd = FORWARD_DIV || {};
    const annual = fwd.annual_projected || 0;
    const monthlyAvg = fwd.monthly_avg || 0;
    const monthly = fwd.monthly || [];
    const byTicker = fwd.by_ticker || [];
    const growthYoy = fwd.growth_yoy;
    const maxMonth = Math.max(...monthly.map(m => m.amount || 0), 1);

    // Per-ticker net annual total (uses per-ticker WHT rates)
    const annualNet = byTicker.reduce((s, t) => s + t.annual * getTickerNetRate(t.ticker), 0);
    const monthlyAvgNet = annualNet / 12;
    // Per-month net using per-ticker rates from payment breakdown
    const monthlyNets = monthly.map(m => {
      if (m.payments?.length) return m.payments.reduce((s, p) => s + p.amount * getTickerNetRate(p.ticker), 0);
      return m.amount * avgNetRate; // fallback if no payment breakdown
    });

    if (!annual) return <EmptyState icon="🔭" title="Sin datos de proyección" subtitle="Los datos de DPS se están cargando desde FMP." />;

    return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))",gap:10}}>
        {[
          {l:"PROYECCIÓN ANUAL",v:"$"+fDol(isNeto?annualNet:annual),c:isNeto?"var(--green)":"var(--gold)"},
          {l:isNeto?"ANUAL BRUTO":"ANUAL NETO",v:"$"+fDol(isNeto?annual:annualNet),c:isNeto?"var(--gold)":"var(--green)"},
          {l:"MEDIA MENSUAL",v:"$"+fDol(isNeto?monthlyAvgNet:monthlyAvg),c:isNeto?"var(--green)":"var(--gold)"},
          {l:"WHT MEDIO",v:_sf(avgWhtPct,1)+"%",c:"var(--red)"},
          {l:"POSICIONES",v:byTicker.length,c:"var(--text-primary)"},
          {l:"CRECIMIENTO YoY",v:growthYoy!=null?(growthYoy>=0?"+":"")+_sf(growthYoy,1)+"%":"—",c:growthYoy>=0?"var(--green)":"var(--red)"},
        ].map((k,i)=>(
          <div key={i} style={{padding:"12px 16px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:14}}>
            <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.8,fontWeight:600,marginBottom:4}}>{k.l}</div>
            <div style={{fontSize:22,fontWeight:700,color:k.c,fontFamily:"var(--fm)"}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Monthly projection bars — bruto + neto */}
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)"}}>📅 Ingreso Proyectado por Mes</span>
          <span style={{fontSize:9,fontFamily:"var(--fm)",display:"flex",gap:8}}><span style={{color:"var(--gold)"}}>■ bruto</span><span style={{color:"var(--green)"}}>■ neto</span></span>
        </div>
        <div style={{display:"flex",alignItems:"flex-end",gap:4,height:160}}>
          {monthly.map((m,i)=>{
            const h = maxMonth > 0 ? (m.amount / maxMonth * 100) : 0;
            const netAmt = monthlyNets[i] || (m.amount * avgNetRate);
            const hNet = maxMonth > 0 ? (netAmt / maxMonth * 100) : 0;
            const monthLabel = m.month?.slice(5,7);
            const MNAMES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
            const mName = MNAMES[parseInt(monthLabel,10)-1] || monthLabel;
            return (
              <div key={m.month} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%",gap:2}}>
                <div style={{fontSize:8,fontWeight:700,color:"var(--green)",fontFamily:"var(--fm)"}}>${netAmt>=1000?_sf(netAmt/1000,1)+"K":_sf(netAmt,0)}</div>
                <div style={{fontSize:9,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>${m.amount>=1000?_sf(m.amount/1000,1)+"K":_sf(m.amount,0)}</div>
                <div style={{width:"100%",maxWidth:40,position:"relative",height:`${Math.max(h,3)}%`}}>
                  <div style={{position:"absolute",bottom:0,width:"100%",height:"100%",background:"rgba(200,164,78,0.25)",borderRadius:"4px 4px 0 0"}}/>
                  <div style={{position:"absolute",bottom:0,width:"100%",height:`${h>0?hNet/h*100:0}%`,background:"rgba(48,209,88,0.5)",borderRadius:"4px 4px 0 0"}}/>
                </div>
                <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600}}>{mName}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* By ticker table */}
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border)"}}>
          <span style={{fontSize:13,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>💰 Desglose por Ticker · {byTicker.length} posiciones</span>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>
              {["TICKER","DPS","SHARES","FREQ","ANUAL B","ANUAL N","MENSUAL N","%"].map((h,i)=>
                <th key={i} style={{padding:"6px 10px",textAlign:i>0?"right":"left",color:"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",borderBottom:"1px solid var(--border)"}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {byTicker.map((t,i) => {
                const pct = annual > 0 ? (t.annual / annual * 100) : 0;
                const freqLabel = {monthly:"M",quarterly:"Q",semiannual:"S",annual:"A"}[t.frequency] || "Q";
                const tRate = getTickerNetRate(t.ticker);
                const tWht = (1 - tRate) * 100;
                return (
                  <tr key={t.ticker} style={{background:i%2?"var(--row-alt)":"transparent"}}>
                    <td style={{padding:"5px 10px",fontFamily:"var(--fm)",fontWeight:600,color:"var(--text-primary)",borderBottom:"1px solid var(--subtle-bg)"}}>{t.ticker}</td>
                    <td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid var(--subtle-bg)"}}>${_sf(t.dps,2)}</td>
                    <td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid var(--subtle-bg)"}}>{t.shares?.toLocaleString()}</td>
                    <td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid var(--subtle-bg)"}}>{freqLabel}</td>
                    <td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",fontWeight:700,color:"var(--gold)",borderBottom:"1px solid var(--subtle-bg)"}}>${fDol(t.annual)}</td>
                    <td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",fontWeight:700,color:"var(--green)",borderBottom:"1px solid var(--subtle-bg)"}} title={`WHT: ${_sf(tWht,1)}%`}>${fDol(t.annual*tRate)}</td>
                    <td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--green)",borderBottom:"1px solid var(--subtle-bg)"}}>${fDol(t.monthly_avg*tRate)}</td>
                    <td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid var(--subtle-bg)"}}>{_sf(pct,1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>);
  })()}

  {/* Calendario Section */}
  {section === "calendario" && <CalendarioSection divLog={divLog} POS_STATIC={POS_STATIC} ownedTickers={ownedTickers} soloActuales={soloActuales} />}

  {/* Ranking Section — Top Payers */}
  {section === "ranking" && (() => {
    const allDiv = divLog.filter(d => d.date && d.gross);
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth()-12);
    const r12m = allDiv.filter(d => d.date >= cutoff.toISOString().slice(0,10));
    const byTicker = {}; r12m.forEach(d => { const t=d.ticker; if(!t)return; if(!byTicker[t])byTicker[t]={g:0,n:0,c:0}; byTicker[t].g+=d.gross||0; byTicker[t].n+=d.net||0; byTicker[t].c++; });
    const topAll = Object.entries(byTicker).sort((a,b)=>b[1].g-a[1].g);
    const maxG = topAll.length>0?topAll[0][1].g:1;
    const totalG = r12m.reduce((s,d)=>s+(d.gross||0),0);
    // By country
    const byCountry = {};
    r12m.forEach(d => { const cc = getCountry?.(d.ticker, d.currency)||"US"; if(!byCountry[cc])byCountry[cc]={g:0,n:0,c:0,fl:FLAGS?.[cc]||""}; byCountry[cc].g+=d.gross||0; byCountry[cc].n+=d.net||0; byCountry[cc].c++; });
    const countryRank = Object.entries(byCountry).sort((a,b)=>b[1].g-a[1].g);
    return <>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:14}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
            <span style={{fontSize:12,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)"}}>Top Payers (12m)</span>
            <span style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Total: <b style={{color:"var(--gold)"}}>${fDol(totalG)}</b></span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:3}}>
            {topAll.slice(0,25).map(([t,d],i)=>{
              const pct = maxG > 0 ? (d.g/maxG*100) : 0;
              const cc = getCountry?.(t)||"US";
              const fl = FLAGS?.[cc]||"";
              return <div key={t} style={{display:"flex",alignItems:"center",gap:6,height:20}}>
                <span style={{width:14,fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right"}}>{i+1}</span>
                <span style={{fontSize:11}}>{fl}</span>
                <span style={{width:48,fontSize:9,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)",overflow:"hidden",textOverflow:"ellipsis"}}>{t}</span>
                <div style={{flex:1,height:10,background:"var(--subtle-bg)",borderRadius:3,overflow:"hidden"}}>
                  <div style={{width:`${pct}%`,height:"100%",background:"linear-gradient(90deg,var(--gold),rgba(200,164,78,.2))",borderRadius:3}}/>
                </div>
                <span style={{width:55,fontSize:10,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",textAlign:"right"}}>${d.g>=1000?_sf(d.g/1000,1)+"K":_sf(d.g,0)}</span>
                <span style={{width:20,fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right"}}>{d.c}</span>
              </div>;
            })}
          </div>
        </div>
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:14}}>
          <div style={{fontSize:12,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:10}}>Por País (12m)</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {countryRank.map(([cc,d])=>{
              const pct = totalG>0?(d.g/totalG*100):0;
              const whtPct = d.g>0?((d.g-d.n)/d.g*100):0;
              return <div key={cc} style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:16}}>{d.fl}</span>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:10,fontFamily:"var(--fm)",marginBottom:2}}>
                    <span style={{fontWeight:600,color:"var(--text-primary)"}}>{cc} · {d.c} cobros</span>
                    <span><b style={{color:"var(--text-primary)"}}>${fDol(d.g)}</b> <span style={{color:"var(--text-tertiary)"}}>({_sf(pct,1)}%)</span></span>
                  </div>
                  <div style={{height:6,background:"var(--subtle-bg)",borderRadius:3,overflow:"hidden"}}>
                    <div style={{width:`${pct}%`,height:"100%",background:"var(--gold)",borderRadius:3}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:9,fontFamily:"var(--fm)",marginTop:2,color:"var(--text-tertiary)"}}>
                    <span>Neto: <b style={{color:"var(--green)"}}>${fDol(d.n)}</b></span>
                    <span>Ret: <b style={{color:"var(--red)"}}>{_sf(whtPct,1)}%</b></span>
                  </div>
                </div>
              </div>;
            })}
          </div>
        </div>
      </div>
    </>;
  })()}

  {/* Dashboard Section — Redesigned */}
  {section === "dashboard" && (() => {
    if (divLoading) return <InlineLoading message="Cargando dividendos..." />;
    if (divLog.length === 0) return <EmptyState icon="💰" title="Sin datos de dividendos" subtitle="Sincroniza con IB o espera a que se importen los datos." />;
    const filtered = divLog.filter(d => {
      if (divFilter.year !== "all" && !d.date?.startsWith(divFilter.year)) return false;
      if (divFilter.month && divFilter.month !== "all" && !d.date?.startsWith(divFilter.month)) return false;
      if (divFilter.ticker && !d.ticker?.toUpperCase().includes(divFilter.ticker.toUpperCase())) return false;
      return true;
    });
    const all = divLog.filter(d => d.date && d.gross);
    const byYear = {}; all.forEach(d => { const y=d.date.slice(0,4); if(!byYear[y])byYear[y]={g:0,n:0,c:0}; byYear[y].g+=d.gross||0; byYear[y].n+=d.net||0; byYear[y].c++; });
    const yearKeys = Object.keys(byYear).sort();
    const maxYearG = Math.max(...yearKeys.map(y=>byYear[y].g),1);
    const byMonth = {}; all.forEach(d => { const m=d.date.slice(0,7); if(!byMonth[m])byMonth[m]={g:0,n:0,c:0}; byMonth[m].g+=d.gross||0; byMonth[m].n+=d.net||0; byMonth[m].c++; });
    const monthKeys = Object.keys(byMonth).sort().slice(-36);
    const maxMonthG = Math.max(...monthKeys.map(m=>byMonth[m].g),1);
    // Use canonical FIRE target from useFireMetrics (real expenses, not hardcoded $3500)
    // Falls back to 3500/mo only if expense data isn't loaded yet
    const fireTarget = fire.monthlyDivNeeded > 0 ? fire.monthlyDivNeeded : 3500;
    const last12m = all.filter(d => { const c=new Date(); c.setMonth(c.getMonth()-12); return d.date>=c.toISOString().slice(0,10); });
    const gross12m = last12m.reduce((s,d)=>s+(d.gross||0),0);
    const net12m = last12m.reduce((s,d)=>s+(d.net||0),0);
    const tax12m = gross12m - net12m;
    const taxRate12m = gross12m > 0 ? (tax12m / gross12m * 100) : 0;
    const avgNetMonth = net12m/12;
    const firePct = Math.min(fire.coveragePct, 100);
    const byCalMonth = {}; all.forEach(d => { const k=d.date.slice(0,4)+"-"+d.date.slice(5,7); if(!byCalMonth[k])byCalMonth[k]={g:0,n:0}; byCalMonth[k].g+=d.gross||0; byCalMonth[k].n+=d.net||0; });
    const twelveMonthsAgo = new Date(); twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth()-12);
    const cutoff12m = twelveMonthsAgo.toISOString().slice(0,10);
    const recent12m = all.filter(d=>d.date>=cutoff12m);
    const byTicker12 = {}; recent12m.forEach(d => { const t=d.ticker; if(!t)return; if(!byTicker12[t])byTicker12[t]={g:0,n:0,c:0}; byTicker12[t].g+=d.gross||0; byTicker12[t].n+=d.net||0; byTicker12[t].c++; });
    const topPayers = Object.entries(byTicker12).sort((a,b)=>b[1].g-a[1].g).slice(0,25);
    const maxTickerG = topPayers.length>0?topPayers[0][1].g:1;
    const yocData = Object.entries(byTicker12).map(([t,d])=>{ const pos=POS_STATIC[t]; if(!pos||!pos.cb||!pos.sh)return null; const tc=pos.cb*pos.sh; const yoc=tc>0?(d.g/tc*100):0; const cy=pos.lp>0&&pos.sh>0?(d.g/(pos.lp*pos.sh)*100):0; return {t,g12:d.g,cost:tc,yoc,cy,sh:pos.sh,cb:pos.cb,lp:pos.lp}; }).filter(Boolean).filter(d=>d.yoc>0).sort((a,b)=>b.yoc-a.yoc);
    const tickerDates = {}; all.forEach(d=>{ const t=d.ticker; if(!t)return; if(!tickerDates[t])tickerDates[t]=[]; tickerDates[t].push(d.date); });
    const freqData = Object.entries(tickerDates).map(([t,dates])=>{ dates.sort(); if(dates.length<2)return null; const gaps=[]; for(let i=1;i<dates.length;i++){const d1=new Date(dates[i-1]),d2=new Date(dates[i]); gaps.push((d2-d1)/(864e5));} const avg=gaps.reduce((s,g)=>s+g,0)/gaps.length; let freq=avg<=35?"Mensual":avg<=65?"Bimensual":avg<=100?"Trimestral":avg<=200?"Semestral":"Anual"; const last=dates[dates.length-1]; const next=new Date(last); next.setDate(next.getDate()+Math.round(avg)); return {t,freq,avg:Math.round(avg),next:next.toISOString().slice(0,10),last,count:dates.length}; }).filter(d=>d&&byTicker12[d.t]).sort((a,b)=>a.next.localeCompare(b.next));
    const curYear = divFilter.year!=="all"?divFilter.year:new Date().getFullYear().toString();
    const prevYear = String(parseInt(curYear, 10)-1);
    const tickerByYear = {}; all.forEach(d=>{ const y=d.date.slice(0,4),t=d.ticker; if(!t)return; if(!tickerByYear[t])tickerByYear[t]={}; if(!tickerByYear[t][y])tickerByYear[t][y]=0; tickerByYear[t][y]+=d.gross||0; });
    const growthData = Object.entries(tickerByYear).map(([t,years])=>{ const cur=years[curYear]||0,prev=years[prevYear]||0; const g=prev>0?((cur-prev)/prev*100):(cur>0?999:0); return {t,cur,prev,g}; }).filter(d=>d.cur>0||d.prev>0).sort((a,b)=>b.cur-a.cur);
    const availMonths = divFilter.year!=="all"?[...new Set(divLog.filter(d=>d.date?.startsWith(divFilter.year)).map(d=>d.date?.slice(0,7)).filter(Boolean))].sort().reverse():[];
    const rc = v=>v>0?"var(--green)":v<0?"var(--red)":"var(--text-secondary)";
    const mNames=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    return <>
      {/* ── Row 1: KPIs compactos ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(100px, 1fr))",gap:6}}>
        {[
          {l:isNeto?"NETO TTM":"BRUTO TTM",v:"$"+fDol(isNeto?net12m:gross12m),c:isNeto?"var(--green)":"var(--gold)"},
          {l:isNeto?"BRUTO TTM":"NETO TTM",v:"$"+fDol(isNeto?gross12m:net12m),c:isNeto?"var(--gold)":"var(--green)"},
          {l:"WHT",v:_sf(taxRate12m,0)+"%",c:"var(--red)"},
          {l:isNeto?"NETO/MES":"BRUTO/MES",v:"$"+fDol(isNeto?avgNetMonth:gross12m/12),c:(isNeto?avgNetMonth:gross12m/12)>=fireTarget?"var(--green)":"var(--orange)"},
          {l:"COBROS TTM",v:last12m.length,c:"var(--text-primary)"},
          {l:"FIRE",v:_sf(firePct,0)+"%",c:firePct>=100?"var(--green)":"var(--orange)"},
        ].map((k,i)=>(
          <div key={i} style={{padding:"8px 10px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10}}>
            <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5,fontWeight:600}}>{k.l}</div>
            <div style={{fontSize:15,fontWeight:700,color:k.c,fontFamily:"var(--fm)",marginTop:1}}>{k.v}</div>
          </div>))}
      </div>

      {/* ── Row 2: Año × Mes heatmap (como Patrimonio) ── */}
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:14}}>
        <div style={{fontSize:12,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:8}}>Dividendos Año × Mes</div>
        {(() => {
          const grid = {};
          all.forEach(d => { const y=d.date?.slice(0,4),m=d.date?.slice(5,7); if(!y||!m)return; if(!grid[y])grid[y]={}; if(!grid[y][m])grid[y][m]={g:0,n:0}; grid[y][m].g+=d.gross||0; grid[y][m].n+=d.net||0; });
          const gYears = Object.keys(grid).sort().reverse();
          const gn = isNeto ? "n" : "g";
          const allVals = gYears.flatMap(y => Object.values(grid[y]).map(v=>v[gn]));
          const maxV = Math.max(...allVals, 1);
          // Annual totals
          const annTotals = {};
          gYears.forEach(y => { annTotals[y] = Object.values(grid[y]).reduce((s,v)=>s+v[gn],0); });
          const thS = {padding:"4px 5px",fontSize:9,fontWeight:600,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"center",borderBottom:"1px solid var(--border)"};
          return (
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
                <thead><tr>
                  <th style={{...thS,textAlign:"left",width:40}}>AÑO</th>
                  {mNames.map(m => <th key={m} style={thS}>{m}</th>)}
                  <th style={{...thS,borderLeft:"2px solid var(--border)",width:70}}>TOTAL</th>
                </tr></thead>
                <tbody>
                  {gYears.map((y,yi) => {
                    const prevY = gYears[yi+1];
                    const yoyPct = prevY && annTotals[prevY] > 0 ? ((annTotals[y] - annTotals[prevY]) / annTotals[prevY] * 100) : null;
                    return (
                    <tr key={y}>
                      <td style={{padding:"3px 5px",fontSize:11,fontWeight:700,color:yi===0?"var(--gold)":"var(--text-secondary)",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>{y}</td>
                      {["01","02","03","04","05","06","07","08","09","10","11","12"].map(m => {
                        const v = grid[y]?.[m]?.[gn] || 0;
                        if (!v) return <td key={m} style={{padding:"2px",textAlign:"center",borderBottom:"1px solid var(--subtle-bg)"}}><span style={{fontSize:8,color:"var(--text-tertiary)",opacity:.2}}>—</span></td>;
                        const intensity = Math.min(v / maxV, 1);
                        const bg = `rgba(200,164,78,${0.08 + intensity * 0.5})`;
                        return (
                          <td key={m} style={{padding:"2px",textAlign:"center",borderBottom:"1px solid var(--subtle-bg)"}}>
                            <div title={`${y}-${m}: $${_sf(v,0)}`} style={{borderRadius:4,background:bg,padding:"4px 1px",fontSize:9,fontWeight:700,color:intensity>.5?"var(--gold)":"var(--text-secondary)",fontFamily:"var(--fm)"}}>
                              {v>=1000?_sf(v/1000,1)+"K":_sf(v,0)}
                            </div>
                          </td>);
                      })}
                      <td style={{padding:"2px 4px",textAlign:"center",borderBottom:"1px solid var(--subtle-bg)",borderLeft:"2px solid var(--border)"}}>
                        <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                          <span style={{fontSize:11,fontWeight:800,color:yi===0?"var(--gold)":"var(--text-primary)",fontFamily:"var(--fm)"}}>${annTotals[y]>=1000?_sf(annTotals[y]/1000,1)+"K":_sf(annTotals[y],0)}</span>
                          {yoyPct!=null && <span style={{fontSize:8,fontWeight:600,color:yoyPct>=0?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>{yoyPct>=0?"+":""}{_sf(yoyPct,0)}%</span>}
                        </div>
                      </td>
                    </tr>);
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>

      {/* ── Row 3: Cobrado vs Esperado ── */}
      {FORWARD_DIV?.by_ticker?.length > 0 && (
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:14}}>
        <div style={{fontSize:12,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:8}}>Cobrado vs Esperado</div>
        {(() => {
          const fwd = FORWARD_DIV;
          const ttmGross = last12m.reduce((s,d)=>s+(d.gross||0),0);
          const fwdByTicker = {};
          (fwd.by_ticker||[]).forEach(t => { fwdByTicker[t.ticker] = t.annual; });
          const comparison = Object.keys(fwdByTicker).map(t => {
            const expected = fwdByTicker[t] || 0;
            const received = byTicker12[t]?.g || 0;
            return { t, expected, received, pct: expected > 0 ? (received/expected*100) : (received > 0 ? 999 : 0) };
          }).filter(c => c.expected > 0 || c.received > 0).sort((a,b) => a.pct - b.pct);
          const missing = comparison.filter(c => c.received === 0 && c.expected > 50);
          const onTrack = comparison.filter(c => c.pct >= 80);
          const coveragePct = fwd.annual_projected > 0 ? (ttmGross / fwd.annual_projected * 100) : 0;
          return <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:11,fontFamily:"var(--fm)"}}>
              <span>Cobrado: <b style={{color:"var(--green)"}}>${fDol(ttmGross)}</b></span>
              <span>Esperado: <b style={{color:"var(--gold)"}}>${fDol(fwd.annual_projected||0)}</b></span>
              <span>Cobertura: <b style={{color:coveragePct>=80?"var(--green)":"var(--orange)"}}>{_sf(coveragePct,0)}%</b></span>
              <span style={{color:"var(--green)"}}>{onTrack.length} on track</span>
            </div>
            {missing.length > 0 && (
              <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                {missing.slice(0,15).map(c=>(
                  <span key={c.t} style={{padding:"2px 6px",borderRadius:4,background:"rgba(255,159,10,.06)",border:"1px solid rgba(255,159,10,.12)",fontSize:8,fontFamily:"var(--fm)",color:"var(--orange)"}}>{c.t} ${fDol(c.expected)}</span>
                ))}
              </div>
            )}
          </div>;
        })()}
      </div>)}

      {/* ── Row 4: Top Payers + Filters + Form en una línea ── */}
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        <select value={divFilter.year} onChange={e=>setDivFilter(p=>({...p,year:e.target.value,month:"all"}))} style={{padding:"5px 8px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:10,fontFamily:"var(--fm)"}}>
          <option value="all">Todos los años</option>
          {[...new Set(divLog.map(d=>d.date?.slice(0,4)).filter(Boolean))].sort().reverse().map(y=><option key={y} value={y}>{y}</option>)}
        </select>
        {divFilter.year !== "all" && <select value={divFilter.month||"all"} onChange={e=>setDivFilter(p=>({...p,month:e.target.value}))} style={{padding:"5px 8px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:10,fontFamily:"var(--fm)"}}>
          <option value="all">Todos los meses</option>
          {["01","02","03","04","05","06","07","08","09","10","11","12"].map(m=><option key={m} value={divFilter.year+"-"+m}>{["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][parseInt(m)-1]}</option>)}
        </select>}
        <input type="text" placeholder="Ticker..." value={divFilter.ticker} onChange={e=>setDivFilter(p=>({...p,ticker:e.target.value}))} style={{width:80,padding:"5px 8px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:10,fontFamily:"var(--fm)"}}/>
        <button onClick={()=>setDivShowForm(!divShowForm)} style={{padding:"5px 12px",borderRadius:6,border:"1px solid var(--gold)",background:divShowForm?"var(--gold)":"var(--gold-dim)",color:divShowForm?"#000":"var(--gold)",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>{divShowForm?"✕":"+ Div"}</button>
      </div>
      {divShowForm&&(<div style={{padding:12,background:"var(--card)",border:"1px solid var(--gold-dim)",borderRadius:10}}><div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"flex-end"}}>
        <div><label style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:2}}>FECHA</label><input type="date" value={divForm.date} onChange={e=>setDivForm(p=>({...p,date:e.target.value}))} style={{padding:"5px 6px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:5,color:"var(--text-primary)",fontSize:10,fontFamily:"var(--fm)"}}/></div>
        <div><label style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:2}}>TICKER</label><input type="text" value={divForm.ticker} onChange={e=>setDivForm(p=>({...p,ticker:e.target.value.toUpperCase()}))} placeholder="DEO" style={{width:55,padding:"5px 6px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:5,color:"var(--text-primary)",fontSize:10,fontFamily:"var(--fm)"}}/></div>
        <div><label style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:2}}>GROSS</label><input type="number" step="0.01" value={divForm.gross||""} onChange={e=>{const g=parseFloat(e.target.value)||0;setDivForm(p=>({...p,gross:g,net:g*(1-p.taxPct/100)}));}} style={{width:65,padding:"5px 6px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:5,color:"var(--text-primary)",fontSize:10,fontFamily:"var(--fm)"}}/></div>
        <div><label style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:2}}>TAX%</label><input type="number" value={divForm.taxPct||""} onChange={e=>{const t=parseFloat(e.target.value)||0;setDivForm(p=>({...p,taxPct:t,net:p.gross*(1-t/100)}));}} style={{width:40,padding:"5px 6px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:5,color:"var(--text-primary)",fontSize:10,fontFamily:"var(--fm)"}}/></div>
        <button onClick={()=>{if(divForm.date&&divForm.ticker&&divForm.gross){addDivEntry(divForm);setDivForm(p=>({...p,ticker:"",gross:0,net:0,shares:0}));}}} style={{padding:"5px 14px",borderRadius:5,border:"none",background:"var(--gold)",color:"#000",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)"}}>Guardar</button>
      </div></div>)}

      {/* ── Row 5: Cobros table (sortable) ── */}
      {(() => {
        const cols = [
          {k:"date",l:"FECHA",a:"left"},{k:"country",l:"",a:"center"},{k:"ticker",l:"TICKER",a:"left"},
          {k:"gross",l:"BRUTO",a:"right"},{k:"tax",l:"RET%",a:"right"},
          {k:"wht",l:"RETENCIÓN",a:"right"},{k:"net",l:"NETO",a:"right"},
          {k:"shares",l:"ACCIONES",a:"right"},{k:"dps",l:"DPS",a:"right"},
        ];
        // Country filter
        const countrySet = {};
        filtered.forEach(d => { const cc = getCountry?.(d.ticker, d.currency) || "US"; const fl = FLAGS?.[cc] || ""; if (fl) countrySet[cc] = fl; });
        const countryFilter = divFilter.country || "all";
        const sk = divSort.col, sa = divSort.asc;
        const countryFiltered = countryFilter === "all" ? filtered : filtered.filter(d => (getCountry?.(d.ticker, d.currency) || "US") === countryFilter);
        const sorted = [...countryFiltered].sort((a,b) => {
          let va, vb;
          if (sk==="date") { va=a.date||""; vb=b.date||""; }
          else if (sk==="ticker") { va=a.ticker||""; vb=b.ticker||""; }
          else if (sk==="country") { va=getCountry?.(a.ticker,a.currency)||""; vb=getCountry?.(b.ticker,b.currency)||""; }
          else if (sk==="gross") { va=a.gross||0; vb=b.gross||0; }
          else if (sk==="net") { va=a.net||0; vb=b.net||0; }
          else if (sk==="tax") { va=a.taxPct||0; vb=b.taxPct||0; }
          else if (sk==="shares") { va=a.shares||0; vb=b.shares||0; }
          else if (sk==="dps") { va=a.dpsGross||(a.shares&&a.gross?a.gross/a.shares:0); vb=b.dpsGross||(b.shares&&b.gross?b.gross/b.shares:0); }
          else if (sk==="wht") { va=a.whtAmount||0; vb=b.whtAmount||0; }
          else { va=a.date||""; vb=b.date||""; }
          if (typeof va==="string") return sa?va.localeCompare(vb):vb.localeCompare(va);
          return sa?va-vb:vb-va;
        });
        const ts = k => { if(!k)return; setDivSort(p=>p.col===k?{col:k,asc:!p.asc}:{col:k,asc:false}); };
        const ar = k => divSort.col===k?(divSort.asc?" ▲":" ▼"):"";
        const td0 = {padding:"4px 6px",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)",fontSize:10};
        return (
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden"}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:6}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:12,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>Cobros · {sorted.length}</span>
              <span style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>
                Bruto <b style={{color:"var(--text-primary)"}}>${fDol(sorted.reduce((s,d)=>s+(d.gross||0),0))}</b>
                {" · "}Neto <b style={{color:"var(--green)"}}>${fDol(sorted.reduce((s,d)=>s+(d.net||0),0))}</b>
                {" · "}Ret <b style={{color:"var(--red)"}}>${fDol(sorted.reduce((s,d)=>s+((d.whtAmount||0)>0?d.whtAmount:(d.gross||0)-(d.net||0)),0))}</b>
              </span>
            </div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
              <button onClick={()=>setDivFilter(p=>({...p,country:"all"}))} style={{padding:"3px 8px",borderRadius:5,border:`1px solid ${countryFilter==="all"?"var(--gold)":"var(--border)"}`,background:countryFilter==="all"?"var(--gold-dim)":"transparent",color:countryFilter==="all"?"var(--gold)":"var(--text-tertiary)",fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>Todos</button>
              {Object.entries(countrySet).sort((a,b)=>{
                const ca = filtered.filter(d=>(getCountry?.(d.ticker,d.currency)||"US")===a[0]).reduce((s,d)=>s+(d.gross||0),0);
                const cb = filtered.filter(d=>(getCountry?.(d.ticker,d.currency)||"US")===b[0]).reduce((s,d)=>s+(d.gross||0),0);
                return cb-ca;
              }).map(([cc,fl])=>{
                const cnt = filtered.filter(d=>(getCountry?.(d.ticker,d.currency)||"US")===cc).length;
                return <button key={cc} onClick={()=>setDivFilter(p=>({...p,country:p.country===cc?"all":cc}))} style={{padding:"3px 8px",borderRadius:5,border:`1px solid ${countryFilter===cc?"var(--gold)":"var(--border)"}`,background:countryFilter===cc?"var(--gold-dim)":"transparent",color:countryFilter===cc?"var(--gold)":"var(--text-tertiary)",fontSize:10,cursor:"pointer",fontFamily:"var(--fm)"}}>{fl} {cnt}</button>;
              })}
            </div>
          </div>
          <div style={{overflowX:"auto",maxHeight:500}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:10,minWidth:700}}>
              <thead><tr>{cols.map((c,i)=>
                <th key={i} onClick={()=>ts(c.k)} style={{padding:"5px 6px",textAlign:c.a,color:divSort.col===c.k?"var(--gold)":"var(--text-tertiary)",fontSize:8,fontWeight:600,fontFamily:"var(--fm)",borderBottom:"1px solid var(--border)",cursor:c.k?"pointer":"default",userSelect:"none",position:"sticky",top:0,background:"var(--bg)",whiteSpace:"nowrap",zIndex:1}}>{c.l}{ar(c.k)}</th>
              )}</tr></thead>
              <tbody>{sorted.slice(0,500).map((d,i) => {
                const dps = d.dpsGross || (d.shares && d.gross ? d.gross/d.shares : 0);
                const wht = d.whtAmount || (d.gross && d.net ? d.gross - d.net : 0);
                const cc = getCountry?.(d.ticker, d.currency) || "US";
                const flag = FLAGS?.[cc] || "";
                return (
                <tr key={d.id||i} style={{background:i%2?"var(--row-alt)":"transparent"}}>
                  <td style={{...td0,color:"var(--text-primary)"}}>{d.date}</td>
                  <td style={{...td0,textAlign:"center",fontSize:12}}>{flag}</td>
                  <td style={{...td0,fontWeight:600,color:"var(--gold)"}}>{d.ticker}</td>
                  <td style={{...td0,textAlign:"right",fontWeight:600,color:"var(--text-primary)"}}>${_sf(d.gross||0,2)}</td>
                  <td style={{...td0,textAlign:"right",color:d.taxPct>0?"var(--red)":"var(--text-tertiary)"}}>{d.taxPct>0?d.taxPct+"%":"0%"}</td>
                  <td style={{...td0,textAlign:"right",color:"var(--red)",opacity:.7}}>{wht>0.01?"-$"+_sf(wht,2):"—"}</td>
                  <td style={{...td0,textAlign:"right",fontWeight:600,color:"var(--green)"}}>${_sf(d.net||0,2)}</td>
                  <td style={{...td0,textAlign:"right",color:"var(--text-secondary)"}}>{d.shares||""}</td>
                  <td style={{...td0,textAlign:"right",color:"var(--gold)"}}>{dps>0?"$"+_sf(dps,3):""}</td>
                </tr>);
              })}</tbody>
            </table>
          </div>
        </div>);
      })()}
    </>;
  })()}
</div>
  );
}
