// useFreshness — fetches /api/data-status once per session and exposes
// a helper to compute TrustBadge level from a data-source name.
//
// Returns: { freshness, getLevel }
//   freshness: raw /api/data-status response object (or null)
//   getLevel(source, overrideDate): "verified"|"fresh"|"stale"|"unverified"
//
// Source names map to the keys in /api/data-status:
//   "positions", "dividendos", "nlv", "trades", "prices"
//
// "prices" is special — if IB live prices are loaded we treat it as fresh.

import { useState, useEffect, useCallback } from "react";
import { API_URL } from "../constants/index.js";

const SESSION_KEY = "ayr_data_freshness_v1";
const TTL_MS = 10 * 60 * 1000; // re-fetch every 10 min

function ageLevel(dateStr) {
  if (!dateStr || dateStr === "—") return "unverified";
  // dateStr may be "2026-04-17" or a full ISO timestamp
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "unverified";
  const diffMs = Date.now() - d.getTime();
  const diffH = diffMs / 3_600_000;
  if (diffH < 24) return "fresh";
  if (diffH < 24 * 7) return "stale";
  return "unverified";
}

export function useFreshness() {
  const [freshness, setFreshness] = useState(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.ts && Date.now() - parsed.ts < TTL_MS) {
          return parsed.data || null;
        }
      }
    } catch {}
    return null;
  });

  useEffect(() => {
    // Don't re-fetch if we already have a fresh copy
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.ts && Date.now() - parsed.ts < TTL_MS) return;
      }
    } catch {}

    fetch(`${API_URL}/api/data-status`)
      .then(r => r.json())
      .then(d => {
        setFreshness(d);
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ts: Date.now(), data: d })); } catch {}
      })
      .catch(() => {});
  }, []);

  // SOURCE_MAP: logical source name → key in freshness object + label
  const SOURCE_MAP = {
    positions:  { key: "positions",  label: "D1 positions (IB Flex sync)" },
    dividendos: { key: "dividendos", label: "D1 dividendos (IB Flex sync)" },
    nlv:        { key: "nlv",        label: "D1 nlv_history (IB daily)" },
    trades:     { key: "trades",     label: "D1 cost_basis (IB Flex sync)" },
    prices:     { key: "positions",  label: "Yahoo Finance (live 10s refresh)" },
    patrimonio: { key: "patrimonio", label: "D1 patrimonio (manual)" },
    scores:     { key: "positions",  label: "FMP /key-metrics via D1 cache (24h TTL)" },
  };

  const getLevel = useCallback((source, overrideDate) => {
    if (overrideDate) return ageLevel(overrideDate);
    if (!freshness) return "unverified";
    const mapping = SOURCE_MAP[source];
    if (!mapping) return "unverified";
    const entry = freshness[mapping.key];
    return ageLevel(entry?.lastUpdate);
  }, [freshness]); // SOURCE_MAP is constant — no dep needed

  const getSource = useCallback((source) => {
    return SOURCE_MAP[source]?.label || source;
  }, []);

  const getUpdatedAt = useCallback((source) => {
    if (!freshness) return "";
    const mapping = SOURCE_MAP[source];
    if (!mapping) return "";
    return freshness[mapping.key]?.lastUpdate || "";
  }, [freshness]);

  return { freshness, getLevel, getSource, getUpdatedAt };
}

export default useFreshness;
