# PBGui Frontend Dark Terminal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Vue multi-page frontend to a consistent dark, cool-Morandi trading-terminal experience with a collapsible workbench rail, shared shell components, modern Phosphor icons, responsive layouts, and explicit loading/empty/error states without changing business behavior.

**Architecture:** Add a Vue shared presentation layer composed of `AppShell`, `WorkbenchRail`, `WorkspaceHeader`, status primitives, and icon primitives. Keep page business components and existing API/composable data flows intact; migrate page families to the shell in verified batches, then align legacy navigation/fallback pages with the same visual tokens and icon language.

**Tech Stack:** Vue 3.5, TypeScript, Vite 6, vue-i18n 11, Vitest, CSS custom properties, `@phosphor-icons/vue`, existing local/offline frontend assets.

## Global Constraints

- Preserve existing Vue routes, API contracts, boot data, authentication behavior, page-specific business logic, and i18n key parity.
- Use a cool dark Morandi palette with one muted blue accent and readable semantic success, warning, and danger colors.
- Use Phosphor Icons as the single icon language for Vue buttons, menus, navigation, and status controls; default weight is `regular`.
- Install frontend dependencies with npm and keep all assets local/offline; do not add CDN fonts, scripts, maps, or hosted stylesheets.
- Do not casually modify `frontend/src/pages/dashboard_editor/styles/editor.css`, `frontend/src/pages/dashboard_editor/styles/widgets.css`, or their parity tests.
- Do not use native `window.alert()` or `window.confirm()` for new behavior; use the existing shared dialog system where confirmation is required.
- Preserve visible focus, keyboard navigation, reduced-motion support, semantic HTML, and non-color status communication.
- English and Simplified Chinese dictionaries must retain identical key coverage; review affected help mappings and EN/DE help documentation.
- Do not create commits unless the user explicitly requests them; use the verification checkpoints below without committing by default.

---

## File Map and Responsibilities

### New shared presentation files

- `frontend/src/shared/components/PbIcon.vue` — typed wrapper that enforces the shared Phosphor icon defaults.
- `frontend/src/shared/components/IconButton.vue` — accessible icon-only button primitive with label and tooltip contract.
- `frontend/src/shared/components/AppShell.vue` — semantic page shell, rail, header, and content slots.
- `frontend/src/shared/components/WorkbenchRail.vue` — expandable/collapsible grouped navigation.
- `frontend/src/shared/components/WorkspaceHeader.vue` — breadcrumb, title, description, status, and action slots.
- `frontend/src/shared/components/StatusStrip.vue` — compact connection/runtime status summary.
- `frontend/src/shared/navigation.ts` — typed Vue navigation model derived from existing route keys.
- `frontend/src/shared/components/*.test.ts` — focused interaction and accessibility tests for the new primitives.

### Shared files to modify

- `frontend/package.json` and `frontend/package-lock.json` — add the local Phosphor Vue dependency through npm.
- `frontend/src/styles/tokens.css` — apply approved cool-Morandi surface, border, accent, semantic, rail, and layout tokens while retaining legacy aliases.
- `frontend/src/styles/base.css` — add shared scroll, focus, reduced-motion, numeric, and semantic defaults where needed.
- `frontend/src/styles/components.css` — standardize button, menu, icon, panel, status, skeleton, empty, and error primitives.
- `frontend/src/shared/i18n.ts` and `frontend/i18n/{en,zh}.json` — add only the shell/navigation labels required by the new components, preserving key parity.

### Page-family migration files

- Core workbench: `frontend/src/pages/{welcome,v7_run,v7_optimize,v7_backtest,v7_edit,v7_strategy_explorer,v7_pareto_explorer}/App.vue`, their page styles, entry HTML files, and existing page tests.
- Operations: `frontend/src/pages/{jobs_monitor,logging_monitor,vps_manager,vps_monitor,cluster_sync,services_monitor}/App.vue`, their page styles, entry HTML files, and existing page tests.
- Data/tools: `frontend/src/pages/{coin_data,hl_data_actions,db_tools,balance_calc,api_keys_editor,market_data,market_data_status}/App.vue`, their page styles, entry HTML files, and existing page tests.
- Supporting Vue pages: `frontend/src/pages/{help,dashboard_main,dashboard_templates,root_login,dashboard_editor}/App.vue`, their page styles, entry HTML files, and existing tests. Dashboard editor CSS parity files remain unchanged unless a test-proven shell boundary requires a non-frozen wrapper change.

### Legacy alignment files

- `frontend/pbgui_nav.js` — replace emoji entity navigation icons with the local Phosphor-compatible SVG icon helper while preserving route keys, labels, help behavior, restart status, and responsive behavior.
- `frontend/js/pbgui_icons.js` — local icon path/factory helper for legacy JavaScript navigation and menus, using the same Phosphor Regular paths selected for Vue.
- `frontend/*.html` legacy fallback pages — update only shared navigation/icon asset references and shell tokens required to visually align fallback pages.
- `releases/unreleased.md` — record the redesign implementation planning/design update per repository policy.

---

## Task 1: Add the Local Phosphor Icon Foundation

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/src/shared/components/PbIcon.vue`
- Create: `frontend/src/shared/components/IconButton.vue`
- Create: `frontend/src/shared/components/PbIcon.test.ts`
- Create: `frontend/src/shared/components/IconButton.test.ts`

**Interfaces:**
- `PbIcon` consumes `{ icon: Component; size?: number | string; weight?: PbIconWeight; mirrored?: boolean; ariaLabel?: string }` and defaults `size=16`, `weight='regular'`, `mirrored=false`.
- `IconButton` consumes `{ icon: Component; label: string; size?: number | string; disabled?: boolean; type?: 'button' | 'submit' | 'reset' }`, emits `click`, and renders the label through both `aria-label` and `title` unless an explicit tooltip slot is provided.
- Later shell and page tasks import Phosphor components directly and pass them to these wrappers; pages do not write raw SVG or emoji navigation icons.

- [ ] **Step 1: Add the dependency through npm.**

  Run from `frontend/`:

  ```bash
  npm install @phosphor-icons/vue
  ```

  Expected result: `package.json` and `package-lock.json` contain the dependency, with no remote asset entry.

- [ ] **Step 2: Write the failing wrapper tests.**

  Test the public contract with `@vue/test-utils`:

  ```ts
  it('passes the regular weight and requested size to the icon component', () => {
    const wrapper = mount(PbIcon, {
      props: { icon: House, size: 20 },
    });
    expect(wrapper.find('svg').attributes('width')).toBe('20');
    expect(wrapper.find('svg').attributes('weight')).toBe('regular');
    expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true');
  });

  it('gives icon-only actions an accessible name and title', () => {
    const wrapper = mount(IconButton, { props: { icon: House, label: 'Open home' } });
    expect(wrapper.get('button').attributes('aria-label')).toBe('Open home');
    expect(wrapper.get('button').attributes('title')).toBe('Open home');
  });
  ```

- [ ] **Step 3: Run the focused tests and verify they fail for missing components.**

  Run:

  ```bash
  npm test -- src/shared/components/PbIcon.test.ts src/shared/components/IconButton.test.ts
  ```

  Expected result: FAIL because the new components have not been implemented.

- [ ] **Step 4: Implement the wrappers.**

  Use Vue's dynamic component rendering and a local weight union:

  ```ts
  export type PbIconWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
  ```

  `PbIcon` must set `aria-hidden="true"` when no `ariaLabel` is supplied; `IconButton` owns the accessible name at the button level and renders the icon as decorative. Do not add a generic icon-name string registry yet; passing the imported component keeps tree shaking explicit.

- [ ] **Step 5: Run the focused tests and typecheck.**

  ```bash
  npm test -- src/shared/components/PbIcon.test.ts src/shared/components/IconButton.test.ts
  npm run typecheck
  ```

  Expected result: both tests pass and TypeScript reports no errors.

## Task 2: Establish Tokens, Shared CSS, Navigation Data, and Shell Components

**Files:**
- Modify: `frontend/src/styles/tokens.css`
- Modify: `frontend/src/styles/base.css`
- Modify: `frontend/src/styles/components.css`
- Modify: `frontend/src/shared/i18n.ts` only if a typed helper is needed; translation values belong in `frontend/i18n/en.json` and `frontend/i18n/zh.json`
- Create: `frontend/src/shared/navigation.ts`
- Create: `frontend/src/shared/components/AppShell.vue`
- Create: `frontend/src/shared/components/WorkbenchRail.vue`
- Create: `frontend/src/shared/components/WorkspaceHeader.vue`
- Create: `frontend/src/shared/components/StatusStrip.vue`
- Create: `frontend/src/shared/components/AppShell.test.ts`
- Create: `frontend/src/shared/components/WorkbenchRail.test.ts`
- Create: `frontend/src/shared/components/WorkspaceHeader.test.ts`

**Interfaces:**
- `NavigationItem = { pageKey: string; labelKey: string; href: string; icon: Component; groupId: string }`.
- `NavigationGroup = { id: string; labelKey: string; items: readonly NavigationItem[] }`.
- `WORKBENCH_NAVIGATION: readonly NavigationGroup[]` preserves the current system, information, PBv7, and PBv8 route keys and hrefs from `frontend/pbgui_nav.js`.
- `AppShell` props: `{ pageKey: string; pageTitle: string; pageDescription?: string; pageFamily?: string; statusText?: string; statusTone?: 'neutral' | 'success' | 'warning' | 'danger' }`; slots: `header-actions`, `status`, `default`, `supporting`.
- `WorkbenchRail` props: `{ groups: readonly NavigationGroup[]; activePage: string; collapsed: boolean }`; emits `update:collapsed`; it persists only the collapsed preference under `pbgui-workbench-rail-collapsed`.
- `WorkspaceHeader` props: `{ family?: string; title: string; description?: string }`; slots: `status`, `actions`.
- `StatusStrip` props: `{ label: string; value: string; tone?: 'neutral' | 'success' | 'warning' | 'danger'; updatedAt?: string }`.

- [ ] **Step 1: Add tests for navigation and shell behavior.**

  Cover: active item detection by exact `pageKey`, collapsed persistence, keyboard activation, `aria-expanded` on the rail toggle, semantic `nav`/`main` structure, and rendering of header slots. Assert that a status tone is accompanied by visible text, not color alone.

- [ ] **Step 2: Run focused tests to establish the failing baseline.**

  ```bash
  npm test -- src/shared/components/AppShell.test.ts src/shared/components/WorkbenchRail.test.ts src/shared/components/WorkspaceHeader.test.ts
  ```

  Expected result: FAIL because the navigation model and shell components do not exist.

- [ ] **Step 3: Add the typed navigation model.**

  Copy only the existing route/page keys and route destinations from `pbgui_nav.js`; use Phosphor components such as `House`, `Key`, `ArrowsClockwise`, `Wrench`, `Desktop`, `FileText`, `ChartBar`, `Database`, `Wallet`, `Play`, `Backspace`, `Gear`, `Eye`, `Target`, and `Star` as the initial Regular icon set. Do not change labels or route semantics in this task.

- [ ] **Step 4: Implement the shell components and shared CSS.**

  Use semantic `nav`, `header`, `main`, `section`, and `button` elements. The rail must switch between an expanded label column and a compact icon column, retain active state with icon plus text/background/border, and expose tooltip/name information while collapsed. `AppShell` must render a skip link target and a stable `main-content` id for existing page/test contracts.

  Add tokens for the approved direction, keeping legacy aliases:

  ```css
  --surface-page: #10171f;
  --surface-workspace: #151e28;
  --surface-panel: #1b2631;
  --border-subtle: #2a3946;
  --accent: #7fa9bd;
  --accent-soft: #a5c1ce;
  --success: #7fae9b;
  --warning: #c0a277;
  --danger: #bd8585;
  --rail-expanded-width: 248px;
  --rail-collapsed-width: 68px;
  ```

  Verify text contrast before retaining any token value. Add shared `.pbgui-icon`, `.pbgui-icon-button`, `.pbgui-skeleton`, `.pbgui-empty-state`, and `.pbgui-error-state` rules without changing frozen editor stylesheet contents.

- [ ] **Step 5: Run the shared component tests and typecheck.**

  ```bash
  npm test -- src/shared/components/AppShell.test.ts src/shared/components/WorkbenchRail.test.ts src/shared/components/WorkspaceHeader.test.ts
  npm run typecheck
  ```

  Expected result: all focused tests pass and the new shell compiles.

## Task 3: Migrate the Core Workbench Page Family

**Files:**
- Modify: `frontend/src/pages/welcome/App.vue`, `frontend/src/pages/welcome/styles/welcome.css`, `frontend/src/pages/welcome/App.test.ts`, and `frontend/src/pages/welcome/index.html`
- Modify: `frontend/src/pages/v7_run/App.vue`, `frontend/src/pages/v7_run/styles/v7-run.css`, and `frontend/src/pages/v7_run/index.html`
- Modify: `frontend/src/pages/v7_optimize/App.vue`, `frontend/src/pages/v7_optimize/styles/optimize.css`, `frontend/src/pages/v7_optimize/App.test.ts`, and `frontend/src/pages/v7_optimize/index.html`
- Modify: `frontend/src/pages/v7_backtest/App.vue`, `frontend/src/pages/v7_backtest/styles/backtest-shell.css` only through non-frozen wrapper selectors, `frontend/src/pages/v7_backtest/App.test.ts`, and `frontend/src/pages/v7_backtest/index.html`
- Modify: `frontend/src/pages/v7_edit/App.vue`, `frontend/src/pages/v7_edit/styles/v7-edit.css`, and `frontend/src/pages/v7_edit/index.html`
- Modify: `frontend/src/pages/v7_strategy_explorer/App.vue`, `frontend/src/pages/v7_strategy_explorer/styles/explorer.css`, and `frontend/src/pages/v7_strategy_explorer/index.html`
- Modify: `frontend/src/pages/v7_pareto_explorer/App.vue`, `frontend/src/pages/v7_pareto_explorer/styles/pareto-base.css`, `frontend/src/pages/v7_pareto_explorer/styles/pareto-panels.css`, and `frontend/src/pages/v7_pareto_explorer/index.html`
- Modify: corresponding existing page tests where shell markup contracts intentionally change; do not delete business behavior assertions.

**Interfaces:**
- Each migrated page renders exactly one `AppShell` with its current route `pageKey` and existing translated title.
- Existing page composables, API calls, child components, charts, editors, and business event handlers remain unchanged except for moving their DOM under the shell slots.
- Page-local sidebars remain page-local; only product navigation moves to `WorkbenchRail`.

- [ ] **Step 1: Migrate Welcome as the reference page.**

  Replace the Vue page's `nav#topnav`/legacy outer frame with `AppShell`; preserve `useWelcome`, banner behavior, file browser, password flows, help opener, status rows, and existing DOM ids that tests or legacy handoffs use. Put page actions in `header-actions`, runtime metadata in `status`/supporting content, and the existing overview/setup content in the default slot.

- [ ] **Step 2: Run the Welcome focused suite.**

  ```bash
  npm test -- src/pages/welcome/App.test.ts
  ```

  Expected result: all Welcome behavior tests pass, including bootstrap, setup, password, banner, and file-browser interactions.

- [ ] **Step 3: Migrate Run, Optimize, Backtest, and Edit.**

  Preserve the existing route-specific config stores, queue actions, editor state, result handoffs, and legacy parity selectors. Add shell header actions for existing primary actions only; do not invent new workflow actions. Keep `backtest-shell.css` and `widgets.css` parity hashes unchanged.

- [ ] **Step 4: Migrate Strategy Explorer and Pareto Explorer.**

  Preserve Plotly/chart vendor loading, filters, detail panels, metric annotations, and help entry points. Use `StatusStrip` for data readiness or result status without changing the data view model.

- [ ] **Step 5: Replace page-local button/menu emoji and text symbols in this family.**

  Import named Phosphor components and pass them through `PbIcon` or `IconButton`. Use Regular at 16px for labeled actions and 18px for icon-only actions. Add `aria-label`/`title` to every icon-only action and keep visible text labels for primary actions.

- [ ] **Step 6: Remove only obsolete Vue topnav bootstrapping.**

  Once each page renders `AppShell`, remove its Vue-build-only dependency on `nav#topnav`/legacy nav initialization from the corresponding Vue entry HTML. Retain the standalone legacy HTML fallback and its scripts untouched until Task 7.

- [ ] **Step 7: Run the core workbench verification gate.**

  ```bash
  npm test -- src/pages/welcome src/pages/v7_run src/pages/v7_optimize src/pages/v7_backtest src/pages/v7_edit src/pages/v7_strategy_explorer src/pages/v7_pareto_explorer
  npm run typecheck
  npm run build
  ```

  Expected result: focused suites pass, typecheck passes, and Vite builds every MPA entry.

## Task 4: Migrate Operations and Monitoring Pages

**Files:**
- Modify: `frontend/src/pages/jobs_monitor/App.vue`, `frontend/src/pages/jobs_monitor/styles/jobs-monitor.css`, `frontend/src/pages/jobs_monitor/index.html`, and existing tests
- Modify: `frontend/src/pages/logging_monitor/App.vue`, `frontend/src/pages/logging_monitor/styles/logging-monitor.css`, `frontend/src/pages/logging_monitor/index.html`, and existing tests
- Modify: `frontend/src/pages/vps_manager/App.vue`, `frontend/src/pages/vps_manager/styles/vps-manager.css`, `frontend/src/pages/vps_manager/index.html`, and existing tests/parity tests
- Modify: `frontend/src/pages/vps_monitor/App.vue`, `frontend/src/pages/vps_monitor/styles/vps-monitor.css`, `frontend/src/pages/vps_monitor/index.html`, and existing tests
- Modify: `frontend/src/pages/cluster_sync/App.vue`, `frontend/src/pages/cluster_sync/styles/cluster-sync.css`, `frontend/src/pages/cluster_sync/index.html`, and existing tests
- Modify: `frontend/src/pages/services_monitor/App.vue`, its page styles/entry HTML, and existing tests

**Interfaces:**
- Each page uses `AppShell` and `StatusStrip`; existing WebSocket, polling, log viewer, task lifecycle, confirmation, and refresh behavior remains in its existing composables/components.
- Log viewer, service controls, VPS actions, and cluster actions keep their explicit confirmation and cleanup paths.

- [ ] **Step 1: Add shell tests for operations-specific status states.**

  Cover healthy, reconnecting, stale, empty-history, loading, and error copy as rendered text. Ensure an icon never replaces the state label.

- [ ] **Step 2: Migrate Jobs and Logging Monitor.**

  Keep live WebSocket generation handling, polling fallback, history filters, log rotation controls, purge confirmation, and Escape cleanup intact. Place service/live status in the shell header and use Phosphor icons for refresh, filter, search, pause, play, and close controls.

- [ ] **Step 3: Migrate VPS Manager, VPS Monitor, Cluster Sync, and Services Monitor.**

  Keep cookie-authenticated requests, deployment progress, SSH host-key confirmation, credential boundaries, monitor-agent state, cluster actions, and log viewer usage unchanged. Use responsive two-column-to-single-column layouts for operational cards without changing action ordering or permissions.

- [ ] **Step 4: Verify the operations family.**

  ```bash
  npm test -- src/pages/jobs_monitor src/pages/logging_monitor src/pages/vps_manager src/pages/vps_monitor src/pages/cluster_sync src/pages/services_monitor
  npm run typecheck
  npm run build
  ```

  Expected result: all focused tests pass, including live update and destructive-action contracts; typecheck and build pass.

## Task 5: Migrate Data, Configuration, and Supporting Vue Pages

**Files:**
- Modify: `frontend/src/pages/coin_data/App.vue`, its styles/entry HTML, and existing tests
- Modify: `frontend/src/pages/hl_data_actions/App.vue`, its styles/entry HTML, and existing tests
- Modify: `frontend/src/pages/db_tools/App.vue`, its styles/entry HTML, and existing tests
- Modify: `frontend/src/pages/balance_calc/App.vue`, its styles/entry HTML, and existing tests
- Modify: `frontend/src/pages/api_keys_editor/App.vue`, its styles/entry HTML, and existing tests
- Modify: `frontend/src/pages/market_data/App.vue`, its styles/entry HTML, and existing tests
- Modify: `frontend/src/pages/market_data_status/App.vue`, its styles/entry HTML, and existing tests
- Modify: `frontend/src/pages/help/App.vue`, its styles/entry HTML, and existing tests
- Modify: `frontend/src/pages/dashboard_main/App.vue`, `frontend/src/pages/dashboard_templates/App.vue`, `frontend/src/pages/root_login/App.vue`, and `frontend/src/pages/dashboard_editor/App.vue` only where the shared shell is compatible with their existing specialized layout

**Interfaces:**
- Existing selection, drag-select, API-key reveal, dashboard editor, marked/DOMPurify, iframe, and chart behavior remains unchanged.
- API-key values remain subject to the existing reveal-only, no-storage, no-URL security contract.

- [ ] **Step 1: Migrate data and calculation pages.**

  Apply the shell to Coin Data, HL Data Actions, DB Tools, Balance Calculator, Market Data, and Market Data Status. Preserve table row selection conventions, drag-select behavior, date handling, job history ordering, and iframe sizing. Use `Filter`, `SlidersHorizontal`, `Calendar`, `ArrowClockwise`, `DownloadSimple`, and `Database` icons only where the action already exists.

- [ ] **Step 2: Migrate API Keys Editor with security checks.**

  Keep secrets out of initial payloads, URLs, HTML source, logs, localStorage, and bulk responses. Use icon-only reveal/hide controls only with explicit accessible labels and clear hidden-value cleanup. Do not alter endpoint methods or request bodies.

- [ ] **Step 3: Migrate Help, dashboards, login, and editor boundaries.**

  Preserve help topic deep links, EN/DE guide behavior, sanitized rendering, dashboard editor parity, login authentication, and legacy handoff behavior. If a specialized page cannot use the full rail without breaking its existing editor contract, use the shell header and token layer while retaining its inner layout.

- [ ] **Step 4: Verify the data and supporting family.**

  ```bash
  npm test -- src/pages/coin_data src/pages/hl_data_actions src/pages/db_tools src/pages/balance_calc src/pages/api_keys_editor src/pages/market_data src/pages/market_data_status src/pages/help src/pages/dashboard_main src/pages/dashboard_templates src/pages/root_login src/pages/dashboard_editor
  npm run typecheck
  npm run build
  ```

  Expected result: focused tests pass; dashboard editor CSS parity remains unchanged; typecheck and build pass.

## Task 6: Standardize Loading, Empty, Error, Responsive, and Accessibility States

**Files:**
- Modify: `frontend/src/styles/base.css`
- Modify: `frontend/src/styles/components.css`
- Modify: each migrated page's local stylesheet only for page-specific layout/state selectors
- Modify: affected page tests
- Create: `frontend/src/shared/components/LoadingSkeleton.test.ts` if no existing shared coverage exists

**Interfaces:**
- Shared state classes/components use visible copy and semantic attributes: `[aria-busy="true"]`, `role="status"`, `role="alert"`, and `aria-live` where appropriate.
- No page may depend on color alone for success/warning/error state.

- [ ] **Step 1: Inventory asynchronous branches in migrated pages.**

  For each page family, identify existing loading, no-result, retry, success, and failure branches from the current tests/composables. Do not create synthetic states that the page cannot reach; add only missing presentation around existing branches.

- [ ] **Step 2: Add shared skeleton, empty, and error styles/components.**

  Skeletons must match the target block shape; empty states must include a concise explanation and existing next action; errors must include specific text and a retry/back path where the page already supports it. Add `prefers-reduced-motion` rules that disable shimmer and rail transitions.

- [ ] **Step 3: Add responsive layout checks.**

  Test at the project’s existing responsive breakpoints plus narrow `jsdom` layout-independent DOM checks: rail `aria-expanded`, drawer close behavior, no duplicate navigation landmarks, table wrapper presence, and action labels retained when icons are used.

- [ ] **Step 4: Run the full frontend suite.**

  ```bash
  npm test
  npm run typecheck
  ```

  Expected result: all Vitest suites pass and Vue typechecking passes.

## Task 7: Align Legacy Navigation, Fallback Pages, and Metadata

**Files:**
- Create: `frontend/js/pbgui_icons.js`
- Modify: `frontend/pbgui_nav.js`
- Modify: legacy fallback pages under `frontend/*.html` only where they load the shared navigation or page-level assets
- Modify: `frontend/src/pages/*/index.html` asset references for cache-busting when changed
- Modify: `tests/test_help_coverage.py` or related frontend route tests only if route labels/icon markup affect existing contracts
- Modify: `releases/unreleased.md`

**Interfaces:**
- `window.PBGuiIcons.create(name, options)` returns a sanitized local SVG string for the legacy nav; it accepts only an allowlisted icon name and numeric size/label options.
- `pbgui_nav.js` preserves `NAV_GROUPS`, `PBGUI_NAV_CONFIG`, current-page matching, help opener, language, about, restart status, and responsive menu behavior.

- [ ] **Step 1: Define the allowlisted local icon helper.**

  Add only the Phosphor Regular path data used by current navigation and menu actions. Escape labels as attributes, reject unknown icon names, and never interpolate route labels or user data into SVG markup.

- [ ] **Step 2: Replace legacy emoji entities in `pbgui_nav.js`.**

  Replace only the `icon` values and rendering call; keep the route keys, labels, help mappings, auth behavior, and event handlers unchanged. Match Vue icon sizes and muted/active color tokens.

- [ ] **Step 3: Align fallback shell tokens and asset cache busting.**

  Update fallback pages to load changed local assets with incremented `?v=N` values, preserve `TOKEN`/API placeholders and cookie-only authentication, and keep the legacy fallback available when `frontend/dist` is absent.

- [ ] **Step 4: Verify legacy route and help contracts.**

  ```bash
  python -m pytest tests/test_help_coverage.py tests/test_i18n.py
  npm test
  npm run build
  ```

  Expected result: help coverage and i18n parity pass; the full Vue suite and production build pass; no fallback page references a remote asset.

## Task 8: Final Visual and Regression Verification

**Files:**
- Modify: only files required by failures discovered in Tasks 1-7
- Review: `docs/superpowers/specs/2026-08-21-pbgui-frontend-dark-terminal-redesign-design.md`
- Review: `docs/superpowers/plans/2026-08-21-pbgui-frontend-dark-terminal-redesign.md`

- [ ] **Step 1: Run all required automated checks from the repository root.**

  ```bash
  cd frontend
  npm test
  npm run typecheck
  npm run build
  cd ..
  python -m pytest tests/test_i18n.py tests/test_help_coverage.py
  ```

  Expected result: all commands exit successfully.

- [ ] **Step 2: Perform the manual shell checklist.**

  Check at minimum:

  - Welcome, Run, Backtest, Optimize, Logging, VPS, Market Data, API Keys, Help, and Dashboard Editor open through their Vue build entries.
  - Rail expands/collapses, persists after reload, exposes labels/tooltips in compact mode, and keeps active state visible.
  - Keyboard focus is visible; Escape behavior and explicit dialog close behavior remain intact.
  - Wide, medium, and narrow layouts avoid clipped titles, hidden primary actions, and unreadable tables.
  - Loading, empty, warning, success, stale, and error states include readable text.
  - Phosphor Regular icons are consistent in navigation, buttons, menus, and status controls; no new emoji icon entities appear in migrated navigation.
  - Legacy fallback still loads when `frontend/dist` is unavailable.

- [ ] **Step 3: Review the diff for scope and security.**

  Confirm no API/startup files changed, no `api/serial.txt` bump is needed, no secrets or generated `dist` files were added, no frozen dashboard CSS was modified, and no unrelated cleanup entered the redesign diff.

- [ ] **Step 4: Update the changelog.**

  Add a concise entry under the existing frontend redesign planning section in `releases/unreleased.md` describing the completed shell/icon redesign and the preserved API, route, i18n, offline, fallback, and parity constraints. Do not create a git commit unless explicitly requested.

## Spec Coverage Self-Review

- **Architecture:** Tasks 1-3 establish the local icon foundation, shared shell, typed navigation, and first migration family.
- **Page migration:** Tasks 3-5 cover core workbench, operations, data/tools, help, login, dashboards, and editor boundaries.
- **Color and typography:** Task 2 updates tokens/base/shared CSS; page-specific styles consume tokens rather than adding a second palette.
- **Icon standard:** Tasks 1, 3, 4, 5, and 7 cover Vue primitives, page actions, legacy navigation, dimensions, accessibility, and offline delivery.
- **Interaction and states:** Tasks 2, 4, 6 cover hover/pressed/focus, collapsible navigation, loading, empty, error, reduced motion, and responsive behavior.
- **Internationalization and help:** Tasks 3-5 preserve existing keys and Task 7 runs i18n/help coverage tests.
- **Legacy fallback:** Task 7 retains and aligns legacy pages without rebuilding them as a second application.
- **Verification:** Tasks 3-8 include focused gates, full frontend checks, Python compatibility checks, and manual acceptance.
- **Placeholder scan:** No `TODO`, `TBD`, or unspecified implementation step is required by this plan.
