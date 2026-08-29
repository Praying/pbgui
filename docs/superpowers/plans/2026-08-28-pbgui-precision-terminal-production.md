# PBGui Precision Terminal 2.0 Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the production Vue 3 frontend from blue-grey surfaces to the approved neutral-graphite Precision Terminal 2.0 palette while preserving business behavior and synchronizing charts, inline status colors, legacy aliases, and nine core page families.

**Architecture:** `frontend/src/styles/tailwind.css` remains the canonical CSS source. A pure read-only `PRECISION_PALETTE` TypeScript constant mirrors values required by Plotly, Lightweight Charts, and inline styles; focused contracts prevent CSS and TypeScript drift. Shared tokens change first, followed by page-local overrides in independently testable batches.

**Tech Stack:** Vue 3.5, TypeScript 5.7, Tailwind CSS 4.3, Vite 6, Vitest 3, PostCSS, Plotly globals, Lightweight Charts global, pnpm 10.

**Spec:** `docs/superpowers/specs/2026-08-28-pbgui-precision-terminal-production-design.md`

## Global Constraints

- Preserve API behavior, data models, WebSockets, polling, routes, navigation, iframe messaging, drag/drop, chart lifecycle, and saved zoom behavior.
- Do not add dependencies, theme switching, remote resources, runtime CSS color resolution, or screenshot baselines.
- Preserve existing token names, Tailwind utilities, legacy aliases, and `.btn`/`.pbgui-btn` compatibility selectors.
- Base surfaces must use `#0f0f0f`, `#161616`, `#1b1b1b`, `#1e1e1e`, `#222222`, and `#2b2b2b`.
- Borders must use `#343434`, `#464646`, and `#626262`; text must use `#f0f0f0`, `#bdbdbd`, and `#999999`.
- Disabled text must use `#737373`; placeholder text must use `#858585`.
- Accent deep/base/soft must use `#4fa8d3`, `#8fcff2`, `#b6e1f7`, with contrast `#081216`.
- Use the approved success, warning, and danger ramps exactly as specified in the design document.
- Do not modify `api/serial.txt`; this is frontend-only styling and chart-color work.
- Do not create commits unless the user separately requests commits.
- Before each task, verify no unexpected concurrent edits exist in files that task will touch.

---

## Shared palette interface

Create `frontend/src/shared/lib/precisionPalette.ts` with this exact read-only contract:

```ts
export const PRECISION_PALETTE = {
  surface: {
    deep: '#0f0f0f',
    page: '#161616',
    sidebar: '#1b1b1b',
    input: '#1e1e1e',
    panel: '#222222',
    elevated: '#2b2b2b',
  },
  border: {
    subtle: '#343434',
    default: '#464646',
    strong: '#626262',
  },
  text: {
    primary: '#f0f0f0',
    secondary: '#bdbdbd',
    muted: '#999999',
  },
  accent: {
    deep: '#4fa8d3',
    base: '#8fcff2',
    soft: '#b6e1f7',
    contrast: '#081216',
  },
  success: { deep: '#397d5e', base: '#7bc8a5', soft: '#a4dbc3' },
  warning: { deep: '#8a632c', base: '#d8ae6f', soft: '#e5c99b' },
  danger: { deep: '#914343', base: '#d98080', soft: '#e6aaaa' },
  alpha: {
    accentBackground: 'rgb(143 207 242 / 0.14)',
    successBackground: 'rgb(123 200 165 / 0.13)',
    warningBackground: 'rgb(216 174 111 / 0.14)',
    dangerBackground: 'rgb(217 128 128 / 0.13)',
    volumeUp: 'rgb(123 200 165 / 0.35)',
    volumeDown: 'rgb(217 128 128 / 0.35)',
  },
} as const;
```

The module has no functions, DOM access, mutable state, or side effects. Backtest, Dashboard Editor, and Services Monitor import this object rather than duplicating hex values.

---

### Task 1: Lock the canonical CSS token contract

**Files:**
- Modify: `frontend/src/shared/components/visual-tokens.test.ts`
- Modify: `frontend/src/shared/components/AppShell.styles.test.ts`
- Modify: `frontend/src/shared/components/WorkbenchRail.styles.test.ts`

**Interfaces:**
- Consumes: approved palette from the spec.
- Produces: failing contracts that Task 2 must satisfy.

- [ ] **Step 1: Replace old blue-grey expectations with exact surface values**

```ts
expect(stylesheet).toContain('--color-deep: #0f0f0f;');
expect(stylesheet).toContain('--color-page: #161616;');
expect(stylesheet).toContain('--color-workspace: #161616;');
expect(stylesheet).toContain('--color-sidebar: #1b1b1b;');
expect(stylesheet).toContain('--color-input: #1e1e1e;');
expect(stylesheet).toContain('--color-panel: #222222;');
expect(stylesheet).toContain('--color-card: #2b2b2b;');
expect(stylesheet).toContain('--color-elevated: #2b2b2b;');
```

- [ ] **Step 2: Add border, text, semantic, and RGB companion expectations**

```ts
expect(stylesheet).toContain('--color-border-subtle: #343434;');
expect(stylesheet).toContain('--color-border-default: #464646;');
expect(stylesheet).toContain('--color-border-strong: #626262;');
expect(stylesheet).toContain('--color-primary: #f0f0f0;');
expect(stylesheet).toContain('--color-secondary: #bdbdbd;');
expect(stylesheet).toContain('--color-muted: #999999;');
expect(stylesheet).toContain('--color-accent: #8fcff2;');
expect(stylesheet).toContain('--color-accent-soft: #b6e1f7;');
expect(stylesheet).toContain('--color-accent-deep: #4fa8d3;');
expect(stylesheet).toContain('--accent-rgb: 143 207 242;');
expect(stylesheet).toContain('--success-rgb: 123 200 165;');
expect(stylesheet).toContain('--warning-rgb: 216 174 111;');
expect(stylesheet).toContain('--danger-rgb: 217 128 128;');
expect(stylesheet).toContain('--bg-page-rgb: 22 22 22;');
expect(stylesheet).toContain('--bg-panel-rgb: 34 34 34;');
expect(stylesheet).toContain('--text-secondary-rgb: 189 189 189;');
```

Keep alias, spacing, easing, and offline font assertions. Add a check that the shared styles no longer contain `rgb(2 8 14` or `rgb(224 241 255` after Task 2.

- [ ] **Step 3: Run focused tests and verify approved-value failures**

```bash
cd frontend && pnpm exec vitest run \
  src/shared/components/visual-tokens.test.ts \
  src/shared/components/AppShell.styles.test.ts \
  src/shared/components/WorkbenchRail.styles.test.ts
```

Expected: `visual-tokens.test.ts` fails because production CSS still contains old values. Structural tests remain green unless they pin an old highlight.

- [ ] **Step 4: Review the failure set**

Confirm failures concern only approved colors, not spacing, typography, responsive widths, motion, or accessibility structure.

---

### Task 2: Implement canonical CSS tokens and neutral shared effects

**Files:**
- Modify: `frontend/src/styles/tailwind.css`
- Modify: `frontend/src/styles/components.css`
- Modify: `frontend/src/shared/components/ConnectionNotice.vue`
- Modify: `frontend/src/shared/components/ui/slider/Slider.vue`
- Test: shared visual and component style tests

**Interfaces:**
- Consumes: Task 1 contracts.
- Produces: canonical CSS and aliases consumed by all later tasks.

- [ ] **Step 1: Add Deep and replace canonical colors**

Define the approved surfaces, borders, text, accent, semantic ramps, and:

```css
--color-backdrop: rgb(15 15 15 / 0.72);
```

Set `--color-disabled: #737373` and `--color-placeholder: #858585`. Verify placeholder contrast on Input and treat Disabled as intentionally non-interactive text rather than normal body copy.

- [ ] **Step 2: Synchronize all aliases and RGB channels**

Add `--surface-deep: var(--color-deep)`, retain every current public alias, and replace all channel triplets. Use:

```css
--focus-ring: 0 0 0 3px rgb(143 207 242 / 0.3);
```

- [ ] **Step 3: Neutralize shadows and highlights**

Replace blue-black channels with `rgb(0 0 0 / ...)` and blue-white inset channels with `rgb(255 255 255 / ...)`. Preserve existing blur, spread, and selector behavior.

- [ ] **Step 4: Remove old literals from touched shared components**

Update `components.css`, `ConnectionNotice.vue`, and `Slider.vue` to use canonical tokens or neutral channels. Do not alter dimensions, props, events, or motion rules.

- [ ] **Step 5: Run shared contracts**

```bash
cd frontend && pnpm exec vitest run \
  src/shared/components/visual-tokens.test.ts \
  src/shared/components/AppShell.styles.test.ts \
  src/shared/components/WorkbenchRail.styles.test.ts \
  src/shared/components/ConnectionNotice.test.ts \
  src/shared/components/ui/slider/Slider.test.ts
```

Expected: PASS.

- [ ] **Step 6: Audit shared old literals**

```bash
rg -n '#0d151e|#111c27|#1a2a38|#203344|#263b4d|rgb\(2 8 14|rgb\(224 241 255|155 191 255' \
  frontend/src/styles frontend/src/shared/components
```

Expected: no active shared-style matches.

---

### Task 3: Add the static TypeScript palette bridge

**Files:**
- Create: `frontend/src/shared/lib/precisionPalette.ts`
- Create: `frontend/src/shared/lib/precisionPalette.test.ts`
- Modify: `frontend/src/shared/components/visual-tokens.test.ts`

**Interfaces:**
- Consumes: Task 2 canonical CSS.
- Produces: `PRECISION_PALETTE` for Tasks 4, 6, and 8.

- [ ] **Step 1: Write the failing module contract**

```ts
import { describe, expect, it } from 'vitest';
import { PRECISION_PALETTE } from './precisionPalette';

describe('PRECISION_PALETTE', () => {
  it('exposes the approved immutable palette', () => {
    expect(PRECISION_PALETTE.surface).toEqual({
      deep: '#0f0f0f', page: '#161616', sidebar: '#1b1b1b',
      input: '#1e1e1e', panel: '#222222', elevated: '#2b2b2b',
    });
    expect(PRECISION_PALETTE.accent.base).toBe('#8fcff2');
    expect(PRECISION_PALETTE.success.base).toBe('#7bc8a5');
    expect(PRECISION_PALETTE.warning.base).toBe('#d8ae6f');
    expect(PRECISION_PALETTE.danger.base).toBe('#d98080');
  });
});
```

- [ ] **Step 2: Verify the missing-module failure**

```bash
cd frontend && pnpm exec vitest run src/shared/lib/precisionPalette.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Create the module using the exact interface above**

Do not add getters, DOM parsing, theme state, or generic color helpers.

- [ ] **Step 4: Add CSS/TypeScript synchronization assertions**

Import `PRECISION_PALETTE` in `visual-tokens.test.ts` and assert matching CSS declarations for surfaces, borders, text, accent, and semantics.

- [ ] **Step 5: Run both contracts**

```bash
cd frontend && pnpm exec vitest run \
  src/shared/lib/precisionPalette.test.ts \
  src/shared/components/visual-tokens.test.ts
```

Expected: PASS.

---

### Task 4: Migrate Backtest local palette and Plotly colors

**Files:**
- Modify: `frontend/src/pages/v7_backtest/App.vue`
- Modify: `frontend/src/pages/v7_backtest/lib/resultCharts.ts`
- Modify: `frontend/src/pages/v7_backtest/lib/resultCharts.test.ts`
- Modify: `frontend/src/pages/v7_backtest/App.styles.test.ts`
- Modify: `frontend/src/pages/v7_backtest/components/ConfigsPanel.vue`
- Modify: `frontend/src/pages/v7_backtest/components/ResultsPanel.vue`

**Interfaces:**
- Consumes: shared CSS and `PRECISION_PALETTE`.
- Produces: Backtest without a page-wide palette override and synchronized Plotly output.

- [ ] **Step 1: Update tests to expect shared values**

```ts
paper_bgcolor: PRECISION_PALETTE.surface.deep,
plot_bgcolor: PRECISION_PALETTE.surface.deep,
yaxis: { gridcolor: PRECISION_PALETTE.border.default, title: 'Balance' },
```

Add deterministic comparison-series expectations and assert the page no longer defines the old unscoped palette.

- [ ] **Step 2: Verify old-output failures**

```bash
cd frontend && pnpm exec vitest run \
  src/pages/v7_backtest/lib/resultCharts.test.ts \
  src/pages/v7_backtest/App.styles.test.ts
```

- [ ] **Step 3: Remove only Backtest palette declarations**

Keep overflow, body gradient, pinning, scrolling, table, editor, and responsive rules. Replace hardcoded filled-button foregrounds with canonical contrast roles.

- [ ] **Step 4: Consume `PRECISION_PALETTE` in chart builders**

Map canvas to Deep, text to Primary, grid to Default border, primary lines to Accent, and positive/negative values to semantic bases. Set the chart font to `'Space Grotesk', 'Segoe UI', system-ui, sans-serif`. Define comparison colors in this exact order: Accent Base, Success Base, Warning Base, Danger Base, Accent Soft, Success Soft, Warning Soft, Danger Soft. Do not create a purple semantic color. Replace the two touched component inset highlights with neutral white channels while preserving shadow geometry.

- [ ] **Step 5: Run all Backtest tests**

```bash
cd frontend && pnpm exec vitest run src/pages/v7_backtest
```

- [ ] **Step 6: Audit active old literals**

```bash
rg -n '#0b111b|#141e2b|#111a27|#182536|#101925|#5ea8ff|#43c992|#e6b566|#e56b74|#f2f5fb' \
  frontend/src/pages/v7_backtest
```

Expected: no active palette override or rendered chart/UI literals.

---

### Task 5: Migrate Coin Data roles and font inheritance

**Files:**
- Modify: `frontend/src/pages/coin_data/App.vue`
- Modify: `frontend/src/pages/coin_data/components/SymbolTable.vue`
- Modify: `frontend/src/pages/coin_data/components/FiltersPanel.vue`
- Create: `frontend/src/pages/coin_data/App.styles.test.ts`

**Interfaces:**
- Consumes: canonical CSS aliases.
- Produces: `--coin-*` roles derived entirely from shared tokens.

- [ ] **Step 1: Add a failing source contract**

```ts
expect(source).toContain('--coin-page: var(--surface-page);');
expect(source).toContain('--coin-workspace: var(--surface-workspace);');
expect(source).toContain('--coin-control: var(--surface-card);');
expect(source).toContain('--coin-data: var(--surface-panel);');
expect(source).toContain('--coin-input: var(--bg-input);');
expect(source).not.toContain('#0d151e');
expect(source).not.toContain("font-family: 'Segoe UI'");
expect(source).not.toContain('rgb(155 191 255');
```

- [ ] **Step 2: Verify the contract fails**

```bash
cd frontend && pnpm exec vitest run src/pages/coin_data/App.styles.test.ts
```

- [ ] **Step 3: Map page roles to canonical tokens**

Use `--coin-header: var(--color-deep)`, shared borders, and `rgb(var(--accent-rgb) / ...)` for hover/selection. Replace the literal workspace-header gradient endpoint.

- [ ] **Step 4: Remove local font and old channels**

Keep `overflow: hidden`, inherit the shared font, and neutralize touched old shadows without changing geometry.

- [ ] **Step 5: Run all Coin Data tests**

```bash
cd frontend && pnpm exec vitest run src/pages/coin_data
```

---

### Task 6: Migrate Services Monitor semantic literals

**Files:**
- Modify: `frontend/src/pages/services_monitor/components/PricesOverlay.vue`
- Modify: `frontend/src/pages/services_monitor/components/PricesOverlay.test.ts`
- Modify: `frontend/src/pages/services_monitor/components/LogViewer.vue`
- Modify: `frontend/src/pages/services_monitor/App.vue`
- Modify: `frontend/src/pages/services_monitor/components/CmcKeyModal.vue`
- Modify: `frontend/src/pages/services_monitor/components/CmcAuthorityModal.vue`

**Interfaces:**
- Consumes: `PRECISION_PALETTE` and shared backdrop/contrast roles.
- Produces: consistent price-age, CRITICAL, modal, and button colors.

- [ ] **Step 1: Update price-age expectations**

```ts
expect(freshStyle).toContain('color: rgb(123, 200, 165)');
expect(staleStyle).toContain('color: rgb(216, 174, 111)');
expect(oldStyle).toContain('color: rgb(217, 128, 128)');
```

Add a direct missing-value expectation.

- [ ] **Step 2: Verify old inline-color failures**

```bash
cd frontend && pnpm exec vitest run \
  src/pages/services_monitor/components/PricesOverlay.test.ts \
  src/pages/services_monitor/App.test.ts
```

- [ ] **Step 3: Consume the shared palette**

Use shared text/semantic values from `ageCol`, replace CRITICAL purple with Danger tokens while preserving CRITICAL text, and use Accent Contrast on Accent fills.

- [ ] **Step 4: Normalize touched modal effects**

Replace visible old backdrop/shadow literals with `--bg-backdrop` or `--shadow-modal`. Preserve modal behavior, size, dragging, reveal, and close semantics.

- [ ] **Step 5: Run the Services suite**

```bash
cd frontend && pnpm exec vitest run src/pages/services_monitor
```

---

### Task 7: Migrate Market Data and Optimize exceptions

**Files:**
- Modify: `frontend/src/pages/market_data/App.vue`
- Create: `frontend/src/pages/market_data/App.styles.test.ts`
- Modify: `frontend/src/pages/v7_optimize/App.vue`
- Modify: `frontend/src/pages/v7_optimize/components/QueuePanel.vue`
- Modify: `frontend/src/pages/v7_optimize/components/BotJsonEditor.vue`
- Create: `frontend/src/pages/v7_optimize/App.styles.test.ts`
- Test: existing Market Data and Optimize tests

**Interfaces:**
- Consumes: canonical CSS.
- Produces: inherited typography and semantic Warning usage.

- [ ] **Step 1: Add focused source assertions**

In `market_data/App.styles.test.ts`, read `App.vue` and assert it no longer contains `--font: 'Source Sans Pro'` or `font-family: var(--font)`. In `v7_optimize/App.styles.test.ts`, read `App.vue`, `QueuePanel.vue`, and `BotJsonEditor.vue`, concatenate their source, and assert the result does not contain `#d0a36f`.

- [ ] **Step 2: Verify new contracts fail before implementation**

```bash
cd frontend && pnpm exec vitest run src/pages/market_data src/pages/v7_optimize
```

- [ ] **Step 3: Remove only Market Data font override**

Keep overflow, body flex layout, tooltip selectors, and geometry. Let controls inherit the canonical font aliases.

- [ ] **Step 4: Replace Optimize warning literals**

Use `text-warning-soft`, `border-l-warning`, and `var(--warning-soft)` in QueuePanel, connection banner, runtime warning, and JSON legend. Preserve state logic.

- [ ] **Step 5: Run both full suites**

```bash
cd frontend && pnpm exec vitest run src/pages/market_data src/pages/v7_optimize
```

---

### Task 8: Migrate Dashboard Editor charts and inline colors

**Files:**
- Modify: `frontend/src/pages/dashboard_editor/lib/plotlyLayouts.ts`
- Modify: `frontend/src/pages/dashboard_editor/lib/plotlyLayouts.test.ts`
- Modify: `frontend/src/pages/dashboard_editor/composables/useOrdersChart.ts`
- Modify: `frontend/src/pages/dashboard_editor/composables/useOrdersChart.test.ts`
- Modify: `frontend/src/pages/dashboard_editor/lib/format.ts`
- Modify: `frontend/src/pages/dashboard_editor/lib/format.test.ts`
- Modify: `frontend/src/pages/dashboard_editor/components/widgets/WidgetOrders.vue`
- Modify: `frontend/src/pages/dashboard_editor/components/widgets/WidgetOrders.test.ts`
- Modify: `frontend/src/pages/dashboard_editor/components/widgets/WidgetTop.test.ts`
- Modify: `frontend/src/pages/dashboard_editor/components/widgets/WidgetPnl.test.ts`
- Modify: `frontend/src/pages/dashboard_editor/components/widgets/WidgetPpl.test.ts`
- Modify: `frontend/src/pages/dashboard_editor/components/widgets/WidgetBalance.test.ts`
- Modify: `frontend/src/pages/dashboard_editor/composables/useLivePoll.test.ts`

**Interfaces:**
- Consumes: `PRECISION_PALETTE`.
- Produces: synchronized Plotly, Lightweight Charts, legend, and inline colors.

- [ ] **Step 1: Update exact-value tests**

Expect chart Deep backgrounds, Primary text, Default grids, Strong zero lines, semantic positive/negative bars, Secondary entry lines, and shared volume alpha values.

- [ ] **Step 2: Verify focused failures**

```bash
cd frontend && pnpm exec vitest run \
  src/pages/dashboard_editor/lib/plotlyLayouts.test.ts \
  src/pages/dashboard_editor/composables/useOrdersChart.test.ts \
  src/pages/dashboard_editor/lib/format.test.ts \
  src/pages/dashboard_editor/components/widgets/WidgetOrders.test.ts
```

- [ ] **Step 3: Replace chart literals only**

Import `PRECISION_PALETTE` into Plotly and Lightweight Charts. Preserve every margin, axis option, range, transition, series setting, and lifecycle branch.

- [ ] **Step 4: Replace formatter and legend literals**

Map TWE, uPnL, entry price, live status, and Orders legend to shared constants. Preserve all threshold and sign logic exactly.

- [ ] **Step 5: Run the complete Editor suite**

```bash
cd frontend && pnpm exec vitest run src/pages/dashboard_editor
```

Expected: all tests pass, including zoom, generation, fullscreen, and structural contracts.

---

### Task 9: Migrate Dashboard Editor UI and Manager iframe boundary

**Files:**
- Modify: `frontend/src/pages/dashboard_editor/components/PaletteBar.vue`
- Modify: `frontend/src/pages/dashboard_editor/components/LayoutPicker.vue`
- Modify: `frontend/src/pages/dashboard_editor/components/ResizeHandle.vue`
- Modify: `frontend/src/pages/dashboard_editor/components/MultiSelectDropdown.vue`
- Modify: `frontend/src/pages/dashboard_editor/components/widgets/uiClasses.ts`
- Modify: `frontend/src/pages/dashboard_editor/components/widgets/IncomeTable.vue`
- Modify: `frontend/src/pages/dashboard_editor/components/widgets/PositionsManageModal.vue`
- Modify: `frontend/src/pages/dashboard_editor/components/widgets/PositionsConfigPreviewModal.vue`
- Modify: `frontend/src/pages/dashboard_main/App.vue`
- Modify: `frontend/src/pages/dashboard_editor/App.styles.test.ts`
- Modify: `frontend/src/pages/dashboard_main/App.test.ts`

**Interfaces:**
- Consumes: canonical CSS and migrated editor charts.
- Produces: neutral editor chrome, overlays, fills, and loading boundary.

- [ ] **Step 1: Add active-source old-literal assertions**

Reject rendered uses of:

```text
#10141d #333f5c #e8ecf4 #46c88f #e5615c #72a0ee
#a3adc2 #262f45 #4d5c82 #e0a458 #f2f5fb rgba(5, 8, 14
```

Exclude dead metadata colors, zero-alpha values, migration watermark, and inert `pbgui_dialogs.js`.

- [ ] **Step 2: Verify source-contract failures**

```bash
cd frontend && pnpm exec vitest run \
  src/pages/dashboard_editor/App.styles.test.ts \
  src/pages/dashboard_main/App.test.ts
```

- [ ] **Step 3: Correct text-token-as-fill uses**

In PaletteBar, LayoutPicker, ResizeHandle, and MultiSelect, replace text-role fills with Card, Input, or Border roles according to existing purpose. Do not alter geometry or events.

- [ ] **Step 4: Replace visible old overlays and foreground literals**

Use Backdrop, Modal Shadow, Primary Text, and Accent Contrast roles. Do not remove the inert legacy dialog script or unused metadata.

- [ ] **Step 5: Align Manager iframe loading surface**

Use Page or Deep tokens for iframe/loading canvas without changing URLs, visibility, labels, or postMessage behavior.

- [ ] **Step 6: Run Editor and Manager suites**

```bash
cd frontend && pnpm exec vitest run src/pages/dashboard_editor src/pages/dashboard_main
```

---

### Task 10: Validate inheritance-only core pages and contrast

**Files:**
- Modify only for a verified defect: `frontend/src/pages/welcome/App.vue`
- Modify only for a verified defect: `frontend/src/pages/v7_strategy_explorer/App.vue`
- Test: existing Welcome and Strategy Explorer suites

**Interfaces:**
- Consumes: canonical shared baseline.
- Produces: evidence that token-based complex pages inherit without speculative edits.

- [ ] **Step 1: Run both page suites before editing**

```bash
cd frontend && pnpm exec vitest run src/pages/welcome src/pages/v7_strategy_explorer
```

- [ ] **Step 2: Calculate required contrast pairs**

Use a short Node command to verify Primary, Secondary, Muted, Accent, semantic bases, and Danger Soft on Panel, Input, and Elevated. Normal text must be at least `4.5:1`; applicable non-text boundaries at least `3:1`.

- [ ] **Step 3: Audit inherited old palette blockers**

```bash
rg -n '#0d151e|#111c27|#1a2a38|#203344|#263b4d|155 191 255|224 241 255' \
  frontend/src/pages/welcome frontend/src/pages/v7_strategy_explorer
```

- [ ] **Step 4: Apply only evidence-backed corrections**

If tests, contrast, or browser verification identify a selector, make the smallest token substitution and add a focused assertion. Otherwise leave the page files untouched.

---

### Task 11: Update release notes and run the automated gate

**Files:**
- Modify: `releases/unreleased.md`
- Do not modify: `api/serial.txt`

**Interfaces:**
- Consumes: completed migration.
- Produces: release documentation and automated verification evidence.

- [ ] **Step 1: Add the production migration release entry**

Document neutral graphite tokens, inset inputs, ice-blue and semantic ramps, shared chart synchronization, all nine first-wave page families, preserved behavior, and offline assets. Keep the prototype note only if the preview remains tracked as a design reference.

- [ ] **Step 2: Run focused first-wave suites**

```bash
cd frontend && pnpm exec vitest run \
  src/shared/components/visual-tokens.test.ts \
  src/shared/components/AppShell.styles.test.ts \
  src/shared/components/WorkbenchRail.styles.test.ts \
  src/shared/lib/precisionPalette.test.ts \
  src/pages/v7_backtest \
  src/pages/coin_data \
  src/pages/services_monitor \
  src/pages/market_data \
  src/pages/v7_optimize \
  src/pages/v7_strategy_explorer \
  src/pages/welcome \
  src/pages/dashboard_main \
  src/pages/dashboard_editor
```

- [ ] **Step 3: Run the complete frontend gate**

```bash
cd frontend && pnpm run typecheck
cd frontend && pnpm test
cd frontend && pnpm run build
```

Monitor long-running commands to completion.

- [ ] **Step 4: Run representative route contracts**

```bash
python -m pytest \
  tests/test_welcome_route.py \
  tests/test_services_route.py \
  tests/test_market_data_main_route.py \
  tests/test_backtest_route.py \
  tests/test_optimize_route.py \
  tests/test_strategy_explorer_route.py \
  tests/test_coin_data_route.py \
  tests/test_dashboard_main_route.py \
  tests/test_dashboard_editor_route.py \
  -q
```

- [ ] **Step 5: Run final whitespace and old-palette audits**

```bash
git diff --check
rg -n '#0d151e|#111c27|#1a2a38|#203344|#263b4d|#0b111b|#141e2b|#10141d|#46c88f|#e5615c|#72a0ee|155 191 255|224 241 255' \
  frontend/src/styles frontend/src/shared \
  frontend/src/pages/v7_backtest frontend/src/pages/coin_data \
  frontend/src/pages/services_monitor frontend/src/pages/market_data \
  frontend/src/pages/v7_optimize frontend/src/pages/dashboard_main \
  frontend/src/pages/dashboard_editor
```

Review residual matches; do not mechanically edit dead fixtures or provenance comments.

---

### Task 12: Perform production browser verification

**Files:**
- Modify only when a reproducible defect is found: the smallest owning source and focused test.

**Interfaces:**
- Consumes: successful production build.
- Produces: final visual and interaction evidence.

- [ ] **Step 1: Check existing terminals before starting PBGui**

Use an existing healthy process. If none exists, start the documented `python PBApiServer.py` command and monitor until healthy. Do not start a duplicate.

- [ ] **Step 2: Verify desktop routes at `1440 x 900`**

Check authenticated Welcome, Services, Market Data, Backtest V7/V8, Optimize V7/V8, Strategy Explorer V7/V8, Coin Data, Dashboard Manager, and Dashboard Editor. Inspect hierarchy, table states, focus, semantic labels, console errors, 404s, and external requests.

- [ ] **Step 3: Verify `1024 x 768` and `390 x 844`**

Check WorkbenchRail overlay/collapse, table scrolling, dialogs, dropdowns, selection, and action visibility. Do not classify unrelated pre-existing density limits as palette regressions without evidence.

- [ ] **Step 4: Verify Dashboard Editor modes**

Check iframe view, iframe edit, standalone, Plotly fullscreen, Orders fullscreen, teleported dropdown, Manage Positions modal, nested preview modal, and iframe loading transition.

- [ ] **Step 5: Verify computed tokens in parent and editor documents**

```js
({
  deep: getComputedStyle(document.documentElement).getPropertyValue('--color-deep').trim(),
  page: getComputedStyle(document.documentElement).getPropertyValue('--color-page').trim(),
  input: getComputedStyle(document.documentElement).getPropertyValue('--color-input').trim(),
  panel: getComputedStyle(document.documentElement).getPropertyValue('--color-panel').trim(),
  accent: getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim(),
})
```

Expected: exact approved values in both documents.

- [ ] **Step 6: Fix only reproducible defects and rerun owning tests**

Add or update the narrowest useful contract, rerun its page suite, then rerun typecheck and build. Stop for unexpected concurrent changes.

- [ ] **Step 7: Request final code review**

Dispatch a read-only reviewer for the complete diff. Fix all CRITICAL/HIGH and valid MEDIUM findings, rerun relevant tests, and report remaining low-risk observations without expanding scope.

---

## Completion checklist

## Execution record

All implementation tasks and review-fix rounds in this plan are complete. The checkbox steps above are retained as the original execution template; authoritative completion evidence is recorded in the SDD ledger and task reports under `.superpowers/sdd/2026-08-28-pbgui-precision-terminal-production/`.

- Tasks 1-3: shared token contracts, canonical CSS, RGB aliases, and static palette bridge complete and reviewed.
- Tasks 4-7: Backtest, Coin Data, Services Monitor, Market Data, and Optimize migrations complete and reviewed.
- Tasks 8-9: Dashboard Editor charts/UI and Dashboard Manager iframe boundary complete and reviewed.
- Task 10: Welcome and Strategy Explorer inheritance validation complete; no speculative source edits made.
- Task 11: typecheck, final full Vitest, build, representative route contracts, and release documentation complete.
- Task 12: existing-server HTTP/resource/source verification complete; authenticated interactive browser automation remains unavailable in this repository.
- Whole-branch review fixes: complete; shared RGB contracts, page effects, deterministic chart series colors, and recursive Dashboard Editor audit complete and reviewed.

- [x] Implementation and review-fix rounds complete.
- [x] Automated verification complete.
- [x] Browser/resource limitation documented.
- [x] Ready for final whole-branch review and requested Commit & Push.

- [ ] CSS and TypeScript palettes match the approved design.
- [ ] Legacy and RGB aliases are synchronized.
- [ ] Shared shell and controls contain no active old blue-black/blue-white effects.
- [ ] All nine core page families are migrated or verified as inheritance-only.
- [ ] Backtest and Dashboard Editor charts use the shared palette.
- [ ] Dashboard Editor modes and iframe loading are verified.
- [ ] Focus, text, and semantic contrast pass.
- [ ] Full typecheck, Vitest, build, and route tests pass.
- [ ] Browser verification passes at all three viewports.
- [ ] `releases/unreleased.md` is accurate and `api/serial.txt` is unchanged.
- [ ] No commit was created without explicit user instruction.
