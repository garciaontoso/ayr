# A&R Frontend — Performance Budgets

Semana 11 del roadmap profesionalización (`docs/ROADMAP-PRO.md`). Mide
y bloquea regresiones de bundle size + Lighthouse en CI.

## Cómo correr local

### Bundle size budget
```bash
cd frontend
npm run build       # genera dist/
npm run size        # check budget
```

`size-limit` mide los chunks principales y compara contra los límites
declarados en `package.json` (`"size-limit"` array). Por defecto el
preset `@size-limit/preset-app` ejecuta el JS en headless Chrome y
reporta el peso **comprimido con brotli** (lo que sirve Cloudflare
Pages a navegadores modernos). El nombre "gzipped" en el label es
histórico — el número real es brotli, ligeramente menor que gzip.

### Lighthouse CI
```bash
cd frontend
npm run build
npm run lhci        # corre lhci autorun según lighthouserc.json

# o con override de salida local (sin upload):
npx lhci autorun \
  --collect.staticDistDir=./dist \
  --collect.numberOfRuns=1 \
  --upload.target=filesystem \
  --upload.outputDir=./lhci-reports
open lhci-reports/*.report.html
```

Requiere Chrome / Chromium instalado. En macOS basta con tener Google
Chrome en `/Applications/`.

## Budgets actuales (2026-05-03)

| Chunk | Real (brotli) | Limit | Margen |
|---|---|---|---|
| `index-*.js` (main) | 93.3 KB | 150 KB | 38% |
| `react-vendor-*.js` | 50.8 KB | 65 KB | 22% |
| `FastTab-*.js` | 20.8 KB | 30 KB | 31% |
| `*.css` (todos) | 2.9 KB | 20 KB | 86% |

Lighthouse local (desktop preset, sólo el shell estático):

| Categoría | Score | Threshold CI |
|---|---|---|
| Performance | 93 | warn @ 75 |
| Accessibility | 100 | **error @ 85** |
| Best Practices | 100 | warn @ 80 |
| SEO | 100 | warn @ 80 |
| FCP / LCP | 1.18 s | warn @ 4 s LCP |
| TBT | 0 ms | warn @ 500 ms |
| CLS | 0 | warn @ 0.1 |

## Filosofía warn vs error

- **Performance**: `warn`. La app está protegida por AuthGate, así que
  Lighthouse vs producción mide el shell, que puede tener flakes
  (network jitter en CI). No bloqueamos merge por un score 73 vs 75.
- **Accessibility**: `error`. Una app financiera tiene que ser usable
  con teclado y screen readers. Es la única categoría que rompe el
  pipeline.
- **Bundle size**: `error` implícito (size-limit termina con exit 1 si
  un chunk excede su budget). Es lo único 100% determinista, así que
  bloquea el merge.

## Próximos pasos (no ahora)

- Bajar `index-*.js` budget a 100 KB cuando se splitee `App.jsx`
  (Semana 7-9 del roadmap, refactor del monolito).
- Subir threshold de Performance a `error 0.85` cuando React 19
  Compiler esté ready y eliminemos re-renders innecesarios.
- Lighthouse vs producción real (con auth bypass cookie inyectado en
  CI) para medir lo que ven usuarios reales, no sólo el shell.
- Integrar `vite-bundle-visualizer` como step opcional `npm run
  size:report` para investigar regresiones cuando el budget falle.

## CI

`/.github/workflows/ci.yml` job `perf` corre `npm run size` (block) +
`npm run lhci` (continue-on-error mientras endurecemos). Depende del
job `frontend` (build + tests).
