# Unreleased

## Frontend - Precision Engineering Visual Tokens

- Established the shared deep blue-grey surface hierarchy and precision-engineering semantic colors for Vue workbench pages, including panel/elevated shadows and accent-based focus treatment. Preserved legacy aliases and the offline Space Grotesk font setup, with a focused token contract test.

## Cluster Sync — Localization

- Localized the Cluster Sync page's remaining hardcoded field labels, table headers, retention and sync-mode options, and node-count text through the shared English and Simplified Chinese dictionaries. API behavior and data rendering remain unchanged.

## Frontend — Unified Typography Scale

- Unified the Vue and legacy frontend pages around one shared type scale: 12px captions, 14px secondary/control text, 15px body text, 16px emphasized labels, 19px section headings, 23px page-level headings, 26px titles, and 34px display headings. Existing font families, weights, line heights, spacing, colors, control dimensions, behavior, and API contracts remain unchanged.

## PBv7/PBv8 Backtest — Typography Scale

- Improved the backtest configuration page's type hierarchy through the shared frontend font-size scale: labels and helper text now use 12px, controls and actions 14px, body/table text 15px, and section headings use the shared 19px section size. The change is limited to font sizes and does not alter layout, spacing, colors, control dimensions, or behavior.

## PBv7/PBv8 Backtest — Color Palette

- Recolored the backtest workspace with a page-local deep navy/slate palette: the page, rail, toolbar, panels, inputs, borders, and text now have clearer surface separation and contrast without changing layout, typography, spacing, or behavior. Ice blue consistently marks selection and primary actions, while green is reserved for success and execution actions such as Save & Queue.
- Kept Plotly results charts aligned with the backtest workspace by updating their background, text, grid, and comparison-series colors to the same palette. Other frontend pages retain their existing theme.

## Dashboard Manager — Workspace Redesign

- Refined the Dashboard Manager into a clearer library-and-canvas workspace: the dashboard list now has stronger active, selected, hover, and keyboard-focus states; the command strip gives New Dashboard clear priority; and the empty/loading canvas uses a layout-matched skeleton treatment instead of a generic spinner.
- Unified the new-dashboard and delete-confirmation dialogs with the shared graphite visual system, added explicit dialog semantics and labelled iframes, and polished the draggable templates window without changing dashboard APIs, selection behavior, or iframe messaging contracts.
- Added a distinct library heading, active-workspace header, view/edit state indicator, direct empty-state create action, and grouped routine versus destructive controls while preserving resize handling and existing DOM contracts.

## Frontend Tooling — pnpm Migration

- Switched the frontend workspace (`frontend/`) from npm to pnpm: `package-lock.json` is replaced by `pnpm-lock.yaml`, and the toolchain is pinned via the `packageManager` field in `frontend/package.json`. `postcss` (used directly by the CSS-contract tests) is now an explicit devDependency instead of an implicit npm-flat transitive one.
- The `frontend-ci` workflow installs with `pnpm install --frozen-lockfile` and caches via pnpm (`pnpm/action-setup` reads the pinned version). The missing-build error hints on Vue routes, the matching route-test assertions, README/AGENTS instructions, and the migration-watermark build comment now say `pnpm run build` instead of `npm run build`.

## Run Editor — PBv8 Edit Page Panel Redesign

- Reworked the shared PBv7/PBv8 run editor (reached from Run → "Add PB8 instance") into a unified panel column: the form content is capped at 1420px and centred instead of stretching edge-to-edge on wide screens, and every top-level block (Basic — now with its own "Basic Settings" header — Filters, Bot Configuration, plus the collapsible Advanced / Additional Parameters / Raw JSON / Coin Overrides blocks) shares one card chrome and header treatment, replacing the previous mix of a bare grid, underlined titles and expanders. The in-page action sidebar is unchanged.
- The collapsible section headers are now real `<button>`s with `aria-expanded` (keyboard focusable, with a visible focus ring), a Phosphor caret that rotates to the accent colour when open, hover and pressed feedback.
- Form controls gained a proper state layer: a 3px accent focus ring (also on the coin multiselect), hover border emphasis, a muted read-only treatment for the locked v8 config-version field, and tabular figures in numeric inputs; action buttons received pressed feedback.

## Services Monitor — Workers Panel Refresh & Localization

- Deduplicated the Workers panel refresh controls: the page-header Refresh button now refreshes both the service status and the worker status in one go, and the panel's own ctrl-strip refresh button (which previously sat next to it as a second, visually identical button) is gone. Per-worker actions still trigger an immediate refresh after they complete.
- Localized the worker metadata: group names, worker names, types, descriptions, notes, stat labels/values, dynamic summaries ("3 pending, 2 active" …) and the monitor iframe title now resolve through `sysmon.worker*` i18n keys instead of showing the backend's English verbatim. Unknown workers (e.g. ones added on the backend later) fall back to the backend text unchanged, and the English locale keeps the exact backend wording.

## Optimize — Config Editor Tab Bar & Bounds Layout

- Fixed the Optimize "New Config" editor modal: on content-heavy tabs (Bounds / Optimizer / Scoring & Limits) the tab bar was crushed to a sliver with a vertical scrollbar, because its `overflow-x: auto` zeroed its automatic minimum height inside the height-capped flex modal. Pinned the tab bar with `flex-shrink: 0` (explicit on the modal header/footer too), so long tab contents now scroll inside the body while the tab bar stays intact.
- Gave the previously unstyled Bounds tab a proper grid layout: parameter keys get a flexible wrap-anywhere column, the min/max/step inputs are equal-width and aligned across rows, and the fixed checkbox plus delete button sit at the row end. Below 600px each row stacks in two lines (key full-width, then the three inputs with fixed/delete), hiding the range arrow.

## Optimize — Config Editor Modal Polish

- Refined the Optimize "New Config" editor modal: removed the redundant close button in the header (the footer Cancel remains), turned the bare version label into an accent badge, enlarged the title, and gave the editor modal a wider 1100px / 85vh frame so the nine-tab form has room. Added a hover state and transition to the tab bar.

## Strategy Explorer — Polish

- Added hover states (accent border/background shift with a transition) to the Strategy Explorer tab/stage/action buttons, including a danger hover for destructive actions.
- Normalized the floating data-tip tooltip's hardcoded `z-index: 9999` to the `--z-help` token.
- Removed dead `.page-title` CSS: the in-page title is now `sr-only` (the shared WorkspaceHeader owns the visible title), so the legacy title styling, accent bar, and their responsive rules no longer applied.

## Workbench Rail — Toggle Relocation

- Moved the rail collapse/expand toggle from the bottom of the workbench rail into the brand row: when expanded it sits on the right beside the PBGui logo, and when collapsed the logo/name hide and the toggle takes their place, centered. Shared across all Vue workbench pages.

## Backtest — Import Dialog Sizing

- Gave the config-import dialog a fixed readable width (`min(760px, 92vw)`) instead of the generic `fit-content` modal box, and a taller JSON paste area (`min-height: 320px`, `max-height: 60vh`), matching the legacy import dialog proportions.

## Backtest — Results Selection Checkboxes

- Added a visible checkbox column to the backtest results table with a header select-all, so row selection (previously click-only) has an explicit affordance. Rows still support click and click-drag range selection.

## Backtest — TWE Header Tooltip

- Added the missing TWE tooltip to the backtest results table header (the configs list already had it), so the abbreviation is explained on hover via `v7backtest.tweTooltip`.

## PBv8 Backtest — Config List Polish

- Quieted the backtest connection status: the always-on green banner is gone — the header status dot owns the connected state, connection success surfaces as a transient toast, and the full-width strip now appears only on disconnect/error.
- Reworked the configs list for scanability: timestamps render as `YYYY-MM-DD HH:MM` (full ISO kept in the tooltip), the results column reads as a count with `0` greyed out, coin symbols come from the backend `coin_list` (full set on hover), the TWE L/S header carries a tooltip, numeric columns sort by value, zebra striping aids row scanning, and a footer shows the visible total.
- Added a checkbox column with a header select-all, a Delete Selected button that shows its count and is truly disabled when nothing is selected, a per-row Duplicate action (backend `/configs/{name}/duplicate`), and a disabled view-results icon when a config has zero results.
- Merged the configs toolbar into one row: name search, exchange and (v8) strategy filters, visible-count, and select-all/deselect.

## VPS / Logging Navigation Convergence

- Converged the VPS Manager, VPS Monitor, and Logging Monitor pages onto the shared left workbench rail, retiring their legacy in-page sidebars. Each page now maps its view/tab switching to AppShell `sections` (rail children with active-state highlighting): Logging Monitor exposes the Logs/Settings views, VPS Monitor exposes Dashboard/Instances/Services/Logs tabs (its hide-IP/compact/debug-logging toggles moved into an inline options row above the content), and VPS Manager maps its six top-level sections plus the host-scoped Setup/Task-log/Host-logs/PBGui/PB7/PB8-branch/UFW sub-navigation to dynamic rail sections (sub-items appear only while a host context is active, mirroring the old conditional subnav). Removed the now-dead sidebar CSS and updated the parity/page tests to drive the rail sections. Verified: typecheck, production build, full Vitest suite (328 files, 4187 tests).

## DB Tools — Title + Calendar Fixes

- Fixed two regressions on the Vue DB Tools page. (1) The page title/subtitle rendered twice — once in the shared `WorkspaceHeader` and again in the ported legacy `.page-head` block — so the in-page `.page-head` markup and its now-dead CSS were removed; the title now comes only from the AppShell header. (2) The cutoff-date calendar button never opened the legacy `__dp` picker: the shared datepicker's document click-guard hides the panel on the very click that opens it unless the trigger carries `data-dp`, but the Vue button renders a Phosphor `<svg>`, so `event.target` had no `data-dp` and the guard ran `hide()` immediately after `show()`. The handler now stops propagation and anchors on the button (`event.currentTarget`) instead of the svg. Added regression tests for both. Verified: typecheck, production build, full Vitest suite (328 files, 4187 tests).

## Backtest Results Panel — Scroll Fix

- Fixed the PBv7/PBv8 backtest results panel clipping its charts with no scrollbar. During the Vue migration the `ResultsPanel` root `<div>` became an extra box between the `#panel-results` flex column and `#results-scroll-area`, breaking the height chain: `#results-scroll-area`'s `flex: 1` no longer applied (its parent became a plain block), so the charts grew past the panel and were clipped by `#panel-results`'s `overflow: hidden`. The root element now carries `results-panel-root` with `display: contents`, restoring `#results-fixed-top` and `#results-scroll-area` as direct flex children of `#panel-results` exactly as in the legacy DOM, so the pinned scroll area fills and scrolls again. Added a CSS contract test locking the boxless wrapper and the scroll-area flex/overflow declarations. Verified: typecheck, production build, full Vitest suite (328 files, 4185 tests).

## Strategy Explorer — Param Slider Fix

- Fixed the PBv7/PBv8 Strategy Explorer tuning sliders not updating their parameter value while dragging. `paramValue` now reads side fields from `config.bot.<side>.*` — the exact path `setParamValue` writes — instead of the stale `snapshot.sides.<side>.params`, so slider/select/bool/text edits reflect immediately through the reactive store instead of only after a server round-trip. The two structures are identical after a snapshot (`sides[side]["params"]` is a deep copy of `config.bot.<side>`), so initial values are unchanged; the aligned `paramValue`/`paramValueFor` signatures drop the now-dead snapshot `params` argument, and a write→read round-trip regression test was added. Verified: typecheck, production build, full Vitest suite (328 files, 4184 tests).

## Typography — Self-hosted Space Grotesk

- Replaced the font stack's macOS-only `Avenir Next` / generic `Segoe UI` lead with a self-hosted Space Grotesk variable font (SIL OFL 1.1, wght 300–700, latin subset) bundled at `frontend/vendor/fonts/` and served at `/app/vendor/fonts/...` by the existing `/app` static mount. `tokens.css` now declares the `@font-face` (with `font-display: swap`) and leads `--font-family` with `'Space Grotesk'`, keeping the existing system CJK fallbacks so Simplified Chinese keeps rendering through the platform faces. This gives the existing `500`/`600`/`650` weight hierarchy a real interpolated weight range instead of rounding to the nearest static system weight, and sets the shared workspace header title to `font-weight: 650`. Font and license only — no palette, markup, JS, or behavior change. Verified: typecheck, production build, and the full Vitest suite (328 files, 4183 tests) pass.

## Frontend Palette — Warm Graphite

- Rebased the entire frontend palette onto a warm-graphite scheme (approved option A of the palette review): surfaces moved from cool blue-gray to neutral warm graphite, the accent refined to `#5b9cf5`, semantic success/warning/danger tones re-harmonized, shadows retinted to the warm ground. Because the palette lives entirely in `tokens.css` ramps, the change is one authoritative token edit plus a mechanical sweep of fallback literals, Plotly JS color constants (with their test expectations), the favicon, and legacy HTML `:root` accents; red/green trading semantics, i18n, and layout are unchanged. Verified: typecheck, full Vitest suite (zero regressions vs. the clean-tree baseline), production build.

## Legacy CSS Token-Drift Fixes

- Closed the remaining drift between the legacy fallback stylesheets and the shared design tokens (Tier 1 of the redesign audit). `frontend/css/backtest_shell.css` now forwards `--border`/`--orange`/`--blue`/`--font` to the token ramps instead of re-encoding raw hex, replaces the foreign `#1f77ff` running badge/button/toast blue with the accent ramp, and uses `--accent-deep` fills for `.modal-btn-primary`/`.toast-info` to restore AA text contrast. `frontend/css/app.css` drops the off-family `#30333f` mauve job-card hover for an accent-tinted hover and switches the danger button to a `--danger-deep` fill with a consistent brightness hover (was raw white text + an inverting hover); `frontend/css/sidebar.css` accent buttons use `--accent-deep`. The fixed `100vh` viewport heights in `backtest_shell.css`, `sidebar.css`, and `modals_shared.css` moved to `100dvh`. CSS-only — no markup, JS, or behavior change.

## Frontend Visual Unification

- Consolidated the frontend palette onto the shared semantic tokens: extended `frontend/src/styles/tokens.css` with deep/soft ramp stops, `-rgb` channel companions, `--accent-contrast`, `--bg-backdrop`, and `color-scheme: dark`; a repeatable codemod (`frontend/codemod_colors.py`) redirected ~1100 hardcoded hex/rgba literals across all Vue page styles, legacy `css/`, and legacy HTML `<style>` blocks into the accent/success/warning/danger/text/surface token families, retiring the drifted blue variants and the off-palette teal accent while preserving categorical colors.
- Redesigned the shared navigation chrome (`frontend/pbgui_nav.js`): injected CSS fully tokenized, emoji action/dropdown icons replaced by a stroke SVG icon set (bell, shield-alert, book, info, chevron, and 17 page icons shared by the PBv7/PBv8 menu pairs), logo colors bound to tokens, and alert/confirm/about overlays aligned to the tonal surface language.
- Reworked the root login page: a visible submit button with pending state and duplicate-submit guard, brand-accent focus ring (was teal), a surfaced card with accent rail over an ambient page glow, larger controls, and new `misc.login.submit`/`misc.login.signingIn` i18n keys with Vitest coverage.
- Unified shared component styling: merged the duplicated `.btn`/`.pbgui-btn` definitions, switched toasts to the tonal badge language, shared the modal backdrop token, and added global `accent-color`/`caret-color` defaults; the jobs monitor and legacy sidebar/button styles were brought onto the same token system.
- Legacy pages now link `/app/src/styles/tokens.css` and forward their local `:root` aliases to the canonical palette; all 44 page entries gained the new `favicon.svg`.
- Fixed pre-existing styling bugs: an undefined `var(--radius)` in the strategy explorer, an invalid `var(--success)22` declaration in the API keys editor, and a dead duplicate `:root` block in the Welcome styles.
- Verification: typecheck, production build, i18n parity, and the full Vitest suite pass with zero regressions against the clean tree (the 18 failing files are the known Node localStorage environment issue); the two frozen dashboard-editor CSS digests were re-frozen per their documented convention.

## Upstream Release Sync

- Prepared the origin/main v1.98.24-v1.98.28 release changes for the Vue migration branch, including PB8 instance/VPS update behavior, deployment scripts, legacy compatibility updates, Pareto metric metadata, release notes, and regression coverage.

## Frontend Redesign Planning

- Standardized reachable Vue loading, empty, and error branches with shared semantic state components, visible status copy, retry actions where existing loaders support them, reduced-motion-safe skeletons, responsive shell checks, and explicit rail control semantics without changing API or composable behavior.

- Migrated the Jobs, Logging, VPS Manager, VPS Monitor, Cluster Sync, and Services Monitor Vue operations pages to the shared AppShell and text-backed StatusStrip, removed their Vue-only legacy topnav bootstrap, aligned full-height responsive workspaces, and replaced legacy control glyphs with accessible local Phosphor icons while preserving live updates, polling, log viewers, confirmations, deployment and credential boundaries, cluster actions, and service controls.

- Migrated the seven core Vue workbench pages (Welcome, Run, Optimize, Backtest, Edit, Strategy Explorer, and Pareto Explorer) to the shared AppShell and workbench rail, replaced page-local symbol controls with accessible Phosphor icons, retained local workspaces/status/help behavior and route-specific PBv7/PBv8 semantics, and removed their Vue-only legacy topnav bootstrapping.

- Made the shared AppShell supporting column stack below primary content on narrow screens and restored the shared skeleton shimmer animation with reduced-motion compatibility.

- Established the shared Vue dark-terminal foundation with a typed PBGui route model, collapsible and keyboard-accessible workbench rail, semantic application shell and workspace header, accessible text-backed status strip, cool-Morandi design tokens, and shared icon/button/loading/empty/error primitives while preserving legacy token aliases and frozen dashboard editor styles.

- Added the approved implementation plan for the PBGui dark professional trading-terminal redesign: shared cool-Morandi tokens and shell, collapsible workbench rail, local Phosphor icon system, staged Vue page-family migration, responsive/accessibility states, legacy fallback alignment, and verification gates that preserve API, route, i18n, offline, and frozen-CSS contracts.

- Documented the approved Open Design direction and implementation plan for a denser shared PBv7/PBv8 Backtest configuration workbench, including responsive long-label protection, advanced-execution disclosure, aligned Long/Short controls, per-side JSON disclosure, localization, guide coverage, and verification gates without changing config or API behavior.

- Documented the approved PBGui frontend redesign: Vue 3 MPA continuation, Tailwind/headless/icon Spikes, semantic dark design system, and staged Dashboard, logging, and services-monitor migration with API, authentication, i18n, offline, and legacy-fallback compatibility preserved.

## Frontend Redesign Verification

- Resolved final Vue migration review blockers by keeping the collapsed mobile rail in normal flow without a workspace gap, removing nested main landmarks, completing shared legacy and Vue action icons with accessible Phosphor controls, localizing API-key profile controls, and preventing Market Data settings responses from exposing stored AWS credentials while preserving body-only credential updates.

- Completed the final Task 8 regression verification: the full Vue test suite (1,456 suites, 4,172 tests), frontend typecheck, and production build pass; changed Python modules pass compilation, while Python pytest verification remains unavailable because pytest is not installed in the environment. The final redesign includes the required Market Data AWS credential-response privacy fix and serial bump to 2231, has no generated dist or secret artifacts, preserves frozen dashboard CSS, and keeps existing unrelated AGENTS.md and plan deletion changes outside the redesign staging set.

- Aligned the legacy fallback navigation with the Vue workbench icon language using an allowlisted local Phosphor Regular SVG factory, escaped accessible labels, explicit unknown-icon rejection, and cache-busted offline helper loading while preserving routes, cookie authentication, placeholders, help, language, restart, about, and responsive behavior.

- Fixed the Task 6 collapsed mobile WorkbenchRail layout so its keyboard-accessible expand control remains visible within the 64px brand row, with focused responsive stylesheet coverage and unchanged expanded drawer, focus, and reduced-motion behavior.

- Completed the compatible Task 5 supporting-page shell migration: Coin Data, DB Tools, Balance Calculator, API Keys, Market Data, Help, and Dashboard Manager now use the shared AppShell/StatusStrip without legacy topnav bootstrapping; preserved selection/drag-select, dates, job history, iframe sizing, help sanitization/deep links/EN-DE behavior, dashboard postMessage parity, authentication, and credential reveal cleanup, with Phosphor accessible controls and no private-key reveal affordance. HL data-actions, market-data status, dashboard templates, root login, and dashboard editor remain specialized embedded/standalone boundaries by design.

- Completed the remaining Task 5 supporting-page shell pass: Help uses AppShell with accessible Phosphor controls, while HL data-actions, market-data status, dashboard templates, login, and dashboard editor retain their tested iframe/fragment/standalone boundaries and existing auth, route, sanitization, postMessage, and parity contracts.

- Added focused Backtest config-editor regression coverage for all trading steppers, including Phosphor icons, contextual accessible names, declared numeric bounds, and disabled fee inputs; fixed the maker/taker controls to honor their existing `0` to `0.01` range.

- Fixed the remaining Task 3 review findings in the Backtest and Optimize workbenches: symbol-prefixed actions now use clean i18n labels with decorative PbIcons, numeric steppers expose contextual native-button labels, and CoinMultiSelect uses keyboard-accessible semantic buttons without changing values or layout.

- Completed the remaining Task 3 core-workbench icon migration across Backtest and Optimize child controls, replacing rendered action glyphs with decorative Phosphor icons while preserving labels, events, layout, and bilingual semantics, and adding accessible names plus focused icon assertions for icon-only controls.

- Fixed Task 3 review findings in the migrated PBv7/PBv8 workbenches: AppShell remains the only main landmark, inner workbench containers are non-landmark elements, and Backtest/Optimize action labels render separate decorative Phosphor icons with focused visible-text and SVG assertions.

- Completed the Task 7 verification pass: frontend typecheck and production build pass, affected Vue page suites pass with isolated Node 26 localStorage, affected Python route/i18n tests pass, and GitNexus reports a low-risk documentation-only uncommitted scope.

## Frontend Bundle Size

- Split the English, Simplified Chinese, and server-message dictionaries into separate Rollup chunks so the shared frontend runtime and every generated asset remain below the 500 kB minified chunk warning threshold.

## Upstream Sync / Vue 3 Compatibility

- Merged the `origin/main` v1.98.7–v1.98.23 release fixes into the Vue 3 migration branch and adapted the affected Backtest, Run, Optimize, and VPS Manager behavior to the active Vue pages, including progressive result loading, PB8 runtime warnings, schema-compatible host selection, migration review drafts, canonical PB8 Run handoffs, and runtime-qualified PB8 metric history.

## Internationalization (English / Simplified Chinese)


- Web console UI now supports English (default) and Simplified Chinese.
  - Browser language auto-detection (`zh*` → Chinese), manual switch button in the top navigation bar (and on the login page), persisted per browser via `localStorage['pbgui-lang']`; switching reloads the page.
  - New lightweight i18n engine `frontend/i18n.js` (`window.PBGuiI18n`: `t()`, `setLang()`, `toggleLang()`, `translateDom()`, `serverMsg()`); dictionaries `frontend/i18n/en.json` and `zh.json` with semantic keys; `data-i18n*` attributes for static markup.
  - All 36 console pages, shared JS modules, navigation bar, dialogs, toasts, alert overlay, and confirmations translated; `PBGuiI18n.serverMsg()` maps known server-side English error messages to Chinese and falls back to the original text.
  - Kept untranslated: user data, log content, config field names, and established abbreviations/terms (PNL, TP/SL, API, SSH, VPS, …); help guides remain EN/DE.
- Added `tests/test_i18n.py` enforcing en/zh key parity, non-empty translations, well-formed server message map, and that every key referenced by pages/scripts exists in both dictionaries.
- Updated `AGENTS.md` language convention accordingly.

## Vue 3 Frontend Migration (continued)

- Fixed the standalone Dashboard editor color contrast by loading the shared theme tokens and base form styles, making dashboard names, layout controls, widget palette items, empty-cell hints, and grid actions readable in dark mode.

- Refined the migrated PBv7/PBv8 Backtest config editor visual hierarchy: added a responsive section-card layout for basics, capital/execution, market data, coin filters and bot settings; introduced a 12-column desktop field grid, a single clean exchange selector without duplicate labels/actions, clearer section guidance, grouped sidebar actions, a dedicated filter action, and an independently scrollable editor while preserving the existing config bindings and handoff behavior; removed duplicate icon prefixes throughout the Backtest and Optimize submenu actions, including New Config, Delete Selected, Backtest, Compare, archive maintenance and editor actions.

- Implemented a denser shared PBv7/PBv8 Backtest configuration editor with accessible Advanced execution settings and per-side Full Config JSON disclosures, aligned Long/Short comparison controls, and medium-width protection for long technical labels, without changing config or API behavior.

- Repaired the migrated PBv7/PBv8 Backtest config editor: restored the legacy compact grid, searchable tag dropdowns, numeric steppers and explicit expanders; restored JSON import plus Results, Convert to V8, Add to Run, Strategy Explorer, Balance Calculator and OHLCV readiness handoffs; saved-config-only actions remain disabled for unsaved configs. Added focused Vue and stylesheet regression coverage.

- Refined the Vue Welcome page visual hierarchy: the overview now offers a direct PB7 setup action, groups runtime checks by Security/PB7/optional PB8/Node, removes duplicate sidebar status pills, uses neutral styling for optional PB8, constrains wide layouts, and gives password changes a focused form with a separate authentication-disable danger area. The shared Vue migration watermark is now off by default and can be enabled only with `VITE_MIGRATION_WATERMARK=on` during migration QA.

- Migrated the Logging Monitor to the Vue 3 workspace (`frontend/src/pages/logging_monitor`): the shared live `LogViewerPanel` with rotated-generation switching, explicit purge confirmation, default/managed/per-log rotation settings, apply feedback, shared help/nav integration, Escape cleanup, and focused Vitest coverage. `GET /api/logging/main_page` now serves the Vue build first with `frontend/logging_monitor.html` retained as the cookie-only legacy fallback; added route coverage and bumped `api/serial.txt`.
- Migrated the Shared Jobs Monitor to the Vue 3 workspace (`frontend/src/pages/jobs_monitor`): live cookie-authenticated WebSocket updates with polling fallback, active/done/failed history tabs, URL exchange/job-type filters, safe job detail/log modals, explicit action confirmations, distributed Bitget downloader summaries with log fallback, embedded Services Monitor routing, and legacy fallback support; added route and Vitest coverage and bumped `api/serial.txt`.
- Migrated the VPS Monitor to the Vue 3 workspace (`frontend/src/pages/vps_monitor`): cookie-authenticated live VPS state, dashboard metrics and monitor-agent health, instance/service actions, metric-history charts, shared `LogViewerPanel` logs, persistent compact/debug settings, safe result rendering, and legacy fallback support; added route and Vitest coverage and bumped `api/serial.txt`.
- Migrated Cluster Sync to the Vue 3 workspace (`frontend/src/pages/cluster_sync`): identity/status overview, setup and self-join controls, node membership/settings/actions, V7 state and tombstones, oplog, credential status/actions, retention policy/report controls, safe confirmation modals, and legacy fallback support; added route and Vitest coverage and bumped `api/serial.txt`.
- Migrated the VPS Manager to the Vue 3 workspace (`frontend/src/pages/vps_manager`): cookie-authenticated overview/context WebSocket, master and VPS detail/setup views, existing-VPS and Cluster-node imports with progress polling, pre-flight and `/etc/hosts` flows, SSH host-key confirmation, password-gated deployments, profile-aware PB7/PB8/PBGui actions and branch tracking, UFW preview/apply, package and task/deploy log surfaces through the shared `LogViewerPanel`, bot metric/error drill-downs, bilingual settings and persisted overview preferences, safe destructive-action confirmation, and legacy fallback support; added route, contract, and Vitest coverage and bumped `api/serial.txt`.
- Completed the Vue 3 migration of `v7_optimize` under `frontend/src/pages/v7_optimize`: route-aware PBv7/PBv8 configuration, Backtest incoming-draft handoff, structured config editing with `_pbgui_param_status` highlighting, metadata-driven scoring/limits, strict PB8 suite-scenario validation, typed editing for previously uncovered `optimize.*` parameters, DEAP↔pymoo field migration and inactive-field cleanup, canonical `optimize.fixed_runtime_overrides`, advanced pymoo/objective-scenario controls, PB8 fine-tune and polish runtime settings, HSL runtime overrides, OHLCV readiness/preload/stop/log monitoring, archive/import/plot/Pareto actions, queue repair/logs/reordering, PB8 migration/checkpoint flows, shared boot/navigation entry, and Vitest coverage. Both optimize routes now serve the shared Vue build first and retain `v7_optimize.html` as the offline fallback.
- Migrated the Coin Data page to the Vue 3 workspace (`frontend/src/pages/coin_data`): sidebar with view switching and the four refresh actions, filters panel with number steppers (dynamic vol/mcap ladder) and a Vue tags multiselect replacing the `editor_shared` controller, the three sortable symbol tables, the draggable/resizable selected-row details card, and the refresh-job busy overlay with progress polling.
- Migrated the Hyperliquid data-actions widget to `frontend/src/pages/hl_data_actions` as a standalone Vue page (still embedded by the Vue market-data page via iframe): both collapsible sections with localStorage persistence, the drag-select coin picker grids (tradfi-only / no-local-data / text-filter combination), native date inputs replacing the inline calendar, inline job monitors over the `/ws/jobs` WebSocket plus history tabs, and the shared log/details modal with iframe-aware viewport sizing. The `__HLDA__` multi-mount prefix machinery is dropped for the Vue build (single instance).
- Both routes serve the built Vue entry first with the legacy `coin_data.html` / `hl_data_actions.html` templates as fallback (`serve_vue_or_legacy_page`); a missing build and template fails with the `pnpm run build` hint. `api/serial.txt` bumped so running UIs show the restart requirement.
- Promoted the market-data drag-select engine to `frontend/src/shared/composables/useDragSelect.ts` as the third consumer (settings + best-1m pickers + the new hl coin grids) instead of a page-local copy.
- Legacy frontend string tests migrated to the Vue sources with verified coverage: `tests/ui/test_hl_data_actions_frontend.py` deleted (filter combination, payload contract, and job-history request order live in the `hl_data_actions` vitest suites), the Coin Data CMC-gating contract in `tests/test_coin_data_api.py` re-pointed at the Vue store/sidebar, and the XSS/visual-contract tests in `tests/test_v7_config_sync.py` re-pointed at the Vue components. Added `tests/test_coin_data_route.py` for the two routes (Vue build, legacy fallback with injections, build hint).
- Migrated the Help & Tutorials page to the Vue 3 workspace (`frontend/src/pages/help`): the page-local help overlay with EN/DE language pills (`help-lang` persistence), topic index TOC with live filter, `?topic=` deep links, DOMPurify-sanitized marked (GFM) rendering through the local `/app/vendor` stack, debounced in-topic search with `<mark>` navigation (Enter/Shift+Enter/up/down/Escape), cross-topic global search with snippet result cards, and the drag/maximize/close chrome including the nav Guide-button re-entry hook (`PBGUI_HELP_OPENER`).
- Help routing: new `GET /api/help/main_page` (beside the `/api/help/*` endpoints) serves the built Vue entry first with `frontend/help.html` as fallback; the legacy file's previously-unfilled placeholders (`%%API_BASE%%`/`%%WS_BASE%%`/`%%VERSION%%`/`%%SERIAL%%`, left literal while it was served statically from `/app/help.html`) are now injected in that fallback. `FASTAPI_PAGES['help']` points at the new route and its dead `?v=` cache-bust is removed. Added `tests/test_help_route.py` (Vue build, fallback injections, build hint).
- Migrated the PBv7/PBv8 Run list page to the Vue 3 workspace (`frontend/src/pages/v7_run`): the diff-based instance table becomes a reactive render pipeline (search/status filters with the active-first sort, status-class/label maps), the WS connection banner with generation-guarded REST snapshots, row actions (edit/add/delete with the per-host summary toast, forced modes with their confirm modals, V8 conversion, balance-calculator handoff with the v8 draft flow), the PB8 update-required host warning, and the backups panel with its confirm overlay. One Vue build serves both `/api/v7/main_page` and `/api/v8/main_page` — the run version is derived from the serving route's path (`config.ts detectRunVersion`), the legacy `run_list_adapter.js` global is not loaded.
- Run page routing: `GET /api/v7/main_page` and `GET /api/v8/main_page` now serve the built Vue entry first with `frontend/v7_run.html` as fallback (the v8 fallback keeps the exact `_render_page` placeholder set, now extracted into `_apply_placeholders` shared by the route); `frontend/v7_run.html` stays in place as that fallback. Added `tests/test_v7_run_route.py` for both routes (Vue build, legacy fallback with v7/v8 injections, build hint).
- Migrated the Welcome page to the Vue 3 workspace (`frontend/src/pages/welcome`): the overview summary/meta pills (bootstrap payload version/serial win over the boot-injected constants, :1414-1415), the runtime status rows and setup issues, login-security warning with acknowledge, the setup form with prefill and the file browser modal, the password section with its authenticated-only gating, and the sidebar resize handle.
- Welcome routing: `GET /api/auth/main_page` serves the built Vue entry first with `frontend/welcome.html` as fallback; the redirect-to-root and passwordless-session logic run unchanged before serving, and the `Referrer-Policy` header and session cookie are set on both branches. Added `tests/test_welcome_route.py` (Vue build, fallback injections, header/cookie preservation, build hint).
- Migrated the Strategy Explorer page to the Vue 3 workspace (`frontend/src/pages/v7_strategy_explorer`, the last v7/v8 module's first page): the six sidebar stages (Analysis / Exchange & State / Raw Config / Simulation / Compare / Movie Builder) with the shared analysis controls, the flavour-dependent PB7/PB8 title-subtitle-chips and simulation-mode collapse, the dual LONG/SHORT tuning columns with segment tabs and slider/select/bool/text param fields writing through `setParamValue` into the config, side statistics with the collapsed Rust debug accordions, Plotly candle/grid/trailing-band figures with the candle-bucket zoom handler (Plotly stays a vendored script global), the exchange/state steppers with market-derived source notes, the Raw Config stage on the shared `PBGuiJsonPanel` global with the 450 ms debounced validate→sync-markets→recalculate flow, the simulation/compare runs with 700 ms progress polling and generation guards, the Movie Builder (duration presets, fills.csv handoff window chooser, animation figure with play/slow/pause + slider, arrow-key stepper, stop/abort, MP4 export with presets/codec options/localStorage persistence), and the v8-only sessionStorage refresh cache (24 h TTL, sensitive-key rejection, 3 MB cap) with the draft-expiry restore path. The inline calendar stays a window global (`lib/datePicker.ts`); i18n keys reused verbatim (579 `v7explore.*` keys, en/zh parity).
- Strategy Explorer routing (dual-flavour like v7_run): `GET /api/strategy-explorer/main_page` and `GET /api/strategy-explorer-v8/main_page` now serve the SAME built Vue entry first with `frontend/v7_strategy_explorer.html` as fallback (the v8 fallback keeps its cookie-only token, empty `result_path`, and request-path-derived API base); the flavour is derived from the serving route's path (`config.ts detectExplorerFlavor`, the twin of v7_run's `detectRunVersion`). Added `tests/test_strategy_explorer_route.py` for both routes (Vue build, legacy fallback with v7/v8 injections, build hint).
- Migrated the API Keys editor page to the Vue 3 workspace (`frontend/src/pages/api_keys_editor`): the user table (filter/sort with `?filter&sort&dir` persistence, keyboard row navigation, credentials/expiry/in-use badges, API-keys meta bar), the create/edit panel with legacy-exact masked-field semantics (leave-blank-keep, reveal-key POST with generation guards, exchange-change credential reset), HL/Bybit inline expiry checks plus the all-users expiry panels, the comments CRUD, the HL expiry Telegram warning config, the TradFi vault-profile section (yfinance box, profile table selection, provider notes/links, projection status + retry, generation-guarded reveal/test/save with pending-save-intent reconciliation, rotate/toggle/delete), the backups panel with two-file compare selection (click/drag) and the unified/side-by-side diff modal, the Logs panel (LogViewerPanel global), sidebar resize, `#edit/<name>`/`#tradfi`/`#backups`/`#comments`/`#hl-config` deep links, Escape-close, dirty-leave confirm, and pagehide secret hygiene. The dead embedded help overlay (never openable in legacy; nav goes through PBGuiSharedHelp) was dropped and `PBGUI_HELP_OPENER` re-wired instead; i18n keys reused verbatim (188 keys, en/zh parity).
- API Keys routing: `GET /api/api-keys/main_page` serves the built Vue entry first with `frontend/api_keys_editor.html` as fallback (same placeholder injections, `%%TOKEN%%` stays empty for cookie auth); `frontend/api_keys_editor.html` stays in place as that fallback so the pure-Python logic tests reading it (`test_tradfi_vault_cutover`, `test_v7_config_sync`, `tests/ui/test_archive_optimize_import_frontend`) keep working. Added `tests/test_api_keys_route.py` (Vue build, legacy fallback with injections, build hint).
