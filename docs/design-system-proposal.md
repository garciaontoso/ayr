# Design System Proposal — A&R v4.0

**Date**: 2026-04-07
**Author**: design-systems-architect
**Scope**: Unify visual language across 14 home tabs + 18 analysis tabs + 11 agent panels
**Status**: Proposal (no code changes made)

---

## 0. TL;DR

The project already has a decent token foundation in `frontend/src/App.css` (24 CSS vars, dark + light mode) but suffers from:

- **155+ inline `fontSize:` literals** across just 5 files (spot-checked) → no scale
- **63+ inline `borderRadius:` literals** across 5 files → no scale
- Inline `<button style={{...}}>` with gold / border / ghost variants re-implemented in ~every tab
- Three parallel "stat card" patterns (HomeView header, summary cards, CostBasisView)
- Font sizes in the wild: 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24 → **12 distinct sizes**, no rhythm
- Border radii in the wild: 4, 6, 8, 10, 12, 14, 16, 20, 100 → **9 distinct values**
- `Card.jsx` hardcodes `borderRadius:20, padding:24` — not tokenized
- `Badge.jsx` hardcodes `borderRadius:100, padding:"4px 12px", fontSize:11`
- `EmptyState.jsx` mixes `var(--gold-dim, rgba(214,158,46,.12))` fallbacks with gold `#d69e2e` — **two different golds in the codebase** (`#c8a44e` in App.css vs `#d69e2e` in EmptyState + frontend CLAUDE.md)

This proposal defines a single scale for typography, spacing, radii, and semantic colors, and specifies 5 new reusable components to replace the inline sprawl.

---

## 1. Inventario actual (what actually exists in `frontend/src/App.css`)

All tokens below are **really defined** in `:root` / `[data-theme="light"]`.

### 1.1 Colors — Background

| Token | Dark | Light |
|---|---|---|
| `--bg` | `#000000` | `#f5f5f7` |
| `--surface` | `#111111` | `#ffffff` |
| `--card` | `#161616` | `#ffffff` |
| `--card-hover` | `#1a1a1a` | `#f0f0f2` |
| `--subtle-bg` | `rgba(255,255,255,.03)` | `rgba(0,0,0,.03)` |
| `--subtle-bg2` | `rgba(255,255,255,.06)` | `rgba(0,0,0,.06)` |
| `--row-alt` | `rgba(255,255,255,.02)` | `rgba(0,0,0,.025)` |
| `--header-bg` | `rgba(0,0,0,.85)` | `rgba(245,245,247,.85)` |
| `--overlay-bg` | `rgba(0,0,0,.7)` | `rgba(0,0,0,.4)` |
| `--progress-track` | `#1a1a1a` | `#e0e0e5` |
| `--chart-bg` | `#0a0a0a` | `#eeeef0` |
| `--skeleton-bg` | `#161616` | `#e8e8ed` |
| `--skeleton-inner` | `#222` | `#d8d8dd` |

### 1.2 Colors — Text

| Token | Dark | Light |
|---|---|---|
| `--text-primary` | `#f5f5f7` | `#1d1d1f` |
| `--text-secondary` | `#86868b` | `#6e6e73` |
| `--text-tertiary` | `#48484a` | `#aeaeb2` |

Missing: `--text-disabled` (not defined; components use hardcoded `.3` opacities).

### 1.3 Colors — Borders

| Token | Dark | Light |
|---|---|---|
| `--border` | `rgba(255,255,255,.06)` | `rgba(0,0,0,.08)` |
| `--border-hover` | `rgba(255,255,255,.1)` | `rgba(0,0,0,.15)` |
| `--subtle-border` | `rgba(255,255,255,.04)` | `rgba(0,0,0,.05)` |
| `--row-border` | `rgba(255,255,255,.03)` | `rgba(0,0,0,.05)` |
| `--table-border` | `#21262d` | `#d1d1d6` |

### 1.4 Colors — Semantic + Accent

| Token | Dark | Light |
|---|---|---|
| `--gold` | `#c8a44e` | `#8B6914` |
| `--gold-dim` | `rgba(200,164,78,.15)` | `rgba(139,105,20,.12)` |
| `--gold-glow` | `rgba(200,164,78,.08)` | `rgba(139,105,20,.06)` |
| `--green` | `#30d158` | `#248a3d` |
| `--red` | `#ff453a` | `#d70015` |
| `--yellow` | `#ffd60a` | `#b25000` |
| `--orange` | `#ff9f0a` | `#c93400` |

Missing: `--blue` / `--cyan` (info), `--purple`, explicit `--success` / `--warning` / `--danger` / `--info` semantic aliases. `Badge.jsx` computes its own colors via `rate(val,rules)` returning hex strings, bypassing tokens entirely.

Note: `frontend/CLAUDE.md` references `#d69e2e` as the "gold accent". `App.css` actually uses `#c8a44e`. `EmptyState.jsx` has `rgba(214,158,46,.12)` as a fallback. **Three golds.** Pick one.

### 1.5 Typography

| Token | Value |
|---|---|
| `--fb` (body) | `'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif` |
| `--fd` (display) | `'Playfair Display', Georgia, serif` |
| `--fm` (mono) | `'IBM Plex Mono', monospace` |

**No font-size tokens exist.** Every component inlines `fontSize: 11` etc.

### 1.6 Spacing / Radii / Shadows

**None defined.** Every component inlines `padding: "10px 24px"`, `gap: 8`, `borderRadius: 20`, `box-shadow: 0 12px 40px rgba(0,0,0,.6)`, etc.

---

## 2. Propuesta de sistema nuevo

All new tokens namespaced `--ds-*` to avoid collisions with the current `--bg`, `--card`, etc. Migration can keep both sets alive during Phase 1-3.

### 2.1 Typography scale (8 sizes)

Based on a 1.25 ratio anchored at `--ds-text-base = 14px` (the current default body size in DM Sans reads well at 14 on this app's data-dense layouts).

| Token | Size | Use |
|---|---|---|
| `--ds-text-xs` | `10px` | Table footnotes, legend labels, micro-tags |
| `--ds-text-sm` | `11px` | Tab labels, badges, secondary table cells, captions |
| `--ds-text-base` | `12px` | Default body for dense UI (tables, portfolio rows) |
| `--ds-text-md` | `14px` | Paragraphs, card body, button text |
| `--ds-text-lg` | `16px` | Section titles, card titles |
| `--ds-text-xl` | `20px` | Tab-level h2, modal titles |
| `--ds-text-2xl` | `24px` | StatCard values, agent card numbers |
| `--ds-text-3xl` | `32px` | Header KPIs (NLV, P&L total) |

Font weight scale (3 values only):

| Token | Value |
|---|---|
| `--ds-font-regular` | `400` |
| `--ds-font-medium` | `600` |
| `--ds-font-bold` | `700` |

Families (rename current, keep legacy aliases):

| Token | Value |
|---|---|
| `--ds-font-body` | `var(--fb)` — DM Sans |
| `--ds-font-display` | `var(--fd)` — Playfair Display |
| `--ds-font-mono` | `var(--fm)` — IBM Plex Mono |

**Rule**: prices, money, tickers, percentages → `--ds-font-mono`. Headings → `--ds-font-display`. Everything else → `--ds-font-body`.

### 2.2 Spacing scale (6 values)

| Token | Value | Use |
|---|---|---|
| `--ds-space-1` | `4px` | Icon gaps, tight inline gaps |
| `--ds-space-2` | `8px` | Standard gap between siblings, badge padding |
| `--ds-space-3` | `12px` | Card internal gap, section gap |
| `--ds-space-4` | `16px` | Card padding, modal padding |
| `--ds-space-5` | `24px` | Card padding (large), section margin |
| `--ds-space-6` | `32px` | Page padding, hero margin |

That's it. No 6px, no 10px, no 14px, no 20px. Every inline `padding: 10` / `gap: 6` must round to this scale.

### 2.3 Border radii (4 values)

| Token | Value | Use |
|---|---|---|
| `--ds-radius-sm` | `4px` | Inputs, tiny tags |
| `--ds-radius-md` | `8px` | Buttons, small cards, skeletons |
| `--ds-radius-lg` | `12px` | Cards, modals, stat cards |
| `--ds-radius-xl` | `16px` | Hero cards, large containers |
| `--ds-radius-full` | `9999px` | Pills, badges (special) |

No 6, no 10, no 14, no 20. `Card.jsx`'s current `borderRadius:20` → becomes `--ds-radius-xl` (16px).

### 2.4 Shadows (3 values)

| Token | Value |
|---|---|
| `--ds-shadow-sm` | `0 1px 2px rgba(0,0,0,.2)` |
| `--ds-shadow-md` | `0 4px 12px rgba(0,0,0,.3)` |
| `--ds-shadow-lg` | `0 12px 40px rgba(0,0,0,.5)` |

Light mode halves the opacity via theme override.

### 2.5 Semantic colors (new aliases)

These alias existing tokens so they can be used **without** knowing the hex. Keeps `--gold`, `--green`, etc. alive.

**Background surfaces:**

| Token | Dark | Light |
|---|---|---|
| `--ds-bg-primary` | `#000000` | `#f5f5f7` |
| `--ds-bg-secondary` | `#111111` | `#ffffff` |
| `--ds-bg-tertiary` | `#0a0a0a` | `#eeeef0` |
| `--ds-bg-card` | `#161616` | `#ffffff` |
| `--ds-bg-hover` | `#1a1a1a` | `#f0f0f2` |
| `--ds-bg-overlay` | `rgba(0,0,0,.7)` | `rgba(0,0,0,.4)` |

**Text:**

| Token | Dark | Light |
|---|---|---|
| `--ds-text-primary-color` | `#f5f5f7` | `#1d1d1f` |
| `--ds-text-secondary-color` | `#86868b` | `#6e6e73` |
| `--ds-text-tertiary-color` | `#48484a` | `#aeaeb2` |
| `--ds-text-disabled-color` | `rgba(245,245,247,.25)` | `rgba(29,29,31,.3)` |

**Semantic (flat + dim + strong):**

| Token | Dark | Light | Meaning |
|---|---|---|---|
| `--ds-success` | `#30d158` | `#248a3d` | Green P&L, GOOD ratings |
| `--ds-success-dim` | `rgba(48,209,88,.15)` | `rgba(36,138,61,.12)` | Success background pills |
| `--ds-warning` | `#ffd60a` | `#b25000` | Yellow, WATCH ratings |
| `--ds-warning-dim` | `rgba(255,214,10,.15)` | `rgba(178,80,0,.12)` | |
| `--ds-danger` | `#ff453a` | `#d70015` | Red, CRITICAL alerts |
| `--ds-danger-dim` | `rgba(255,69,58,.15)` | `rgba(215,0,21,.12)` | |
| `--ds-info` | `#64d2ff` | `#0071e3` | Cyan, INFO messages (NEW) |
| `--ds-info-dim` | `rgba(100,210,255,.15)` | `rgba(0,113,227,.1)` | |
| `--ds-accent` | `#c8a44e` | `#8B6914` | Gold — brand |
| `--ds-accent-dim` | `rgba(200,164,78,.15)` | `rgba(139,105,20,.12)` | |
| `--ds-accent-hover` | `#d6b25c` | `#9e7a17` | |
| `--ds-accent-glow` | `rgba(200,164,78,.08)` | `rgba(139,105,20,.06)` | |

**Decision needed from user**: resolve the three-golds conflict. Proposal keeps `#c8a44e` (what `App.css` ships) as canonical; update `frontend/CLAUDE.md` + `EmptyState.jsx` fallback.

---

## 3. CSS vars file — listo para pegar

Paste at the **top** of `frontend/src/App.css`, right after the `@import` line. Do not delete existing `:root` block — they coexist.

```css
/* ═══════════════════════════════════════════════════════════════
   A&R Design System Tokens (v1)
   Namespace: --ds-*
   Coexists with legacy --bg, --card, --gold during migration.
   ═══════════════════════════════════════════════════════════════ */

:root {
  /* ── Typography: sizes (8) ── */
  --ds-text-xs:   10px;   /* Footnotes, legend */
  --ds-text-sm:   11px;   /* Tab labels, badges */
  --ds-text-base: 12px;   /* Dense UI default (tables) */
  --ds-text-md:   14px;   /* Body text, buttons */
  --ds-text-lg:   16px;   /* Card titles */
  --ds-text-xl:   20px;   /* Section h2 */
  --ds-text-2xl:  24px;   /* StatCard values */
  --ds-text-3xl:  32px;   /* Header KPIs */

  /* ── Typography: weights (3) ── */
  --ds-font-regular: 400;
  --ds-font-medium:  600;
  --ds-font-bold:    700;

  /* ── Typography: families (3) ── */
  --ds-font-body:    'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --ds-font-display: 'Playfair Display', Georgia, serif;
  --ds-font-mono:    'IBM Plex Mono', monospace;

  /* ── Spacing scale (6) ── */
  --ds-space-1:  4px;
  --ds-space-2:  8px;
  --ds-space-3: 12px;
  --ds-space-4: 16px;
  --ds-space-5: 24px;
  --ds-space-6: 32px;

  /* ── Border radii (5) ── */
  --ds-radius-sm:   4px;
  --ds-radius-md:   8px;
  --ds-radius-lg:  12px;
  --ds-radius-xl:  16px;
  --ds-radius-full: 9999px;

  /* ── Shadows (3) ── */
  --ds-shadow-sm: 0 1px 2px rgba(0,0,0,.2);
  --ds-shadow-md: 0 4px 12px rgba(0,0,0,.3);
  --ds-shadow-lg: 0 12px 40px rgba(0,0,0,.5);

  /* ── Colors: backgrounds ── */
  --ds-bg-primary:   #000000;
  --ds-bg-secondary: #111111;
  --ds-bg-tertiary:  #0a0a0a;
  --ds-bg-card:      #161616;
  --ds-bg-hover:     #1a1a1a;
  --ds-bg-overlay:   rgba(0,0,0,.7);

  /* ── Colors: text ── */
  --ds-text-primary-color:   #f5f5f7;
  --ds-text-secondary-color: #86868b;
  --ds-text-tertiary-color:  #48484a;
  --ds-text-disabled-color:  rgba(245,245,247,.25);

  /* ── Colors: borders ── */
  --ds-border:       rgba(255,255,255,.06);
  --ds-border-hover: rgba(255,255,255,.1);
  --ds-border-subtle: rgba(255,255,255,.03);

  /* ── Semantic colors ── */
  --ds-success:       #30d158;
  --ds-success-dim:   rgba(48,209,88,.15);
  --ds-warning:       #ffd60a;
  --ds-warning-dim:   rgba(255,214,10,.15);
  --ds-danger:        #ff453a;
  --ds-danger-dim:    rgba(255,69,58,.15);
  --ds-info:          #64d2ff;
  --ds-info-dim:      rgba(100,210,255,.15);

  /* ── Accent (gold) ── */
  --ds-accent:       #c8a44e;
  --ds-accent-dim:   rgba(200,164,78,.15);
  --ds-accent-hover: #d6b25c;
  --ds-accent-glow:  rgba(200,164,78,.08);

  /* ── Motion ── */
  --ds-transition-fast: .18s ease;
  --ds-transition-base: .25s ease;
  --ds-transition-slow: .4s ease;
}

/* ═══ Light mode overrides ═══ */
[data-theme="light"] {
  --ds-bg-primary:   #f5f5f7;
  --ds-bg-secondary: #ffffff;
  --ds-bg-tertiary:  #eeeef0;
  --ds-bg-card:      #ffffff;
  --ds-bg-hover:     #f0f0f2;
  --ds-bg-overlay:   rgba(0,0,0,.4);

  --ds-text-primary-color:   #1d1d1f;
  --ds-text-secondary-color: #6e6e73;
  --ds-text-tertiary-color:  #aeaeb2;
  --ds-text-disabled-color:  rgba(29,29,31,.3);

  --ds-border:        rgba(0,0,0,.08);
  --ds-border-hover:  rgba(0,0,0,.15);
  --ds-border-subtle: rgba(0,0,0,.05);

  --ds-success:     #248a3d;
  --ds-success-dim: rgba(36,138,61,.12);
  --ds-warning:     #b25000;
  --ds-warning-dim: rgba(178,80,0,.12);
  --ds-danger:      #d70015;
  --ds-danger-dim:  rgba(215,0,21,.12);
  --ds-info:        #0071e3;
  --ds-info-dim:    rgba(0,113,227,.1);

  --ds-accent:       #8B6914;
  --ds-accent-dim:   rgba(139,105,20,.12);
  --ds-accent-hover: #9e7a17;
  --ds-accent-glow:  rgba(139,105,20,.06);

  --ds-shadow-sm: 0 1px 2px rgba(0,0,0,.06);
  --ds-shadow-md: 0 4px 12px rgba(0,0,0,.1);
  --ds-shadow-lg: 0 12px 40px rgba(0,0,0,.18);
}
```

---

## 4. Componentes reutilizables propuestos

Location: `frontend/src/components/ui/`. All consume the `--ds-*` tokens above.

### 4.1 `<Button>` — replaces ~every inline `<button style={{...}}>`

Variants: `primary` (gold-filled), `secondary` (outlined gold), `ghost` (transparent + border), `danger` (red-outlined).
Sizes: `sm` (28px min-height, `--ds-text-sm`), `md` (36px, `--ds-text-md`), `lg` (44px, `--ds-text-md` + `--ds-space-3` padding).

```jsx
<Button variant="primary" size="md" icon="📥" onClick={...}>
  Exportar
</Button>
```

Props: `variant`, `size`, `icon`, `loading`, `disabled`, `fullWidth`, `onClick`, `type`, `as`.

Maps to: the button blocks in `EmptyState.jsx`, `HomeView.jsx`, all `ar-home-tabs button`, airplane-mode toggle, tax-report export, etc. **Estimated replacements: 80–120 inline buttons**.

### 4.2 `<Section>` — wrapper for titled blocks

```jsx
<Section title="Dividend Calendar" icon="📅" action={<Button size="sm">Export</Button>}>
  {children}
</Section>
```

Renders: `Card` + header row (`--ds-font-display`, `--ds-text-xl`) + optional icon + optional right-side action slot + divider + `children`. Single source of truth for the "title + content" pattern currently re-implemented in every home tab and every analysis tab.

### 4.3 `<StatCard>` — for KPI tiles

```jsx
<StatCard
  label="NLV"
  value="$1.35M"
  delta="+2.3%"
  deltaColor="success"
  mono
  size="lg"
/>
```

Props: `label`, `value`, `delta`, `deltaColor` (success/danger/warning/info/default), `icon`, `mono` (use `--ds-font-mono`), `size` (sm/md/lg), `onClick` (optional → becomes clickable).
Uses: `--ds-text-xs` for label, `--ds-text-2xl` (md) or `--ds-text-3xl` (lg) for value, `--ds-text-sm` for delta.

Maps to: HomeView header KPIs (NLV, P&L, Div), Dashboard summary grid, CC Income summary, CostBasis summary.

### 4.4 `<Pill>` — semantic badges

```jsx
<Pill severity="success">BUENO</Pill>
<Pill severity="warning" dot>WATCH</Pill>
<Pill severity="danger" dot>CRITICAL</Pill>
<Pill severity="info">INFO</Pill>
<Pill severity="accent">Q+S 85</Pill>
```

Props: `severity` (success/warning/danger/info/accent/neutral), `dot` (prepend colored dot), `size` (sm/md), `children`.

Replaces the current `Badge.jsx` (which renders raw hex strings from `rate()`) and all inline `<span style={{background: rgb..., borderRadius: 100,...}}>` patterns. The current `Badge.jsx` can become a thin wrapper: `<Pill severity={rateToSeverity(val, rules)}>{lbl}</Pill>`.

### 4.5 `<EmptyState>` — replaces current one, richer

```jsx
<EmptyState
  icon="📊"
  title="No hay posiciones aún"
  description="Sincroniza tu cuenta de IB para ver tu portfolio."
  action={<Button variant="primary">Sincronizar IB</Button>}
  secondaryAction={<Button variant="ghost">Ver demo</Button>}
/>
```

Differences from current `EmptyState.jsx`:
- Uses tokens throughout (no hardcoded `rgba(214,158,46,.12)`)
- Accepts `<Button>` children instead of raw `action`/`onAction` string pairs → composable
- `description` instead of `subtitle` (clearer)
- Keeps `LoadingSkeleton` + `InlineLoading` in same file

### 4.6 Bonus: `<Divider>` + `<Stack>`

Tiny primitives to eliminate `<div style={{height:1, background:"var(--border)", margin:"12px 0"}}>` and `<div style={{display:"flex", gap:8}}>`:

```jsx
<Divider spacing="md" />
<Stack direction="row" gap={3} align="center">...</Stack>
```

Optional but cleans up ~200 inline flexbox divs.

---

## 5. Migration strategy

### Phase 1 — Add tokens (zero risk, zero visual change)
1. Paste the CSS block from §3 at the top of `frontend/src/App.css`.
2. Deploy. Nothing changes visually. New tokens are available but unused.
3. Commit: `design-system: add --ds-* token layer`.

### Phase 2 — Build components (zero visual change to existing tabs)
4. Create `frontend/src/components/ui/Button.jsx`, `Pill.jsx`, `StatCard.jsx`, `Section.jsx`, `EmptyState.jsx` (rewrite).
5. Keep old `Card.jsx`, `Badge.jsx`, `EmptyState.jsx` alive — don't delete yet.
6. Write a tiny demo tab `components/ui/__preview__.jsx` (local dev only) rendering all variants. Verify dark + light mode.
7. Commit: `design-system: new ui primitives (Button, Pill, StatCard, Section, EmptyState v2)`.

### Phase 3 — Migrate high-impact tabs first
Priority order, each in its own commit so rollback is trivial:

1. **`HomeView.jsx`** — the header is visible on EVERY tab. Migrating it to `<StatCard>` immediately changes the perceived polish of the entire app. ROI: highest. ~4h.
2. **`PortfolioTab`** — most-viewed tab. Migrate row hover + action buttons to `<Button>`. ~2h.
3. **`AgentsTab`** (Timeline + Por Empresa) — brand new, lots of inline styling, benefits most from `<Pill severity>` for agent status. ~3h.
4. **`QualityTab` + Q+S drill-down modal** — recently added, high badge density. ~2h.
5. **Analysis tabs (DashTab, ValuationTab, etc.)** — sweep in batches of 3. ~1h each.
6. **Agent detail modals** — last, they're the least visible.

For each tab:
- Replace inline buttons → `<Button>`
- Replace inline headers → `<Section title icon>`
- Replace inline badges → `<Pill>`
- Replace inline KPI tiles → `<StatCard>`
- Leave the rest (tables, charts) alone

### Phase 4 — Clean up
7. Once 80%+ of call sites are migrated, delete unused inline patterns.
8. Rewrite `Card.jsx` to use tokens: `borderRadius: var(--ds-radius-xl)`, `padding: var(--ds-space-5)`, `background: var(--ds-bg-card)`.
9. Replace old `Badge.jsx` with re-export of `<Pill>`.
10. Update `frontend/CLAUDE.md` to reference `#c8a44e` (resolve gold conflict).
11. Add ESLint rule (`no-restricted-syntax`) banning `fontSize:` / `borderRadius:` literals in JSX style props → forces use of tokens.

### Phase 5 — Document (optional)
12. Extend this file with a short "how to use" section + screenshots.

**Total estimated effort**: Phase 1-2 in 1 day. Phase 3 spread over 1-2 weeks part-time. Phase 4-5 in 1 day.

**Rollback plan**: every phase is a separate commit. Reverting any phase leaves earlier phases intact. The `--ds-*` namespace guarantees no collision with legacy tokens, so Phase 1 cannot break anything.

---

## 6. Before / After mockup (verbal)

**Before (today):**
- HomeView header is 3 hand-rolled divs with `fontSize: 22, 11, 13` and different paddings. NLV, P&L, Div each look slightly different.
- PortfolioTab action bar has 5 buttons, each with its own `padding: "6px 10px"` / `padding: "8px 14px"` / `padding: "5px 8px"` and its own hover color.
- Analysis tabs mix `fontSize: 15` and `fontSize: 16` for section titles, sometimes Playfair, sometimes DM Sans.
- Agent cards use 4 different greens (hex `#30d158`, `rgba(0,200,80,.8)`, `#28a745`, `#22c55e`) because each was added at a different time.
- Dark → light theme: 70% works, but Q+S modal and Agents tab have hardcoded `rgba(255,255,255,.1)` that becomes invisible on white.
- Radii: Portfolio rows are `borderRadius: 10`, Cards are `20`, Modals are `16`, Badges are `100`, tiny tags are `6`. No rhythm.

**After:**
- HomeView header: three `<StatCard size="lg" mono>` with identical spacing, identical label typography, identical delta formatting. NLV, P&L, Div become a tight visual group.
- Every tab's action bar is `<Stack direction="row" gap={2}>` of `<Button size="sm">`, giving identical 28px heights, identical hover states, identical focus rings.
- Every tab title is `<Section title="..." icon="...">` → identical Playfair heading at `--ds-text-xl`, identical 16px bottom divider.
- Every badge is a `<Pill severity="...">` → only 5 possible colors (success, warning, danger, info, accent), all theme-aware.
- Dark → light: theme switch is instant and correct everywhere because every color goes through `--ds-*` tokens that the theme overrides.
- Radii: 3 sizes visible across the app (md on small UI, lg on cards, xl on hero). Eye immediately groups elements by hierarchy.
- Perceived effect: the app stops looking like 14 MVPs glued together and starts feeling like a single IDE-grade tool — same vibe IBKR Desktop or Bloomberg Terminal achieve through ruthless consistency.

**Bundle-size impact**: tokens are CSS text, components are small wrappers, net delta +5-8KB gzipped. Offsetting this, removing hundreds of inline style objects reduces JSX string literal size meaningfully; net likely **-2KB** after full migration.

---

## 7. Open decisions for the user

1. **Resolve gold conflict**: `#c8a44e` (App.css, proposal default) vs `#d69e2e` (frontend/CLAUDE.md, EmptyState fallback). Pick one.
2. **Base font size**: 12px (current dense default) vs 14px (more readable, bigger bundle UI). Proposal locks 12px as `--ds-text-base` for density but this is reversible.
3. **Monospace default for numbers**: agree that ALL money/price/percentage values use `--ds-font-mono`? Currently ~60% do.
4. **Phase 3 priority**: confirm HomeView → Portfolio → Agents → Quality → rest is the right order. Swap if a different tab has more user pain.
5. **ESLint token rule**: accept/reject the ban on inline `fontSize:` / `borderRadius:` literals once migration is done.

---

*End of proposal. No code was modified. File written: `/Users/ricardogarciaontoso/IA/AyR/docs/design-system-proposal.md`.*
