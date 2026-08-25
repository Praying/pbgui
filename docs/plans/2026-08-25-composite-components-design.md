# Composite Components Unification Design

**Date:** 2026-08-25
**Status:** Proposal — follows the shipped form-control layer (`frontend/src/shared/components/ui/` + `MIGRATION.md`)

## Goal

Extend the `ui/` layer beyond form controls to the five remaining duplicated
interaction families: **dialogs, toasts, tabs, tooltips, and status badges**.
The form-control migration proved the pattern (token-styled reka-ui primitives,
inert anchor classes for tests, per-page mechanical playbook); this phase
applies it to the composite layer. No URL, API, auth, i18n, or business
behavior changes; the legacy `js/pbgui_dialogs.js` stays loadable until every
consumer is migrated.

## Inventory (verified against the tree on 2026-08-25)

### Dialogs — ~30 hand-rolled modal surfaces

Every surface below hand-rolls the same stack: fixed backdrop, centered panel,
`role="dialog"`-ish markup, an ✕ close button, and ad-hoc Esc/focus handling.

| Surface | Shape today |
|---|---|
| `v7_backtest` — `RebacktestModal.vue` (117), `RetestModal.vue` (193), `SettingsModal.vue` (194), `ArchiveGitModals.vue` (209), `ArchivePanel`/`ResultsPanel`/`ConfigsPanel` inline overlays; helpers in `lib/uiClasses.ts:15-35` (`modalBackdropClass`, `modalBoxClass`, `modalBtnClass`) | 8 files consume `modalBtnClass`; backdrop+box+busy-confirm pattern |
| `v7_optimize` — `ImportConfigModal`, `ConfigEditorModal`, `OhlcvPreflightModal`, `PlotModal`, `SettingsModal` + one in `App.vue` | 6 surfaces |
| `v7_edit` — `BalanceCalcModal`, `CopyUserModal`, `ImportModal` (Teleport, imperative `show()` via template refs, `App.vue:140-164`) | expose-driven open/close |
| `v7_run` — `ConfirmModal.vue`, `BackupConfirmOverlay.vue` (Teleport to `#modal-root`) | confirm-with-busy-label pattern |
| `market_data` — `ConfirmDialog.vue` (store-driven, focus hand-off to `#btn-confirm-accept`), `GapDetailsModal.vue`, `DeleteOlderDialog.vue` | controller-driven |
| `dashboard_main` — `DeleteDialog.vue`, `NewDashboardDialog.vue` | confirm + form dialog |
| `dashboard_editor` — `PositionsConfigPreviewModal`, `PositionsManageModal`; shared chrome constants `dpModalChrome` in `components/widgets/uiClasses.ts:96-102` (draggable head) | drag-handle modal |
| `services_monitor` — `CmcAuthorityModal.vue`, `CmcKeyModal.vue` (`.cmc-modal-*` classes) | form modal |
| `api_keys_editor` — `AlertModal.vue`, `BackupsPanel.vue` overlays | alert + panel modals |
| `jobs_monitor`, `logging_monitor`, `cluster_sync`, `vps_manager`, `vps_monitor`, `help`, `db_tools/PanelBits`, `welcome` | one overlay each |
| Legacy imperative confirm/alert: `js/pbgui_dialogs.js` (268 lines) behind per-page `lib/dialogs.ts` shims — consumers: `ai_chat`, `v7_run` (lib/dialogs + composables), `v7_edit`, `market_data_status`, `dashboard_main`, `dashboard_templates`, `services_monitor/WorkersPanel`, `welcome` | global `window.PBGuiDialogs` |

### Toasts — 7 per-page systems, one duplicated relay

All seven mirror every message into `POST /api/notify_log` with slightly
different auth, timing, and level vocabularies:

| System | Shape | Timing | notify_log auth |
|---|---|---|---|
| `v7_run/lib/toast.ts` (68) / `v7_edit/lib/toast.ts` | single imperative DOM element, `show(msg, 'ok'\|'err'\|'info')` | 8000 ms + 300 ms fade | cookie (`credentials: same-origin`) |
| `v7_backtest/lib/toast.ts` (76) | reactive queue, 10 s dedupe per type+text | 4000 ms | cookie |
| `market_data` — `composables/useToasts.ts` (105) + `components/ToastStack.vue` (72), `SHOW_TOAST_KEY` provide/inject | reactive stack | 3200 ms + 220 ms leave | **boot Bearer** |
| `api_keys_editor/composables/useToasts.ts` (105) | success/info → toast; **error/warning → AlertModal** | — | cookie, `success→ok` mapping |
| `market_data_status/App.vue:80` inline + `config.ts` `NOTIFY_LOG_URL` | inline | — | bearer via config |
| `services_monitor/resultPopup.ts` (120) | imperative `h()`/`render()` modal raised outside the tree + `logUiNotification` via `apiFetch` | manual close | apiFetch (bearer) |

### Tabs — 5 implementations on the shared `.pbgui-tab` chrome

`styles/components.css:1145-1151` (`.pbgui-tab-bar`/`.pbgui-tab`) is consumed
by `jobs_monitor/App.vue:485` (`data-tab` + `active` class switch),
`hl_data_actions/components/JobMonitorCard.vue:63`, `services_monitor/
components/ServiceLogPanel.vue:139`, `v7_strategy_explorer/components/
ParamTuning.vue:108`, and `vps_monitor/App.vue`. None carry `role="tablist"` /
arrow-key navigation today.

### Tooltips — 3 `[data-tip]` layers

- `shared/components/DataTipTooltip.vue` (76) — the market_data port,
  consumed by `market_data`, `v7_backtest` (`App.vue:44,370`),
  `v7_pareto_explorer` (`App.vue:59,379`).
- `pages/v7_edit/components/DataTipLayer.vue` (62) — a second implementation
  of the same mouseover/mousemove/mouseout delegation (deliberately drops the
  legacy HTML tooltips, XSS class R1).
- Page-level `[data-tip]` CSS blocks (e.g. `v7_pareto_explorer/App.vue:633`)
  plus the legacy `js/coin_overrides_editor.js` tooltip on non-Vue pages.

### Status badges — 8+ per-page status→tone maps

`v7_run` (`lib/table.ts:46` `STATUS_LABEL_KEYS` + `InstanceTable.vue`
`statusClass`, `App.vue` `bannerClass`), `v7_optimize/components/QueuePanel`,
`hl_data_actions` (`ActiveJobCard`, `JobMonitorCard`), `jobs_monitor/App.vue`,
`cluster_sync/App.vue:77` (`SYNC_MODE_LABELS`), `services_monitor/components/
MigrationPanel`, `dashboard_editor` (`lib/grid.ts`, `GridCell.vue`),
`vps_manager/App.vue`, `market_data` (`tradfi/SearchResults.vue:72`
`STATUS_TONE`, `tradfi/ActionResult.vue:20` `FEEDBACK_TONE`), `coin_data/
components/SymbolTable.vue:121-131` (`badge pbgui-badge badge-success ok …`),
and `welcome/lib/uiClasses.ts`.

## Proposed design

### 1. `ui/dialog` — Dialog stack + a shared confirm service

Reka UI 2.10 already ships `Dialog`/`AlertDialog` in the installed bundle;
we wrap it the same way `ui/select` wraps the reka listbox.

**Component sketch** (`shared/components/ui/dialog/`):

```vue
<DialogRoot v-model:open="open">            <!-- reka, portal to body -->
  <DialogContent
    size="sm|md|lg"                          <!-- max-width scale -->
    :persistent="true|false"                 <!-- see safety contract -->
    :busy="deleting"                         <!-- disables close affordances -->
    aria-labelledby="…"
  >
    <DialogHeader>…title slot…</DialogHeader>
    <slot />                                 <!-- body -->
    <template #actions>…buttons…</template>  <!-- right-aligned action row -->
  </DialogContent>
</DialogRoot>
```

- **Safety contract (binding):** per the repo's non-regression rule, a modal
  that commits or destroys state (`DeleteDialog`, `ConfirmModal`,
  `BackupConfirmOverlay`, `CmcAuthorityModal`, archive/retest modals, …)
  renders with `persistent` — `pointerdown` outside never closes it. Esc
  stays available unless `busy` (mirrors the legacy "buttons disabled while
  the request is in flight" semantics). Low-consequence pickers/preview
  modals (`PlotModal`, gap details, OHLCV preview) may close on outside
  interaction.
- **Focus contract:** reka supplies the trap + focus return to the trigger.
  Initial focus goes to the element carrying `data-autofocus` (pages move
  their existing hand-offs — e.g. market_data's `#btn-confirm-accept` focus
  in `ConfirmDialog.vue`, GapDetailsModal's close-button focus) onto the
  declarative attribute; when none is set, focus lands on the first
  focusable action. jsdom tests assert `document.activeElement` exactly as
  today.
- **Token mapping:** overlay `bg-backdrop` + page blur; panel `bg-panel` /
  `border-border-default` / `rounded-lg` / `shadow-elevated`; the z-index
  ladder (today: 1000 modal, 3001-3002 overlays, 10001 backup panel, 20000
  gap modal, 30000 dashboard_editor) collapses to one `--z-modal` token with
  stacking handled by DOM order (reka portals append in open order).
- **Shared confirm service:** promote market_data's
  `useConfirmDialog`/`ConfirmDialog.vue` pair into `ui/dialog` as
  `useConfirm()` returning `Promise<boolean>` — `{ title, message, detail?,
  items?, confirmText?, tone?: 'danger'|'warning' }`, matching the call
  shape every `lib/dialogs.ts` shim already wraps. The shims then drop
  `window.PBGuiDialogs`; `js/pbgui_dialogs.js` remains only for unmigrated
  legacy pages.

**Migration order (risk ascending):**

1. `v7_run`, `market_data` confirms/overlays — already on ui/ buttons,
   store-driven, heavily tested. (Validates focus + busy contract.)
2. `dashboard_main` dialogs, `api_keys_editor` AlertModal, `services_monitor`
   CMC modals — self-contained form/confirm shapes.
3. `v7_optimize` six surfaces — modal-over-page with iframes (`PlotModal`)
   is the first nesting stress test.
4. `v7_backtest` — `modalBtnClass`/`modalBoxClass` helpers dissolve; the
   `resize`-able `modalBoxClass` geometry keeps a `class` passthrough.
5. `dashboard_editor` `dpModalChrome` — the drag handle composes with
   `DialogContent` via slot; do the drag behavior LAST (it is the only
   repositionable modal family).
6. `lib/dialogs.ts` shims → `useConfirm()` last, per page, once the visual
   dialog is in place.

**Out of scope:** `jobs_monitor`'s full-screen log viewer overlay (a panel,
not a dialog); `services_monitor/resultPopup.ts` moves with the toast phase
(it is a notification, not a dialog); no change to modal *content* layout.

### 2. Shared `useToast` + `ui/ToastStack`

One composable + one stack component, placed in `shared/`. The notify_log
relay lives inside it exactly once.

```ts
// shared/composables/useToasts.ts
interface ToastOptions {
  level?: 'ok' | 'info' | 'warning' | 'err';   // legacy vocabulary kept
  timeoutMs?: number;                          // default 3200 (market_data)
  relay?: boolean;                             // default true → /api/notify_log
}
useToasts(): { toasts: Ref<ToastItem[]>; show(msg, opts?): void; dismiss(id): void }
```

- **Level vocabulary:** keep the legacy `ok/err/info` plus `warning` (the
  only addition, needed by api_keys_editor); the ToastStack maps levels onto
  the ui/ token tones (`ok→success`, `err→danger`). Per-page adapters keep
  their existing call signatures — `createToast(el)`-style pages get a thin
  shim that forwards to the shared service, so call sites don't churn.
- **Relay:** single implementation on `apiFetch` (boot Bearer), replacing the
  cookie-vs-bearer split. `success→ok` remapping (api_keys_editor) lives in
  its adapter, not the core.
- **Strangler path:**
  1. Land `shared/composables/useToasts` + `ui/ToastStack` (tokens, leave
     animation: 220 ms, per the market_data stack).
  2. market_data swaps its page-local pair for the shared one (proves
     provide/inject via a shared `TOASTS_KEY`).
  3. v7_backtest's queue semantics (dedupe) move into an options flag
     (`dedupeMs`) on the shared service; v7_run/v7_edit's single-element DOM
     toast becomes the stack with max-1.
  4. api_keys_editor keeps its error/warning → AlertModal fork as an
     adapter concern (`show()` routes by level); market_data_status's inline
     toast + `NOTIFY_LOG_URL` constant retire into the shared module.
  5. `services_monitor/resultPopup.ts` last: it is an imperative
     modal-with-detail, not a toast — migrate only its
     `logUiNotification` leg onto the shared relay; the popup itself becomes
     a `ui/dialog` consumer in phase 1's wake or stays with a blocked note.
- **Out of scope:** toast *content* (links/actions inside toasts — no
  current page uses them); a global notification center; the server-side
  notify_log reader UI.

### 3. `ui/tabs` — TabsRoot/TabsList/TabsTrigger on reka

```vue
<TabsRoot v-model="tab">
  <TabsList>                                 <!-- .pbgui-tab-bar chrome -->
    <TabsTrigger value="running">…</TabsTrigger>
  </TabsList>
</TabsRoot>
```

- Token mapping is one-to-one with `styles/components.css:1145-1151`
  (`.pbgui-tab` active underline, muted idle text); the shared CSS class
  remains as the inert anchor while the component owns the chrome — same
  trick as `sb-btn` in the control migration.
- reka adds the missing accessibility layer for free: `role="tablist"`,
  `aria-selected`, arrow-key/Home/End navigation. Pages keep their `data-tab`
  hooks on the triggers.
- **Migration order:** `jobs_monitor` (simplest — 3 static tabs) →
  `services_monitor/ServiceLogPanel` → `vps_monitor` → `hl_data_actions`
  JobMonitorCard (dynamic labels) → `v7_strategy_explorer/ParamTuning` (grid
  geometry — verify the `grid-cols-[…]` layout composes with TabsList's
  flex default via class passthrough).
- **Out of scope:** AppShell's workbench-rail navigation (a nav tree, not
  tabs); tab *content* caching/lazy-mount behavior — pages keep owning
  `v-if`/`v-show` for their panels (none of the five use `TabsContent`
  semantics today).

### 4. One `[data-tip]` tooltip layer

Keep the **attribute-driven, document-delegated** model — it is the feature
that let panels carry legacy `data-tip` attributes with zero rewiring —
and consolidate on the single shared implementation:

- `shared/components/DataTipTooltip.vue` is the survivor; it moves to
  `ui/tooltip/` unchanged in behavior (cursor +14 px, 8 px edge margin,
  text-only content — never innerHTML).
- `v7_edit/components/DataTipLayer.vue` (62 lines) deletes in favor of the
  shared one; its `App.vue:81,292` wiring swaps the import.
- The per-page `[data-tip]` cursor/`border-bottom` hint styles
  (`v7_pareto_explorer/App.vue:633-642`, and the same block wherever it was
  copied) move into the shared layer once, page styles drop.
- **Out of scope:** migrating attribute tooltips to per-element reka
  `Tooltip` (loses the zero-rewire property); the legacy
  `js/coin_overrides_editor.js` tooltip (non-Vue page); rich/HTML tooltips
  (deliberately excluded as XSS class R1 — textContent only).

### 5. `ui/badge` — one pill, per-page status maps become thin adapters

```vue
<Badge tone="success|warning|danger|info|neutral|accent">synced</Badge>
```

- Token mapping follows the ui/ tonal recipe already used by Button's soft
  variants: `border-<tone>/35 bg-<tone>/13 text-<tone>-soft` on
  `rounded-full` with the `text-xs font-semibold` pill scale; `neutral` is
  the secondary/12 muted variant (coin_data's `badge-muted`).
- The component owns *only* the pill chrome. Status vocabularies stay
  page-domain knowledge: each page keeps (or deletes into) a one-line map —
  e.g. `v7_run` `statusClass()` returns `tone` names instead of class
  strings, `cluster_sync`'s `SYNC_MODE_LABELS` gains a parallel
  `SYNC_MODE_TONES`. No global status registry: "synced" means different
  things per page and that is fine.
- **Migration order:** coin_data `SymbolTable` badge cells (already
  three-tone, in tests) → `market_data` tradfi `STATUS_TONE`/`FEEDBACK_TONE`
  → `v7_run`/`v7_optimize`/`jobs_monitor`/`hl_data_actions` job-status pills
  → `cluster_sync`, `services_monitor`, `vps_manager`, `dashboard_editor`
  cell chips, `welcome`.
- **Out of scope:** banners (`v7_run` `bannerClass` is a page strip, not a
  pill), callouts/alerts (`market_data` `calloutClass` — a panel, arguably a
  future `ui/callout`; not this phase), sort indicators, and any
  status→*label* text maps (they are i18n, not tone).

## Cross-cutting rules (same as the control migration)

1. Every migrated surface keeps its ids and test-selected hook classes via
   the `class` prop; live styling classes dissolve into the component.
2. Behavior stays: same v-if/v-for, same handlers, same disabled logic.
   Focus/Esc semantics move onto the reka contract verbatim and are asserted
   in page tests via `document.activeElement`.
3. Page tests update only along the MIGRATION.md test-update rules
   (selector swaps for dropped classes; dialog content renders in a body
   portal — query `document.body`).
4. No changes outside the page being migrated + `shared/`; a shared-layer
   gap gets a `ui-migration: blocked` comment and a report, not a local fix.

## Acceptance criteria

- Strict typecheck, frontend tests, build, and i18n parity pass.
- Old imperative dialogs (`js/pbgui_dialogs.js`) keep working for unmigrated
  pages until their page migration lands.
- No high-consequence modal closes on outside interaction; Esc, focus trap,
  and focus return behave identically to the legacy pages they replace.
- Every toast still reaches `/api/notify_log` exactly once per message;
  toast timing per page is preserved through options, not forks.
- Tabs keep click behavior and gain keyboard navigation without breaking
  the `data-tab` test hooks.
- `[data-tip]` tooltips render text-only on every page that renders the
  shared layer; no page keeps a private delegation layer.
- Badge tones map onto the shared component without a page-level tonal
  palette remaining; status vocabularies stay per-page.
- The complete migration can be exercised without changing business
  outcomes, URLs, or API contracts.
