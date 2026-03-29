export async function generateReport(ticker, fin, cfg, profile) {
  const years = Object.keys(fin).sort().reverse();
  const latestYear = years[0];
  const d = fin[latestYear] || {};

  const summary = years.slice(0, 10).map(y => {
    const f = fin[y];
    return `${y}: Rev=${f.revenue?.toFixed(0)}M, NI=${f.netIncome?.toFixed(0)}M, EPS=${f.eps?.toFixed(2)}, DPS=${f.dps?.toFixed(2)}, FCF=${(f.ocf-f.capex)?.toFixed(0)}M, Debt=${f.totalDebt?.toFixed(0)}M, Cash=${f.cash?.toFixed(0)}M`;
  }).join("\n");

  const prompt = `You are a senior dividend equity analyst. Analyze ${cfg.name} (${ticker}) for a long-term dividend growth investor.

FINANCIAL DATA (10 years, in millions USD except per-share):
${summary}

PROFILE: Sector: ${profile?.sector||"?"}, Industry: ${profile?.industry||"?"}, Market Cap: $${((profile?.mktCap||0)/1e9).toFixed(1)}B, Employees: ${profile?.fullTimeEmployees||"?"}, Country: ${profile?.country||"?"}

Current price: $${cfg.price}, Beta: ${cfg.beta}, Dividend Yield: ${d.dps && cfg.price ? (d.dps/cfg.price*100).toFixed(2) : "?"}%

Provide your analysis in this exact JSON format (no markdown, no backticks, pure JSON):
{
  "moat": {"rating": "Wide|Narrow|None", "score": 8, "explanation": "2-3 sentences on competitive advantages"},
  "dividendSafety": {"score": 75, "payoutFCF": 45, "payoutEarnings": 55, "streak": 15, "growthCAGR5y": 6.2, "assessment": "2-3 sentences"},
  "financialHealth": {"score": 70, "debtToEBITDA": 2.1, "interestCoverage": 8.5, "currentRatio": 1.2, "assessment": "2-3 sentences"},
  "growth": {"revenueCAGR5y": 5.1, "epsCAGR5y": 7.2, "fcfTrend": "Growing|Stable|Volatile|Declining", "assessment": "2-3 sentences"},
  "valuation": {"fairValue": 120, "method": "DCF/Earnings/FCF", "upside": 15, "assessment": "2 sentences"},
  "aiDisruption": {"riskLevel": "Low|Medium|High|Critical", "score": 25, "threats": ["Threat 1"], "defenses": ["Defense 1"], "assessment": "2-3 sentences"},
  "risks": ["Risk 1", "Risk 2", "Risk 3"],
  "catalysts": ["Catalyst 1", "Catalyst 2"],
  "verdict": {"action": "CORE HOLD|ADD|HOLD|REVIEW|SELL", "targetWeight": "3-5%", "summary": "3-4 sentence investment thesis"},
  "overallScore": 72
}`;

  try {
    const response = await fetch("https://aar-api.garciaontoso.workers.dev/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`Claude API error ${response.status}`);
    const data = await response.json();
    const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "";
    const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      return JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
    }
    throw new Error("No JSON in response");
  } catch(e) {
    console.error("Report generation error:", e);
    return null;
  }
}
