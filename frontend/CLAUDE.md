# A&R v10.2 — Dividend Equity Analysis

## Deploy commands
- Frontend: `cd frontend && npm run build && npx wrangler pages deploy dist --project-name=ayr`
- Worker: `cd api && npx wrangler deploy`
- ALWAYS deploy both if worker.js changed (CORS, endpoints, etc.)

## URLs
- **Production**: https://ayr.onto-so.com (custom domain → Cloudflare Pages)
- **Pages preview**: https://ayr-196.pages.dev
- **API**: https://api.onto-so.com (custom domain — replaces aar-api.garciaontoso.workers.dev which uses blocked CF IPs 188.114.96.x)
- FMP API Key: stored as Cloudflare Worker secret (env.FMP_KEY)

## CORS
- Worker accepts: `*.pages.dev`, `ayr.onto-so.com`, `localhost:*`
- NO need to update CORS for new deploys — it's pattern-based

## D1 Database
- Name: aar-finanzas (d9dc97c1-1ea5-4e05-b637-89e52229d099)

## Architecture (after refactoring)
```
frontend/src/
  App.jsx              (2,512 lines — state, context providers, layout)
  constants/index.js   (TABS, CURRENCIES, API_URL, DEFAULT_FX)
  utils/               (formatters, currency, ratings, storage)
  calculators/         (wacc, piotroski, altmanZ, growthRate, dividendAnalysis)
  api/
    fmp.js             (fetchViaFMP — proxied through worker)
    claude.js           (generateReport — proxied through worker)
    data.js            (fetchAllData — returns data object, stored in React state)
  context/             (AnalysisContext, HomeContext, CostBasisContext)
  components/
    ui/                (Badge, BarChart, Card, DonutChart, etc.)
    analysis/          (18 tabs: DashTab, QualityTab, ValuationTab, etc.)
    home/              (14 tabs: PortfolioTab, ScreenerTab, FireTab, etc.)
    views/             (HomeView, CostBasisView)
```

## Key patterns
- **Data flow**: fetchAllData() returns object → stored in `apiData` state → passed through HomeContext to components. Components NEVER import from api/data.js directly.
- **Code splitting**: React.lazy() for all tabs. Initial bundle ~337KB. Each tab loads on demand.
- **Context**: 3 contexts (Analysis, Home, CostBasis) pass state from App.jsx to extracted components.
- Dark theme, gold accent (#c8a44e — unified 2026-04-08, formerly #d69e2e)
- Spanish UI, English technical terms
- Financial data in millions (M = v/1e6)
- POS_STATIC has mc (billions), cat (COMPANY/REIT/ETF), tg (strategy)
- FMP Premium plan ($69/mo), 19 endpoints per company
- Claude API proxied through worker /api/claude
