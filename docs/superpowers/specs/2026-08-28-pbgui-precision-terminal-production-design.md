# PBGui Precision Terminal 2.0 Production UI Design

Date: 2026-08-28
Status: Approved by user

## Background and goal

PBGui already has a shared Vue 3 AppShell, WorkbenchRail, UI primitives, design tokens, and a dark workbench structure. The production palette is still blue-grey, however, and complex pages retain independent blue palettes, chart constants, or inline status colors. Shared components, page-local CSS, and charts can therefore drift apart.

This design promotes the approved `design-preview/pbgui-visual-directions.html` Precision Terminal 2.0 direction into production:

- comfortable neutral graphite surfaces, one step brighter than the current theme;
- ice-blue used only for interaction and telemetry signals;
- calm silver text;
- low-saturation but clearly identifiable semantic colors;
- a dense interface suitable for long-running operations, backtests, optimization, monitoring, and data analysis.

The goal is not to redesign workflows or add theme features. It is to establish a maintainable and testable visual contract while preserving current page structure and behavior.

## Approved decisions

| Decision | Approved choice |
|---|---|
| Visual direction | Precision Terminal 2.0 |
| Base surfaces | Comfortable neutral graphite with no blue hue |
| Brightness | One step brighter than the current production theme |
| Accent | Preserve the Precision ice-blue signal color |
| Inputs | Use a distinct inset grey, separate from elevated surfaces |
| Architecture | Shared tokens first, then calibrate core page overrides |
| Theme strategy | Upgrade the existing theme; do not add a theme switcher |
| First-wave scope | Shared layer plus nine core pages, including Dashboard Editor iframe |
| Chart strategy | Shared static TypeScript palette bridge; no runtime CSS parsing |
| Offline constraint | No CDN, remote font, remote script, or hosted asset |

## Scope

### In scope

1. Update production visual tokens, legacy aliases, RGB channels, shadows, and focus rings.
2. Preserve existing token names and Tailwind utility names.
3. Neutralize old blue-black and blue-white effects in shared shell and UI components.
4. Add a shared static palette bridge for Plotly, Lightweight Charts, and inline status colors.
5. Calibrate these nine core pages:
   - PBv7/PBv8 Backtest
   - Coin Data
   - Services Monitor
   - Market Data
   - PBv7/PBv8 Optimize
   - PBv7/PBv8 Strategy Explorer
   - Welcome
   - Dashboard Manager
   - Dashboard Editor iframe/standalone entry
6. Update affected visual contracts, chart tests, and page tests.
7. Record the production migration in `releases/unreleased.md`.

### Out of scope

- API, data model, WebSocket, polling, navigation, routing, and iframe protocol changes.
- Changes to page information architecture, panel order, form fields, table columns, or business actions.
- Spacing, typography scale, and control size changes unless a color change exposes a specific readability defect.
- Theme switching, user theme preferences, or startup theme-flash logic.
- Chart lifecycle, saved zoom, fullscreen behavior, drag-and-drop, or grid geometry refactors.
- Cleanup of unrelated historical code, comments, or unused fields.
- Page-by-page layout redesign of the remaining Vue entries; they inherit the shared baseline first.
- Adding AppShell or WorkbenchRail to Dashboard Editor. It remains a shared iframe/standalone document.

## Architecture

### Canonical visual source

`frontend/src/styles/tailwind.css` remains the CSS source of truth. Existing token names, Tailwind v4 utilities, and legacy aliases stay compatible.

```text
Canonical CSS tokens
├── Tailwind utilities and shared components
├── Legacy aliases and RGB channel aliases
└── Static TypeScript palette bridge
    ├── Plotly
    ├── Lightweight Charts
    └── Inline status colors
```

The TypeScript bridge exists only for third-party chart configuration and inline styles that cannot reliably consume CSS custom properties. Contract tests keep CSS and TypeScript values synchronized.

### No runtime theme resolution

Charts will not call `getComputedStyle()` during initialization because production has one theme, runtime resolution complicates jsdom and initialization order, and Dashboard Editor already has sensitive zoom/fullscreen/update contracts. Static constants plus contract tests are simpler and safer.

### Iframe boundary

Dashboard Manager and Dashboard Editor are separate HTML documents. Parent CSS variables do not cross the iframe, but the editor entry imports `tailwind.css` itself, so the canonical theme reaches both builds independently.

The parent owns iframe loading and canvas framing. The editor owns grid cells, widgets, charts, dropdowns, overlays, and fullscreen modes. They share a visual contract without merging shells or DOM trees.

## Final color contract

### Neutral surfaces

All base surfaces use equal RGB channels, ensuring that the foundation has no blue hue.

| Role | Value | Use |
|---|---:|---|
| Deep | `#0f0f0f` | Outer depth, chart canvas base, backdrop source |
| Page / Workspace | `#161616` | Page and primary workspace |
| Sidebar | `#1b1b1b` | WorkbenchRail and stable navigation |
| Input | `#1e1e1e` | Inputs, selects, and inset editing areas |
| Panel | `#222222` | Panels and data workspaces |
| Card / Elevated | `#2b2b2b` | Cards, popovers, dialogs, and raised controls |

Input uses `#1e1e1e`, darker than its typical `#222222` panel, to communicate an inset editable region. Elevated surfaces use `#2b2b2b`, borders, and neutral shadow to remain distinct from inputs.

### Borders

| Role | Value |
|---|---:|
| Subtle | `#343434` |
| Default | `#464646` |
| Strong | `#626262` |

Borders are neutral. Subtle separates large regions, Default frames controls and panels, and Strong supports hover, emphasis, and floating layers.

### Text

| Role | Value |
|---|---:|
| Primary | `#f0f0f0` |
| Secondary | `#bdbdbd` |
| Muted | `#999999` |

Disabled and placeholder values derive from the same neutral ladder at lower emphasis. Secondary text must not be reused as a dark surface fill; the few Dashboard Editor uses that do so must move to surface or border tokens.

### Ice-blue accent

| Role | Value |
|---|---:|
| Deep | `#4fa8d3` |
| Base | `#8fcff2` |
| Soft | `#b6e1f7` |
| Contrast | `#081216` |

Ice-blue is reserved for selection, focus, primary actions, active navigation, primary chart series, and key telemetry. It is not a base surface color.

### Semantic ramps

| Semantic | Deep | Base | Soft |
|---|---:|---:|---:|
| Success | `#397d5e` | `#7bc8a5` | `#a4dbc3` |
| Warning | `#8a632c` | `#d8ae6f` | `#e5c99b` |
| Danger | `#914343` | `#d98080` | `#e6aaaa` |

Base is used for primary semantic text, icons, and borders. Deep is used for solid fills and pressed states. Soft is used for high-readability semantic text on dark surfaces. Existing text and structural status cues remain; color is not the sole carrier of meaning.

### Shadows, backdrops, and highlights

- Shadows use neutral black channels rather than current blue-black channels.
- Inset highlights use neutral white rather than current blue-white channels.
- Panel elevation stays restrained; dialogs, popovers, and dropdowns get stronger elevation.
- Backdrops derive from Deep `#0f0f0f` and preserve the existing z-index scale.
- Focus rings use translucent ice-blue and remain visible on Input, Panel, and Elevated surfaces.

## Shared layer migration

### `tailwind.css`

Update together:

- New `--color-deep` role.
- Page, workspace, sidebar, panel, card, elevated, input, and backdrop.
- Border subtle/default/strong.
- Primary, secondary, muted, disabled, and placeholder text.
- Full accent and semantic ramps.
- Panel, elevated, and modal shadows.
- Focus ring.
- Legacy surface, text, and semantic aliases.
- Every RGB companion, including page/panel/secondary text channels.

Changing visible hex tokens without their RGB aliases is not acceptable because transparent selection, gradients, status fills, and textures would retain the old palette.

### `components.css` and shared components

Neutralize:

- Old blue-white inset on collapsed active rail items.
- WorkspaceHeader inset highlight.
- Old blue-black shadows on rail controls, panels, modals, and icon buttons.
- ConnectionNotice blue-white highlight.
- Slider blue-black shadow.
- Other explicit old palette channels in the shared layer.

Shared component APIs and class contracts remain unchanged. Button, Input, Select, Checkbox, Radio, and Textarea already consume semantic utilities and should mostly migrate through tokens.

### Static TypeScript palette bridge

Add one read-only module with concrete values for:

- chart background, panel, grid, and strong grid;
- primary, secondary, and muted text;
- accent deep/base/soft;
- semantic deep/base/soft;
- required transparent volume and area fills.

The module has no DOM access, mutable theme state, or side effects. Backtest, Dashboard Editor, and Services Monitor consume it rather than copying hex values.

## Core page design

### Backtest

- Remove or replace its unscoped page-wide blue palette.
- Preserve configuration, queue, results, archive, table, modal, and scrolling structure.
- Move Plotly background, grid, text, and series colors to the shared TypeScript palette.
- Use the shared offline font stack in charts.
- Replace hardcoded near-white or dark-green filled-button text with the correct contrast role.
- Preserve PB7/PB8 shared entry and result interactions.

### Coin Data

- Keep `--coin-*` role names but map them to shared neutral surfaces and channels.
- Map page, workspace, controls, data, header, input, border, hover, and selected states to the new contract.
- Remove the local Segoe UI override and inherit the shared font stack.
- Preserve filters, row selection, details, refresh jobs, and CMC gating.

### Services Monitor

- Use the shared palette for fresh/stale/old/missing price-age inline colors.
- Replace independent CRITICAL purple with the Danger ramp while retaining CRITICAL text.
- Use correct accent contrast for result-dialog buttons.
- Move visible backdrops and modal shadows to shared elevation roles.
- Preserve polling, workers, migrations, logs, and credential flows.

### Market Data

- Remove the local Source Sans override.
- Let Settings, Status, Integrity, Inventory, TradFi, Copy Data, and Activity inherit shared tokens.
- Preserve the `market_data_status` alias boundary because it already maps to shared roles and has a dynamic lifecycle.
- Do not refactor jobs, windows, exchange context, or monitor lifecycle.

### Optimize

- Replace hardcoded amber in queue state, connection banner, runtime border, and JSON legend with the Warning ramp.
- Preserve queue, selection, WebSocket, polling, and PB7/PB8 route adapters.

### Strategy Explorer

- Use as a complex chart, comparison-panel, and dense-table inheritance validator.
- Make page-local color corrections only when browser verification shows a concrete mismatch.
- Do not expand neutral alpha details into unrelated cleanup.

### Welcome

- Use as the entry-page, status-card, form, and responsive inheritance validator.
- Verify authentication, setup, password, and file-browser layers.
- Do not change layout without a specific regression.

### Dashboard Manager

- Migrate library, sidebar, toolbar, loading/empty canvas, and iframe frame through shared tokens.
- Preserve selection, resize, dialogs, templates overlay, and postMessage contracts.
- Match iframe loading background to the editor Page/Deep surface to avoid an old-blue flash.

### Dashboard Editor

- Keep its independent document and do not add AppShell or WorkbenchRail.
- Let grid, widget chrome, inputs, dropdowns, overlays, and tables inherit shared tokens.
- Correct PaletteBar, LayoutPicker, ResizeHandle, and MultiSelect uses that treat secondary text as a dark fill.
- Move Plotly layouts, Lightweight Charts, format helpers, and Orders legend to the shared TypeScript palette.
- Replace visible old blue-black overlays/shadows and `#f2f5fb` literals with shared roles.
- Verify iframe view, iframe edit, standalone, Plotly fullscreen, Orders fullscreen, teleported dropdown, Manage Positions modal, and nested preview modal.
- Preserve drag/drop, resize, zoom, saved ranges, chart generations, and iframe protocol.

## Compatibility

### Legacy aliases

Preserve existing public aliases and compatibility selectors, including:

- `--bg-page`, `--bg-panel`, `--bg-card`, `--bg-elevated`, `--bg-input`.
- `--surface-*`.
- `--bg`, `--bg2`, `--bg3`.
- Accent and semantic aliases such as `--blue`, `--green`, `--orange`, and `--red`.
- `.btn`, `.pbgui-btn`, and their variants.

This migration changes values, not public names. Remaining Vue entries and legacy fallback pages inherit the new baseline without missing-variable failures.

### Page-local unlayered styles

SFC and page-local CSS override Tailwind layers. First-wave page-local `:root` blocks, role variables, hardcoded RGB values, and chart constants that defeat the new theme must be migrated explicitly.

### Charts and inline styles

Third-party chart objects and Vue inline styles cannot depend on CSS cascade. They consume the shared TypeScript constants, and tests cover background, text, grid, positive/negative values, and legend agreement.

## Accessibility and interaction constraints

- Normal text contrast is at least 4.5:1; large text at least 3:1.
- Muted, Danger, and small labels are checked on their brightest common surface.
- Focus rings remain visible on Input, Panel, and Elevated surfaces.
- Success, Warning, Danger, and CRITICAL retain text or structural cues.
- Active navigation retains combined text/icon and background/edge cues.
- Keyboard order, ARIA names, dialog semantics, reduced-motion, and skip links remain unchanged.
- Do not add native alert/confirm or backdrop-only close behavior.

## Test design

### Shared contracts

Update `visual-tokens.test.ts` to lock:

- neutral surfaces and borders;
- text hierarchy;
- complete accent and semantic ramps;
- hex/RGB channel synchronization;
- focus ring, backdrop, and neutral shadows;
- legacy alias links;
- local font asset behavior.

Existing AppShell, WorkbenchRail, and page-layering tests continue to protect scrolling, widths, overlays, focus, and responsive behavior.

### Page and chart tests

- Backtest: page palette, Plotly layout, and comparison series.
- Coin Data: local role variables reference shared tokens and no old palette.
- Services Monitor: price age, CRITICAL, and modal contrast.
- Optimize: Warning token replaces hardcoded amber.
- Dashboard Editor: Plotly, Lightweight Charts, format helpers, Orders legend, and widget inline colors.
- Welcome, Market Data, Strategy Explorer, and Dashboard Manager: existing behavior tests; no low-value DOM snapshots.

### No pixel snapshots

The repository has no browser screenshot baseline. Verification uses semantic token contracts, structural CSS tests, behavior tests, chart constants, a production build, and selected real-route browser checks. No new browser dependency or brittle full-page pixel snapshot is added.

## Verification matrix

### Automated

From `frontend/`:

```bash
pnpm run typecheck
pnpm test
pnpm run build
```

Focused suites include shared visual contracts and all nine core page families. After the build, run representative Python route tests for Welcome, Services, Market Data, Backtest, Optimize, Strategy Explorer, Coin Data, Dashboard Manager, and Dashboard Editor.

### Browser

Viewports:

- Desktop: `1440 x 900`
- Medium: `1024 x 768`
- Mobile: `390 x 844`

Verify:

- Clear Page, Sidebar, Input, Panel, Card, and Elevated hierarchy.
- No blue hue in base surfaces; ice-blue appears only at signal points.
- Collapsed, expanded, and mobile WorkbenchRail behavior.
- Table hover/selection, button states, focus rings, and semantic badges.
- No old-blue flash in dialogs, dropdowns, tooltips, or iframe loading.
- Matching Backtest and Dashboard Editor chart canvases, grids, text, values, and legends.
- Dashboard Editor iframe view/edit, standalone, and fullscreen modes.
- No new console errors, build-asset 404s, or external asset requests.

## Risks and mitigations

### RGB alias drift

Risk: base tokens change while transparent effects retain old channels.
Mitigation: contract-test every canonical color and RGB companion together.

### Neutral hierarchy collapse

Risk: Card and Elevated both use `#2b2b2b`.
Mitigation: preserve Strong borders and neutral elevation shadow rather than adding unnecessary near-duplicate greys.

### Secondary token misuse

Risk: `#bdbdbd` is valid text but too bright as a fill.
Mitigation: move those fills to Panel/Card/Border tokens instead of distorting the text token.

### Chart/CSS mismatch

Risk: chart libraries retain old literals.
Mitigation: one static TypeScript palette, synchronization tests, and browser chart checks.

### Partial iframe migration

Risk: Manager becomes neutral while Editor stays blue.
Mitigation: Dashboard Editor is a full ninth core entry in the first wave.

### Broad visual regression

Risk: shared tokens affect every Vue and some legacy pages.
Mitigation: preserve public aliases, pass shared contracts first, then core page suites and real-route checks; do not combine layout or behavior changes.

## Release and documentation

- Update `releases/unreleased.md` for the production Precision Terminal migration, chart synchronization, and first-wave pages.
- Do not increment `api/serial.txt`; this is frontend-only styling and chart-color work.
- Do not change help content because workflows and field semantics remain unchanged.
- Do not create commits without explicit user instruction.

## Acceptance criteria

1. Production tokens match the approved neutral surfaces, text, borders, ice-blue, and semantic ramps.
2. Base surfaces have no blue hue; ice-blue is limited to interaction and telemetry.
3. Legacy aliases and every RGB companion match canonical tokens.
4. Nine core pages no longer defeat the theme through blue local palettes or chart literals.
5. Backtest and Dashboard Editor charts, legends, and inline semantic colors match the shared contract.
6. Dashboard Editor remains correct in iframe view/edit, standalone, and fullscreen modes.
7. Text, Muted, semantic colors, focus rings, and button contrast meet accessibility requirements.
8. Remaining Vue pages inherit the shared baseline without missing aliases.
9. Business behavior, API, routes, i18n, scrolling, selection, drag/drop, chart lifecycle, and iframe protocol remain unchanged.
10. Full frontend typecheck, Vitest, production build, and representative Python route tests pass.
