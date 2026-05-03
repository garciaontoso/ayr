# ADR-0004: Zustand sobre Redux Toolkit

**Status**: Accepted
**Date**: 2026-05-03
**Decided by**: ricardo + claude (sesión Semana 7-9 roadmap profesionalización)

## Context

`App.jsx` tiene 2,774 líneas. Mantiene state global vía:
- 14 `useState` en el root (theme, currentTab, modal stack, costBasisModal, etc.)
- 3 Context providers (`AnalysisContext`, `HomeContext`, `CostBasisContext`)
- ~40 efectos sincronizando localStorage <-> state
- Prop drilling de 5 niveles a través de tabs

Síntomas:
- Cualquier cambio en App.jsx fuerza re-render de toda la app porque los
  Context providers vuelven a crear el `value: { ...state }`.
- Bug Pattern #008 (TDZ) tuvo origen en una `useState` declarada después
  de un `useEffect` que la referenciaba — el orden de declaración es
  frágil cuando hay 14 estados en el mismo scope.
- Persistir state nuevo a localStorage requiere acordarse de añadir una
  línea al gigante useEffect que escribe todo.

Roadmap Semana 7-9 dice: refactor `App.jsx` → state stores (`portfolioStore`,
`analysisStore`, `authStore`, `themeStore`).

Necesidades:
1. Persist middleware nativo (mucho state vive en localStorage hoy).
2. Selectores granulares para evitar re-renders innecesarios.
3. TypeScript-first (ver ADR-0003).
4. Mínimo boilerplate — equipo de 1.

## Alternatives Considered

| Opción | Pros | Cons |
|---|---|---|
| Redux Toolkit | Estándar industrial, DevTools maduros, RTK Query, bien tipado | Boilerplate alto (slices, actions, reducers, selectors), curva de aprendizaje, ~22KB gzipped, RTK Query no nos hace falta (worker es nuestro backend) |
| Zustand | ~3KB gzipped, hooks nativos, persist middleware oficial, TS first-class | Comunidad más pequeña que Redux, menos extensiones |
| React Context API solo (sin lib) | Cero deps | Re-renders amplios sin selectores, hay que reinventar persist + middleware |
| Recoil | Atómico (selectors derivados) | Proyecto efectivamente abandonado por Meta (2023+) |
| Jotai | Atómico moderno, similar API | Más conceptual (atoms + selectors); para state grande tipo "portfolio entero" Zustand encaja mejor |
| Valtio | Mutable proxies, ergonómico | Surprise factor con immer-style mutations en TS |

## Decision

Zustand.

- **Stores divididos por dominio**, no un mega-store:
  - `state/themeStore.ts` (piloto)
  - `state/authStore.ts` (token, lastValidated)
  - `state/portfolioStore.ts` (positions, fundamentals cache, prices)
  - `state/analysisStore.ts` (current ticker, openTab, analysisCache)
- **Persist middleware** con `version` + `migrate` para migrar datos
  guardados con versiones anteriores.
- **Selectores con shallow compare** cuando un componente lee >1 campo:
  `const { theme, toggle } = useThemeStore(s => ({ theme: s.theme, toggle: s.toggle }), shallow)`.
- **Stores en TypeScript** (forzado por ADR-0003).

Plan de migración (incremental, NO big-bang):
1. ✅ `themeStore` piloto — ya en producción.
2. ⏭ `authStore` saltado — auth gate funciona ya con localStorage, sin cadena de consumidores.
3. ⏳ `portfolioStore` — siguiente sesión. Migra `apiData` + `fundData` + `_costBasisRaw`.
4. ⏳ `analysisStore` — después. Migra `cfg` + `currentTicker` + `openTab`.

## Consequences

- ✅ Bundle ~3KB en vez de ~22KB.
- ✅ Selectores evitan re-renders cuando solo cambia un campo.
- ✅ El piloto themeStore ya validó la migración de datos persistidos
  (legacy plain string `'dark'` → `{ state: { theme }, version: 1 }`)
  con `migrate()` — patrón reutilizable para los otros stores.
- ⚠️ DevTools menos potentes que Redux DevTools. Mitigación: Zustand
  tiene plugin para Redux DevTools cuando lo necesitemos.
- ⚠️ Sin "thunks" formalizados — las acciones async son `async` functions
  dentro del store, suficiente para nuestro tamaño.
- 🔮 Si el state global pasa de ~10 stores razonables a ~30 acoplados,
  reconsiderar Redux Toolkit. No estamos cerca.

## Implementation

- `frontend/src/state/themeStore.ts` — piloto LIVE (40 líneas con persist + migrate)
- `frontend/package.json` — `zustand` añadido a dependencies

Patrón canónico (replicar para nuevos stores):

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FooState {
  bar: number;
  setBar: (n: number) => void;
}

export const useFooStore = create<FooState>()(
  persist(
    (set) => ({
      bar: 0,
      setBar: (bar) => set({ bar }),
    }),
    {
      name: 'ayr_foo',
      version: 1,
      migrate: (persisted, version) => {
        if (version === 0) { /* migrar legacy */ }
        return persisted as FooState;
      },
    }
  )
);
```

## References

- Roadmap: `docs/ROADMAP-PRO.md` — Semana 7-9
- Bug que motivó simplificar state: `docs/bug-patterns.md` Bug #008 (TDZ por orden de useState)
- Related ADRs: ADR-0003 (stores en TS), ADR-0010 (refactor monolitos en general)
