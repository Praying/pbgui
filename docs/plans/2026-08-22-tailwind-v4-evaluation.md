# Tailwind CSS v4 Adoption Evaluation — PBGui Frontend

**Date:** 2026-08-22
**Status:** Proposed — recommendation awaiting maintainer approval
**Method:** Repository audit (styling inventory, gates, constraints) + Tailwind v4 release research + structured decision interview with the maintainer

## 1. Recommendation

Adopt **Tailwind CSS v4 (latest stable line, currently 4.3.x)** as the token-bound utility layer for the Vue frontend, with **full migration of existing page styles** as the goal. This revises the approved 2026-08-20 frontend-redesign design doc, which currently scopes Tailwind to *new Vue pages only* ("Tailwind Spike before broad adoption … use Tailwind only for new Vue page layout, spacing, responsive behavior"). Under the revision, the Spike remains mandatory as the validation gate, but adoption is no longer capped at new code.

Execution shape: governance pre-work → throwaway Spike → `balance_calc` pilot module → small-to-large batch migration → gated areas (`dashboard_editor`, `v7_backtest`) last. AI-led (Claude Code) with per-module acceptance on a single integration branch.

The two motivations behind this evaluation are **visual consistency** and **AI-collaboration ergonomics**; both are strongly served. See §4.

## 2. Fact base (repository audit)

Stack and styling inventory as measured on this branch (2026-08-22):

- Vue 3.5.13, Vite 6.1.0 MPA (26 page entries under `src/pages`), strict TypeScript, npm, `node >=22` (CI pins node 22).
- **No component library, no CSS preprocessor, no atomic-CSS tool, no postcss config.** Exactly one `:deep()` usage repo-wide. There is no UI-library override burden — historically the main Tailwind friction point.
- Styling inventory:
  - Global layers: `src/styles/tokens.css` (150 lines, mature token system incl. spacing `--sp-*`, semantic color families with `-soft`/`-bg` variants, radii, shadows, motion, z-index, legacy aliases `--bg`/`--green`/…), `base.css` reset (183 lines), `components.css` semantic component classes (906 lines, ~60 classes: `.btn*`, `.panel`, `.card`, `.badge*`, `.modal*`, `.toast*`, …).
  - Page-level: 28 `.css` files under `src/pages`, **12,505 lines** (largest: `welcome` 1,536, `coin_data` 1,173, `api_keys_editor` 1,121, `v7_backtest` shell 1,071).
  - SFC `<style>` blocks: 30 files / ~3,313 lines (26 scoped, 4 unscoped).
- Usage patterns: 4,765 template `class` attributes, of which ~131 (~2.8%) are utility-style; **576 inline `style=` attributes** (dynamic styling happens inline today); CSS `v-bind()` unused.
- Theme: single dark theme hardcoded in `:root`; token structure deliberately shaped so a future light/alternate theme needs no page-level rewrites (stated redesign goal).
- Gates: `vue-tsc --noEmit` → `vitest run` → build (CI + local); sha256-frozen digests for `dashboard_editor/styles/editor.css` and `widgets.css`; postcss structural assertions for `v7_backtest/styles/backtest-shell.css`; Python i18n parity test.
- Hard constraint: fully offline operation — no CDN, remote fonts, or runtime network dependencies (AGENTS.md rule).
- Bundle budget: Rollup's default 500 kB chunk warning; `manualChunks` isolates the three i18n dictionaries. No stricter custom limit.
- Governance debt: `AGENTS.md` ("Frontend: Vanilla JS + HTML … no Tailwind/Bootstrap", "CSS: … no Tailwind/Bootstrap") and `.github/copilot-instructions.md` still carry pre-migration wording and must be revised before any Tailwind dependency lands.

## 3. Tailwind v4 fact sheet (external research, 2026-08-22)

- Latest stable **v4.3.3** (2026-07-16); active minor line since v4.0 (2025-01). v4.3 adds scrollbar utilities, `@container-size`, stacked/composite `@variant`; **v4.3.3 fixes CJK font matching by `lang` on Windows** (directly relevant to this project's zh locale).
- Integration: official `@tailwindcss/vite` plugin + one-line `@import "tailwindcss"` in CSS. Zero runtime; pure build-time CSS output — **offline constraint satisfied by construction**.
- CSS-first config: `@theme { … }` declares design tokens and **emits them as native CSS custom properties on `:root`** — a native fit for promoting `tokens.css` to a single definition point.
- Browser baseline: Chrome 111+, Safari/iOS 16.4+, Firefox 128+; no legacy degradation path (core features rely on `@property`, `color-mix()`). Maintainer accepted baseline: modern Chromium of roughly the last two years.
- Known frictions: inside scoped `<style>` blocks `@apply` needs an `@reference` declaration (recommended escape: consume `var(--token)` directly, which is also faster); runtime-concatenated class names are invisible to the source scanner (rule: write complete class names or lookup maps; `@source inline("…")` replaces v3 safelists).
- Performance (official benchmarks): full builds ~100 ms scale, incremental rebuilds µs–ms scale — beneficial for the 26-entry MPA dev loop.
- No official v4-vs-v3 output-size figure exists; per-page on-demand utility CSS is expected in the tens-of-KB range — **to be measured, not assumed, in the Spike**.

## 4. Benefits analysis

### 4.1 Visual consistency (primary motivation)

- **Single token source.** With `@theme` promoted to the sole token definition point (D4), utilities cannot drift from tokens because they *are* tokens: a spacing/color/radius utility resolves to the same CSS custom property every remaining stylesheet consumes. Today the token file is authoritative but adherence is manual — 12.5K lines of page CSS and 576 inline styles still carry free-form literals.
- **Migration converts the drift surface.** The bulk of page-level CSS is layout/spacing/shadow boilerplate written against ad-hoc values. Converting it to token-bound utilities is where consistency is actually won; what remains per page is genuinely component-specific rules.
- **Theme readiness.** Because everything routes through emitted custom properties, a future light/alternate theme remains a token-level change — preserving an explicit goal of the approved redesign doc.

### 4.2 AI collaboration (secondary motivation)

- Utilities are self-describing in templates: editing a Vue SFC no longer requires resolving semantic class definitions spread across `components.css` and page stylesheets before acting; authoring and review happen in one file.
- Token-bound utilities constrain generation: the model cannot invent hex values or off-scale spacing — its vocabulary is the `@theme` surface. This converts "AI makes visually inconsistent choices" from a review problem into a structural impossibility.
- CSS→utility conversion is deterministic, per-file, mechanically verifiable work — well suited to AI-led batch execution with module-level acceptance (the agreed execution model, D7).
- The complete-class-name discipline keeps AI-authored markup statically scannable.

### 4.3 Maintainability and dead-code hygiene

- On-demand generation: removing a class from a template removes its CSS at the next build — no orphaned selectors. The current semantic-class model requires manual reference audits for the same guarantee.
- Migration doubles as a forced audit of every page stylesheet; sha256 frozen digests force each touched legacy-ported file through an intentional, reviewed re-freeze.

### 4.4 Build and delivery

- Faster CSS rebuilds across the MPA dev loop; zero runtime cost.
- Expected net bundle effect neutral-to-positive once deleted page CSS outweighs added utility CSS — measured in the Spike against the 500 kB chunk threshold, not assumed.

### 4.5 Ecosystem trajectory

- Mature, actively maintained v4 line with a first-class official Vite plugin; no announced v5 roadmap, giving 4.x a long runway.
- Natural pairing with the redesign doc's headless-interaction direction (Reka UI candidate) and future `App*` primitives: headless provides behavior, tokens provide skin, utilities provide composition.

## 5. Costs and risks

| Risk | Mitigation |
|---|---|
| Migration effort: ~12.5K lines page CSS + ~3.3K SFC styles | AI-led, module-by-module; velocity calibrated empirically by the `balance_calc` pilot rather than pre-committed estimates |
| Dynamic class concatenation invisible to scanner | Coding rule: complete class names or lookup maps; documented `@source inline()` exceptions (576 inline `style=` sites show dynamic styling is common today) |
| Scoped-block `@apply` needs `@reference` | Coding rule: prefer `var(--token)` in scoped styles; `@apply` discouraged |
| Frozen digest tests break on touch | Intentional re-freeze with visual walkthrough, scheduled late (Phase 4) when conversion conventions are mature |
| No-Preflight border behavior: width-only utilities assume a normalized `border-style`/`border-width` base | Spike verifies; if needed, add the minimal normalization rule to `base.css` and walk visual regression once |
| Browser baseline raise (Chrome 111+/Safari 16.4+/Firefox 128+) | Accepted by maintainer: modern Chromium ≈ last two years; PBGui is a self-hosted operations console |
| Node/toolchain interaction (repo previously hit a Node 26 jsdom issue) | Tailwind is build-time only (node ≥20; CI runs 22) and emits static CSS — vitest/jsdom paths unaffected |
| Half-adoption state | Retained rule: Spike failure ⇒ complete removal, no residual dependencies |
| Governance debt (AGENTS.md / copilot-instructions say "no Tailwind") | Revised in Phase 0, before any dependency lands |

Cost note: the effort figure is deliberately not estimated up front; the pilot exists to produce that number.

## 6. Decision record (maintainer interview, 2026-08-22)

| # | Decision |
|---|---|
| D1 | Adopt Tailwind v4 latest stable (4.3.x); evaluation framed against the whole 4.x line, not a specific minor |
| D2 | Full migration of existing page styles is the goal; revise the 2026-08-20 design doc accordingly; Spike retained as validation step whose failure removes Tailwind entirely |
| D3 | **No Preflight.** `base.css` remains the project reset; import only theme + utilities layers |
| D4 | `@theme` becomes the single token definition point; emits same-name CSS variables consumed by all pages, including legacy aliases (`--bg`, `--green`, …) |
| D5 | Visual upgrade is in scope and paired with migration, grounded in the token system as it exists in current HEAD code (not anchored to the 2026-08-20 commit narrative) |
| D6 | Pilot = `balance_calc` (207-line stylesheet); afterwards small→medium→large; `dashboard_editor` and `v7_backtest` (gate-sensitive) last |
| D7 | Execution: AI-led (Claude Code), per-module acceptance, single integration branch merged back once all modules pass |
| D8 | Acceptance per module: typecheck/test/build green + key-page visual walkthrough; frozen digests re-frozen deliberately where touched |
| D9 | Browser support target: modern Chromium of roughly the last two years |
| D10 | Offline constraint preserved: build-time only, no CDN/remote fonts |

Open item flagged for maintainer veto during review of this document (not separately interviewed): **disposition of `components.css`.** Recommendation: retain it as the shared semantic component-primitive layer (~60 high-reuse classes; converting shared components to repeated utility strings would violate DRY) and align it with the planned `AppButton`/`Panel`/etc. primitives; page-level stylesheets are the utility-first battleground. "Full migration" therefore means: page CSS + SFC styles convert; the shared semantic layer persists as a deliberate component tier.

## 7. Roadmap

**Phase 0 — Governance pre-work (before any dependency):**
Revise `AGENTS.md` stack/CSS rules, `.github/copilot-instructions.md`, and the 2026-08-20 design doc's styling section (new-pages-only → full migration with Spike-first validation). Record the D-decisions.

**Phase 1 — Spike (timeboxed, throwaway):**
Install `tailwindcss` + `@tailwindcss/vite`; create a scratch theme file mapping the HEAD token system via `@theme`; exercise a scratch component. Verify:
1. No conflict with `base.css`/`components.css` without Preflight;
2. Token-bound utilities emit correct values (spacing/colors match `tokens.css`);
3. Offline build works; measure per-page utility CSS size vs. deleted page CSS against the 500 kB threshold;
4. Border-utility behavior without Preflight; decide on the minimal `base.css` normalization rule;
5. `var(--token)` consumption from scoped styles.
Exit: pass → proceed; fail → remove entirely, document why.

**Phase 2 — Pilot module: `balance_calc`:**
End-to-end conversion (207-line stylesheet + SFC styles) through the full acceptance loop. Output: calibrated velocity number and a written per-module conversion SOP (including the dynamic-class and scoped-var rules).

**Phase 3 — Batch migration, small→large (order by measured size):**
`vps_monitor` (46) → `jobs_monitor` (77) → `v7_optimize` (122) → `db_tools` (142) → `balance_calc` done in Phase 2 → `hl_data_actions` (463) → `help` (491) → `v7_edit` (469) → `v7_run` (492) → `vps_manager` (511) → `market_data` (~1,974 across 8 files) → `v7_strategy_explorer` (651) → `v7_pareto_explorer` (1,091) → `api_keys_editor` (1,121) → `coin_data` (1,173) → `welcome` (1,536).

Per-module loop: migrate → `vue-tsc`/`vitest`/build → key-page visual walkthrough → commit on the integration branch → next module.

**Phase 4 — Gated areas:**
`dashboard_editor` (sha256 re-freeze ×2 with visual diff), `v7_backtest` (update postcss structural assertions), then settle the `components.css` disposition (see §6 open item) and retire transition shims.

**Phase 5 — Closure:**
`tokens.css` fully superseded by the `@theme` source (or reduced to a generated alias shim if non-Vue consumers require it); final doc updates; changelog; single merge of the integration branch.

## 8. What would falsify this recommendation

- Spike cannot reconcile Tailwind output with the frozen-gate/offline/bundle constraints even without Preflight;
- Pilot velocity implies a total effort wildly out of proportion to the benefits above;
- A discovered hard dependency on runtime-generated class names that cannot be expressed as complete class strings or maps.

Any of these triggers the removal branch (D2) with no residual half-adoption.

## Appendix A — page-level stylesheet inventory (measured 2026-08-22)

| Module | Lines | Notes |
|---|---|---|
| welcome | 1,536 | largest single file |
| coin_data | 1,173 | |
| api_keys_editor | 1,121 | |
| v7_backtest | 1,071 | postcss structural test |
| market_data (8 files) | ~1,974 | panels-* split |
| v7_pareto_explorer (2 files) | 1,091 | |
| v7_strategy_explorer | 651 | |
| vps_manager | 511 | |
| help | 491 | |
| v7_run | 492 | |
| v7_edit | 469 | |
| hl_data_actions | 463 | |
| dashboard_editor (2 files) | 752 | sha256-frozen ×2 |
| balance_calc | 207 | pilot |
| db_tools | 142 | |
| v7_optimize | 122 | |
| jobs_monitor | 77 | |
| vps_monitor | 46 | |
| cluster_sync | 3 | |
| logging_monitor | 1 | |

Globals outside pages/: `tokens.css` 150, `base.css` 183, `components.css` 906.

## Appendix B — external sources

- Tailwind v4 release post (2025-01-22): https://tailwindcss.com/blog/tailwindcss-v4
- v4.1 post: https://tailwindcss.com/blog/tailwindcss-v4-1 ; v4.3 post: https://tailwindcss.com/blog/tailwindcss-v4-3
- Release index (v4.3.3, 2026-07-16): https://github.com/tailwindlabs/tailwindcss/releases
- Vite installation guide: https://tailwindcss.com/docs/installation/using-vite
- Browser compatibility: https://tailwindcss.com/docs/compatibility
- Detecting classes in source: https://tailwindcss.com/docs/detecting-classes-in-source-files
- Upgrade guide (`@reference` in scoped styles): https://tailwindcss.com/docs/upgrade-guide
- Vue SFC CSS features: https://vuejs.org/api/sfc-css-features.html
