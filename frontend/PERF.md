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

## Source maps en R2 (debugging stacks de prod)

Vite genera `dist/assets/*.js.map` cuando `build.sourcemap = true`. NO
se publican en Cloudflare Pages (los `.map` se sirven desde R2 bajo
demanda solo para el desarrollador). El upload corre dentro de
`npm run deploy:frontend` justo después del build:

```
cd frontend && npm run build && npm run upload:sourcemaps && wrangler pages deploy dist
```

### Layout R2

- Bucket: `ayr-earnings-archive` (reusado, prefijo `sourcemaps/`)
- Key: `sourcemaps/{BUILD_ID}/{filename}.js.map`
- BUILD_ID: `"{ISO timestamp sin colons}_{git short SHA}"` ej:
  `2026-05-03_19-30-21_3933eb2`. Inyectado en bundle via
  `import.meta.env.VITE_BUILD_ID` (vite.config.js).

`main.jsx` y `ErrorBoundary.jsx` ya leen `VITE_BUILD_ID` y lo mandan
en cada POST a `/api/error-log`. La columna `errors_log.build_id`
sale en el dashboard.

### Workflow para resolver un stack minificado

1. Abre `/api/errors/dashboard` (UI) y copia `buildId` + stack.
2. POST a `/api/errors/resolve-stack` con `{ buildId, stack }`:
   ```
   curl -X POST https://api.onto-so.com/api/errors/resolve-stack \
     -H "X-AYR-Auth: $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"buildId":"2026-05-03_...","stack":"Vn.fetch at index-XYZ.js:1:5234"}'
   ```
   Devuelve los `mapKey`s y un comando `wrangler r2 object get` por
   cada filename detectado.
3. Descarga el `.map`:
   ```
   npx wrangler r2 object get ayr-earnings-archive/sourcemaps/.../index-XYZ.js.map \
     --remote --file=/tmp/index-XYZ.js.map
   ```
4. En Chrome DevTools → Sources → Right-click → "Add source map…" →
   apunta al fichero local. Las líneas minificadas mostraran
   `componentName.jsx:42` reales.

### Por qué NO resolvemos en el server

La librería `source-map` (Mozilla) funciona en Workers pero pesa
~150KB y consume CPU budget. El dashboard se mira <10x/día por el
desarrollador, así que el round-trip manual de `wrangler r2 get` +
DevTools es razonable. Si esto se vuelve doloroso, migrar a
resolución server-side con la librería lazy-loaded (el endpoint ya es
admin-only).

### Tamaño y rotación

Cada deploy sube ~5-10MB de `.map` (todos los chunks lazy incluidos).
A 30 deploys/mes son ~250MB anuales, dentro del free tier de R2 (10GB).
Los antiguos no se borran automaticamente — limpiar manualmente con
`wrangler r2 object delete` cuando se acumule.
