<script setup lang="ts">
/*
 * market_data_main migration — M-data-1..8 (scaffold through best-1m +
 * copy-data + the M-data-8 route flip; legacy source
 * frontend/market_data_main.html — deleted, line refs below are provenance)
 *
 * Behavior inventory (this file):
 *
 * ┌──────────────────────┬─ Task ─┬─ Legacy regions ────────────────────────────┐
 * │ App (this skeleton)  │ 1 ✓    │ DOM shell 2834-2979 + 3580-3639 (toasts),   │
 * │                      │        │ bootstrap 9736-9773 (restorePanel, title),  │
 * │                      │        │ document.title market.title (:3646)         │
 * │ Rail sections        │ 1+2 ✓  │ sectionButtons :3674-3682 → AppShell        │
 * │                      │        │ sections API (workbench-rail accordion);    │
 * │                      │        │ shortcut clicks :9112-9120 → rail entry     │
 * │                      │        │ (build) + in-panel mode switch (download);  │
 * │                      │        │ highlight sync :7415-7446 retired with the  │
 * │                      │        │ sidebar column                              │
 * │ PanelShell           │ 1 ✓    │ setActivePanel toggling :9038-9043          │
 * │ ExchangeSelect       │ 1+2 ✓  │ context bar :2965-2977; select change       │
 * │                      │        │ :9611-9613 → setContextExchange fan-out     │
 * │ StatusPanel +        │ 2 ✓    │ status panel :3223-3227 + fragment mount    │
 * │ useStatusMonitor     │        │ :4102-4174, :7406-7413, :7813-7816          │
 * │ useContextExchange   │ 2 ✓    │ fan-out :7304-7333, bootstrap :9766-9771,   │
 * │                      │        │ best-1m section state :7687-7691            │
 * │ useStatusSummaries   │ 2 ✓    │ fetchStatus/refreshStatuses :9076-9096      │
 * │ SettingsPanel +      │ 3+4 ✓  │ settings cards :2979-3085, subsection nav   │
 * │ useSettings (+       │        │ :6121-6186, picker :7015-7133, load/save    │
 * │ settingsRequest)     │        │ :8881-8948, sidebar block :2950-2958;       │
 * │ TiingoCard +         │ 4 ✓    │ tiingo card :3077-3103 + token flows        │
 * │                      │        │ :5587-5741/:8949-9031 (useTiingo)           │
 * │ TradfiMapCard +      │ 4 ✓    │ tradfi map :3105-3218, map/search/editor/   │
 * │ useTradfiMap         │        │ specs-window :5747-7014 + 401 hook :4924    │
 * │ IntegrityPanel +     │ 5 ✓    │ integrity :3229-3345 + gap modal :3595-3636,│
 * │ useIntegrity (+      │        │ actions :4252-4887, exchange branch         │
 * │ polling + confirm)   │        │ :7324-7332, poll gating :9066-9071 (R5),    │
 * │                      │        │ URL matrix :4234-4250, confirm :2893-2915/ │
 * │                      │        │ :8161-8215                                 │
 * │ InventoryPanel +     │ 6 ✓    │ inventory :3502-3579, view state :6187-    │
 * │ useInventory (+      │        │ 6387, table/actions/heatmap :7813-8854,     │
 * │ heatmap + actions +  │        │ delete-date overlay :2861-2891, sidebar     │
 * │ view state)          │        │ blocks :2929-2945, fan-out :7317-7320       │
 * │ Best1mPanel +        │ 7 ✓    │ best-1m :3346-3410 + info/queue :7588-7740, │
 * │ useBest1m            │        │ URL matrices :3751-3763/:4185-4213,         │
 * │                      │        │ hyperliquid iframe :7577-7586, panel slice  │
 * │                      │        │ :9058, fan-out :7321-7323                   │
 * │ CopyDataPanel +      │ 7 ✓    │ copy-data :3412-3500 + :5023-5523,          │
 * │ useCopyData (+       │        │ monitor :4215-4232, 15 s poll :5127-5153,   │
 * │ schedule + dry-run   │        │ panel slice :9059-9064, queue/test :7742-   │
 * │ polls)               │        │ 7811                                         │
 * │ useFrameAutoResize + │ 7 ✓    │ frame height sync :7447-7575 (dedupe)       │
 * │ AutoResizeFrame      │        │                                              │
 * │ DataTipTooltip       │ 2 ✓    │ #data-tip-tooltip :3637 + :3839-3865        │
 * │ Help opener wiring   │ 2 ✓    │ window._openMarketDataHelp/PBGUI_HELP_OPENER│
 * │                      │        │ :4085-4089 (shared_help_overlay path)       │
 * │ usePanels/useToasts/ │ 1 ✓    │ panel router + toasts + 4 frozen keys       │
 * │ useApi/config        │        │ :3662-3838, :4176-4196, :4888-5022,         │
 * │                      │        │ :9032-9107, :9736-9773                      │
 * │ Topnav / help chrome │ —      │ pbgui_nav.js + shared_help_overlay.js stay  │
 * │                      │        │ as global scripts loaded by index.html      │
 * │ Panel bodies         │ 3..7   │ all landed except activity (M-data-8        │
 * │                      │        │ mounts the global LogViewerPanel script)    │
 * └──────────────────────┴────────┴─────────────────────────────────────────────┘
 *
 * NOT PORTED (with justification):
 *  - #sidebar-resize handle (:2962) — silent no-op in legacy (the guard at
 *    :9748-9755 never fires; sidebar_resize.js is not included). Recon §0.
 *  - #help-ovl / #confirm-ovl / #inventory-delete-date-ovl overlays
 *    (:2838-2915) — the help overlay is dead chrome in legacy (visible is
 *    never added; the live path is PBGuiSharedHelp.open :4085-4089, wired
 *    below); confirm/delete overlays are owned by M-data-3/6.
 *  - loadHelpIndex/loadHelpTopic/renderHelpToc (:3957-4022) — only the dead
 *    #help-ovl path; the shared overlay fetches its own content. mdToHtml
 *    is nevertheless ported hardened (lib/markdown.ts) per recon R1.
 *
 * Deliberate deviations (documented):
 *  - Context exchange persistence happens in setContextExchange (:7309-7313)
 *    exactly like legacy; the bootstrap now runs the full fan-out on mount
 *    (:9771) instead of M-data-1's persist-only watch.
 *  - Toast/panel timers are disposed on unmount (legacy leaked them).
 *  - refreshBest1mPanel is not called twice for a shortcut click (legacy
 *    called it via setActivePanel :9058 AND openBest1mPanel :7690; the
 *    idempotent refresh lands once with M-data-7's hook).
 *  - The #sidebar column is retired: the sectionButtons registry
 *    (:3674-3682) renders as rail children (AppShell sections API); the
 *    settings save/subsection block (:2950-2958) moved above the settings
 *    cards, the inventory view/action blocks (:2929-2945) above the
 *    inventory table and the l2books download shortcut (:2948) became an
 *    in-panel build/download mode switch on the best-1m panel.
 */
import { computed, onBeforeUnmount, onMounted, provide } from 'vue';
import { useI18n } from 'vue-i18n';
import { getBoot } from '@/shared/boot';
import AppShell from '@/shared/components/AppShell.vue';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import StatusStrip from '@/shared/components/StatusStrip.vue';
import type { PageSection } from '@/shared/navigation';
import ConfirmDialog from './components/ConfirmDialog.vue';
import DataTipTooltip from '@/shared/components/DataTipTooltip.vue';
import ExchangeSelect from './components/ExchangeSelect.vue';
import Best1mPanel from './components/best1m/Best1mPanel.vue';
import CopyDataPanel from './components/copydata/CopyDataPanel.vue';
import IntegrityPanel from './components/integrity/IntegrityPanel.vue';
import InventoryPanel from './components/inventory/InventoryPanel.vue';
import DeleteOlderDialog from './components/inventory/DeleteOlderDialog.vue';
import PanelPlaceholder from './components/PanelPlaceholder.vue';
import PanelShell from './components/PanelShell.vue';
import SettingsPanel from './components/settings/SettingsPanel.vue';
import StatusPanel from './components/StatusPanel.vue';
import ToastStack from './components/ToastStack.vue';
import { apiUrl } from './config';
import { exchangeOptions } from './lib/exchange';
import { computeOlderPreviewView } from './lib/inventoryOlderPreview';
import type { PlotlyLike } from './lib/heatmapFigure';
import { SHOW_TOAST_KEY, useToasts } from './composables/useToasts';
import { useApi } from './composables/useApi';
import { useBest1m } from './composables/useBest1m';
import { useConfirmDialog } from './composables/useConfirmDialog';
import { useCopyData } from './composables/useCopyData';
import { useIntegrity } from './composables/useIntegrity';
import { useIntegrityPolling } from './composables/useIntegrityPolling';
import { useInventory } from './composables/useInventory';
import { useSettings } from './composables/useSettings';
import { useTiingo } from './composables/useTiingo';
import { useTradfiMap } from './composables/useTradfiMap';
import {
  PANELS,
  readContextExchange,
  usePanels,
  type PanelHooks,
} from './composables/usePanels';
import {
  useContextExchange,
  type Best1mSection,
  type ExchangeFanoutHooks,
} from './composables/useContextExchange';
import { useStatusMonitor } from './composables/useStatusMonitor';
import { useStatusSummaries } from './composables/useStatusSummaries';
import type { PanelDef, PanelId } from './types';

const { t } = useI18n();

/* ── panel router (setActivePanel/restorePanel :9032-9107, :9736-9746) ──
      The hooks object is filled in as the panel controllers are created;
      restorePanel() runs after the wiring (bootstrap :9764 — legacy ran it
      after every init function was defined, right before the :9771
      fan-out). */

const panelHooks: Partial<Record<PanelId, PanelHooks>> = {};
const { activePanel, setActivePanel, restorePanel } = usePanels({ hooks: panelHooks });

/* ── toasts (showToast :4983-5002) — provided for M-data-2..7 panels ── */

const { toasts, showToast } = useToasts();
provide(SHOW_TOAST_KEY, showToast);

/* ── M-data-4: tiingo vault + tradfi map controllers, created before the
      settings store so its payload hooks (:7379-7401) reach them; the tiingo
      controller's reloadSettings closure resolves after settings exists
      (only ever called from a click). One shared useApi wires the legacy
      fetchApiKeysJson 401 side effect (:4924 → clearTiingoRevealedToken). ── */

const api = useApi({
  onUnauthorized: () => tiingo.clearRevealedToken(), // :4924 — the M-1 handoff
});

const tiingo = useTiingo({
  api,
  t: (key, params) => t(key, params ?? {}),
  showToast,
  // legacy saveTiingoToken called loadSettings('hyperliquid', {keepFeedback:true})
  // (:9013) — the flag was void-ed (:8882-8884); the typed port takes false.
  reloadSettings: () => settings.loadSettings('hyperliquid', { keepFeedback: false }),
});

const tradfiMap = useTradfiMap({
  api,
  t: (key, params) => t(key, params ?? {}),
  showToast,
  isTiingoConfigured: () => tiingo.isTiingoConfigured(), // :6390
});

/* ── settings store (M-data-3 — settingsState :3698-3714 + :8881-8948);
      created before the exchange context so the fan-out hook reaches it ── */

const settings = useSettings({
  api,
  t: (key, params) => t(key, params ?? {}),
  showToast,
  // renderSettingsPayload hyperliquid tail (:7379-7397)
  onHyperliquidPayload: (payload) => {
    tiingo.applySettingsPayload(payload.settings ?? {});
    void tradfiMap.loadMappings(); // :7397
  },
  // non-hyperliquid tail (:7399-7401)
  onOtherExchangePayload: () => tradfiMap.resetForOtherExchange(),
});

/** pagehide → clearTiingoRevealedToken (:9734) — never leak a revealed token
 *  into bfcache; removed on unmount (legacy never removed it). */
function onPageHide(): void {
  tiingo.clearRevealedToken();
}
window.addEventListener('pagehide', onPageHide);
onBeforeUnmount(() => window.removeEventListener('pagehide', onPageHide));

/* ── page sections in the workbench rail (accordion under this page's
      entry) — the legacy in-page #sidebar column is retired. The registry
      order is the legacy sectionButtons order (:3674-3682); best1m, which
      had no sidebar button (reached through the shortcut link :2946),
      becomes a regular rail entry. ── */

const sections = computed<PageSection[]>(() =>
  PANELS.map((panel) => ({ key: panel.id, label: t(panel.labelKey) })),
);

/** Rail section click — setActivePanel (:9038). The best1m entry keeps the
 *  legacy shortcut semantics: openBest1mPanel('build') (:9112-9115 →
 *  :7687-7691); download mode is reached from the in-panel mode switch. */
function onSectionSelect(sectionKey: string): void {
  const panelId = sectionKey as PanelId;
  if (!PANELS.some((panel) => panel.id === panelId)) return;
  if (panelId === 'best1m-panel') {
    openBest1mPanel('build');
    return;
  }
  setActivePanel(panelId);
}

/* ── status monitor controller (mount protocol :4102-4174) — created before
      the exchange context so the fan-out hook can reach it ── */

const statusMonitor = useStatusMonitor({
  getExchange: () => contextExchange.contextExchange.value,
});

/* ── exchange context (select :2969-2975; change :9611-9613; fan-out
      :7304-7333; restore :9766-9771) ── */

const fanoutHooks: ExchangeFanoutHooks = {
  // :7314 — the M-data-3 slice of the fan-out (keepFeedback:false is typed)
  loadSettings: (exchangeKey, options) => settings.loadSettings(exchangeKey, options),
  // :7315 — the M-data-2 slice of the fan-out
  updateStatusPanel: () => statusMonitor.updateStatusPanel(),
  // syncInventorySubsectionVisibility :7317 — the M-data-6 slice
  syncInventorySubsectionVisibility: () => inventory.syncSubsectionVisibility(),
  // loadInventoryPanel(true) :7318-7320 — only while the panel is active
  loadInventoryPanel: (forceReload) => {
    if (activePanel.value === 'inventory-panel') void inventory.loadPanel(forceReload);
  },
  // refreshBest1mPanel :7321-7323 — M-data-7 (gated on the active panel
  // by useContextExchange exactly like legacy :7321)
  refreshBest1mPanel: (forceReload) => best1m.refreshPanel(forceReload),
  // :7324-7332 — the M-data-5 slice: reset + forced reload while active
  onIntegrityExchangeChange: (statusKey) => integrity.onExchangeChange(statusKey),
};

const contextExchange = useContextExchange({
  initialExchange: readContextExchange(), // :9766 — raw stored value
  isPanelActive: (panel) => activePanel.value === panel, // .active-panel check
  hooks: fanoutHooks,
});

/* ── integrity panel (M-data-5 — :3229-3345 + gap modal :3595-3636):
      the confirm overlay is shared chrome; the 2 s job poll is gated by
      panel activation (R5) and the exchange fan-out resets the store
      (:7324-7332). Created after the context controller so getExchange
      reads the live ref; the polling options close over `integrity`
      lazily and only ever run after it exists. ── */

const confirmDialog = useConfirmDialog({ t: (key: string) => t(key) });

const integrityPolling = useIntegrityPolling({
  fetchJobs: (path) => api.fetchJobsJson(path), // :4567-4572
  isPanelActive: () => activePanel.value === 'integrity-panel', // :4564-4565
  getSelectedExchange: () => contextExchange.contextMeta.value.statusKey, // :4583
  isSaving: () => integrity.isSaving.value, // :4592
  reloadPanel: () => integrity.loadIntegrityPanel(false), // :4594
});

const integrity = useIntegrity({
  api,
  t: (key, params) => t(key, params ?? {}),
  showToast,
  confirm: confirmDialog.confirm,
  getExchange: () => contextExchange.contextExchange.value,
  serial: () => getBoot().serial, // PBGUI_SERIAL (:4241) via boot.js
  polling: integrityPolling,
});

/** setActivePanel's integrity slice (:9066-9071). */
panelHooks['integrity-panel'] = {
  onEnter: () => {
    void integrity.loadIntegrityPanel(false); // :9067
    integrityPolling.start(); // :9068
  },
  onLeave: () => integrityPolling.stop(), // :9070
};

/** Legacy ran the integrity load+poll for the whole page life; the Vue
 *  page stops the chain on unmount so tests/remounts cannot leak it. */
onBeforeUnmount(() => integrityPolling.stop());

const integrityActive = computed(() => activePanel.value === 'integrity-panel');

/* ── inventory panel (M-data-6 — :3502-3579 + :6187-6387 + :7813-8854):
      per-exchange×view state, table view model, server-figure heatmaps
      (Plotly global via index.html, recon R6) and the confirm-gated
      destructive flows. The panel hook (:9065) lazy-loads on enter; the
      exchange fan-out slice (:7317-7320) resets visibility + reloads
      while active. The controller is referenced lazily by the fan-out
      hooks above (first call is the onMounted :9771 fan-out). ── */

declare global {
  interface Window {
    Plotly?: PlotlyLike;
  }
}

const inventory = useInventory({
  api,
  t: (key, params) => t(key, params ?? {}),
  showToast,
  confirm: confirmDialog.confirm,
  getExchange: () => contextExchange.contextExchange.value,
  isPanelActive: () => activePanel.value === 'inventory-panel', // :6335, :6356
  getPlotly: () => window.Plotly, // vendor global (:3661 mirror in index.html)
});

/** setActivePanel's inventory slice (:9065). */
panelHooks['inventory-panel'] = {
  onEnter: () => void inventory.loadPanel(false),
};

/** The delete-by-date overlay's view model (renderInventoryOlderPreview
 *  :8253-8311 as a pure function of the store). */
const olderDialogView = computed(() =>
  computeOlderPreviewView({
    coins: inventory.selectedCoins.value,
    coinLabels: inventory.selectedCoinLabels.value,
    cutoffDay: inventory.currentViewState.value.olderCutoffDay,
    preview: inventory.currentViewState.value.olderPreview,
    t: (key, params) => t(key, params ?? {}),
  })
);

/** Date input change (:9537-9543) — the store watch refires the preview. */
function onOlderCutoff(value: string): void {
  const state = inventory.currentViewState.value;
  state.olderCutoffDay = value; // :9539
  state.olderPreview = null; // :9540
}

/* ── best-1m + copy-data panels (M-data-7 — :3346-3501, :5023-5523,
      :7447-7812, panel slices :9058-9064, fan-out :7321-7323): both
      controllers are referenced lazily by the exchange fan-out hook above
      (first call = the onMounted :9771 fan-out, after every controller
      exists). useBest1m's openBest1mPanel closure is the hoisted function
      declaration below. ── */

const best1m = useBest1m({
  api,
  t: (key, params) => t(key, params ?? {}),
  showToast,
  getExchange: () => contextExchange.contextExchange.value,
  getBest1mSection: () => contextExchange.best1mSection.value, // :7671
  openBest1mPanel, // :7696 — hyperliquid queue redirect
  serial: () => getBoot().serial, // PBGUI_SERIAL (:4189)
  dataActionsUrl: apiUrl, // :7581 via config
});

const copyData = useCopyData({
  api,
  fetchImpl: (...args) => fetch(...args), // fetchCopyDataScheduleJson (:5076)
  marketDataUrl: apiUrl,
  t: (key, params) => t(key, params ?? {}),
  showToast,
  isPanelActive: () => activePanel.value === 'copy-data-panel', // :5146
  serial: () => getBoot().serial, // :4216
});

/** setActivePanel's best1m slice (:9058) — re-fires on re-entry like legacy. */
panelHooks['best1m-panel'] = {
  onEnter: () => best1m.refreshPanel(false),
};

/** setActivePanel's copy-data slice (:9059-9064) — mount + 15 s poll start,
 *  poll stop when the panel is left. */
panelHooks['copy-data-panel'] = {
  onEnter: () => {
    copyData.mountJobMonitor(false); // :9060
    void copyData.loadSchedules(false); // :9061
  },
  onLeave: () => copyData.stopSchedulePoll(), // :9063
};

/** Legacy ran the schedule poll for the whole page life; the Vue page stops
 *  it (and any dry-run chain) on unmount so remounts cannot leak timers. */
onBeforeUnmount(() => {
  copyData.stopSchedulePoll();
  copyData.resetDryRunSummary();
});

// bootstrap :9764 — restore + remap + activate now that every landed panel
// hook is registered (still before the :9771 fan-out in onMounted)
restorePanel();

function onExchangeInput(value: string): void {
  contextExchange.setContextExchange(value); // :9611-9613
}

/** Legacy openBest1mPanel (:7687-7691): section → panel switch → refresh.
 *  The :7690 refresh lands through the best1m panel's onEnter hook
 *  (:9058) — legacy's double refresh (openBest1mPanel + setActivePanel) is
 *  collapsed into the single idempotent hook (deviation noted in the header). */
function openBest1mPanel(mode: Best1mSection): void {
  contextExchange.setBest1mSection(mode); // :7688
  setActivePanel('best1m-panel'); // :7689 → onEnter refreshBest1mPanel(false)
}

/* ── status summaries (refreshStatuses :9076-9096, bootstrap :9772) ── */

const statusSummaries = useStatusSummaries();

const marketStatusText = computed(() => {
  if (!statusSummaries.statusSummaries.value.length) return t('common.loading');
  return statusSummaries.statusSummaries.value.some((summary) => summary.error)
    ? t('common.error')
    : t('common.ok');
});

const marketStatusTone = computed(() => {
  if (!statusSummaries.statusSummaries.value.length) return 'warning' as const;
  return statusSummaries.statusSummaries.value.some((summary) => summary.error) ? 'danger' as const : 'success' as const;
});

/* ── panel placeholder registry (M-data-8 replaces the activity one) ── */

const PLACEHOLDER_TASK: Record<Exclude<PanelId, 'status-panel' | 'settings-panel' | 'integrity-panel' | 'inventory-panel' | 'best1m-panel' | 'copy-data-panel'>, string> = {
  // the activity panel hosts the global LogViewerPanel script — mounting
  // it lands with the M-data-8 integration pass
  'activity-panel': 'M-data-8',
};

function placeholderTask(panel: PanelDef): string {
  return panel.id === 'status-panel'
    ? 'M-data-2'
    : PLACEHOLDER_TASK[panel.id as Exclude<PanelId, 'status-panel' | 'settings-panel' | 'integrity-panel' | 'inventory-panel' | 'best1m-panel' | 'copy-data-panel'>];
}

/* ── help opener (legacy initHelpOverlay tail :4085-4089): the nav's Guide
      button calls PBGUI_HELP_OPENER, which forwards the 'market data'
      keyword to the shared overlay script loaded by index.html ── */

declare global {
  interface Window {
    _openMarketDataHelp?: () => void;
    PBGUI_HELP_OPENER?: () => void;
    PBGuiSharedHelp?: { open?: (keyword: string, opts: { token: string }) => void };
  }
}

/** Legacy helpDefaultTopic (:3816). */
const HELP_DEFAULT_TOPIC = 'market data';

function openMarketDataHelp(): void {
  const sharedHelp = window.PBGuiSharedHelp;
  if (!sharedHelp || typeof sharedHelp.open !== 'function') return; // :4086
  sharedHelp.open(HELP_DEFAULT_TOPIC, { token: getBoot().token }); // :4087
}

window._openMarketDataHelp = openMarketDataHelp; // :4085
window.PBGUI_HELP_OPENER = window._openMarketDataHelp; // :4089

/* ── bootstrap (:9757-9772 order): title → tooltip → help opener → panels
      (setup) → context exchange fan-out (:9771) → refreshStatuses (:9772) ── */

onMounted(() => {
  document.title = t('market.title'); // :3646
  contextExchange.setContextExchange(contextExchange.contextExchange.value); // :9771
  void statusSummaries.refreshStatuses({ fallbackMessage: t('market.statusFetchFailed') }); // :9772
});
</script>

<template>
  <AppShell
    class="data-page-shell data-page-shell--market-data"
    page-key="info_market_data_fastapi"
    :page-title="t('market.title')"
    :sections="sections"
    :active-section="activePanel"
    @update:section="onSectionSelect"
  >
    <template #status>
      <StatusStrip
        :label="t('shared.status')"
        :value="marketStatusText"
        :tone="marketStatusTone"
      />
    </template>

    <MigrationWatermark />
    <div id="page-body" class="flex min-h-0 flex-1 overflow-hidden">
    <div id="main-content" class="flex min-w-0 min-h-0 flex-1 flex-col gap-3 overflow-hidden p-5">
      <ExchangeSelect
        :model-value="contextExchange.contextExchange.value"
        :options="exchangeOptions"
        @update:model-value="onExchangeInput"
      />

      <PanelShell :panels="PANELS" :active="activePanel" #default="{ panel }">
        <StatusPanel v-if="panel.id === 'status-panel'" :monitor="statusMonitor" />
        <SettingsPanel
          v-else-if="panel.id === 'settings-panel'"
          :store="settings"
          :tiingo="tiingo"
          :map="tradfiMap"
        />
        <IntegrityPanel
          v-else-if="panel.id === 'integrity-panel'"
          :store="integrity"
          :polling="integrityPolling"
          :active="integrityActive"
        />
        <InventoryPanel v-else-if="panel.id === 'inventory-panel'" :store="inventory" />
        <Best1mPanel
          v-else-if="panel.id === 'best1m-panel'"
          :store="best1m"
          :active-mode="contextExchange.best1mSection.value"
          @select-mode="openBest1mPanel"
        />
        <CopyDataPanel v-else-if="panel.id === 'copy-data-panel'" :store="copyData" />
        <PanelPlaceholder v-else :panel="panel" :task="placeholderTask(panel)" />
      </PanelShell>
    </div>
    </div>

  <DataTipTooltip />
  <ToastStack :toasts="toasts" />
  <ConfirmDialog :dialog="confirmDialog" />
  <!-- legacy #inventory-delete-date-ovl :2861-2891 — page-level overlay -->
  <DeleteOlderDialog
    :visible="inventory.actions.olderDialogVisible.value"
    :cutoff-day="inventory.currentViewState.value.olderCutoffDay"
    :view="olderDialogView"
    @set-cutoff="onOlderCutoff"
    @delete="inventory.actions.runDeleteOlder()"
    @close="inventory.actions.closeOlderDialog()"
  />
</AppShell>
</template>

<style>
/* ═══════════════════════════════════════════════════════════════
   Ported from styles/panels-*.css (7 files deleted at the Tailwind
   migration). Everything expressible as utilities moved onto the
   templates (App.vue + the 45 components; shared sets in
   lib/uiClasses.ts); the rules below stay as CSS for the documented
   reasons. This block is unscoped on purpose — the old stylesheets
   were page-global and the html/body/:root rules have no component
   root to scope to.

   Dropped outright: the :root alias block (--bg/--bg2/--border/--text/
   --text-dim/--accent-2 — every one of those variables except --font is
   provided identically by the legacy alias block in src/styles/
   tailwind.css, and --accent-2 was referenced nowhere), the [hidden]
   rule (the shared base layer provides it), the .activity-log-shell twin
   of .context-shell (no template emits it), .settings-shell >
   .panel-head (dead since the rail migration — no panel-head is a
   direct child of .settings-shell), .settings-field.compact-field (no
   template emits it), and the html/body margin/padding/height/background
   declarations the shared base layer + preflight already cover.
   ═══════════════════════════════════════════════════════════════ */

/* ── Page root chrome ──────────────────────────────────────────
   The page-local font stack (legacy --font on :root — 'Source Sans
   Pro'-led, NOT the shared Space Grotesk stack) plus the overflow lock
   and the column body layout; the date input in the inventory overlay
   also reads --font. */
:root {
  --font: 'Source Sans Pro', -apple-system, BlinkMacSystemFont, sans-serif,
    'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif;
}

html,
body {
  overflow: hidden;
  font-family: var(--font);
}

body {
  display: flex;
  flex-direction: column;
}

/* ── data-tip tooltip affordance (panels-status.css) ───────────
   Attribute selector spanning every component that emits data-tip
   (SshForm field labels; the shared CoinOverridesPanel renders
   [data-tip] spans too), and the shared DataTipTooltip.vue root
   carries no classes — same pattern as v7_backtest/v7_edit. */
[data-tip] {
  cursor: help;
  text-decoration-line: underline;
  text-decoration-style: dotted;
  text-decoration-color: var(--text-muted);
  text-underline-offset: 2px;
  text-decoration-thickness: 1px;
}

#data-tip-tooltip {
  display: none;
  position: fixed;
  z-index: var(--z-tooltip);
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-strong);
  border-radius: 5px;
  font-size: var(--fs-xs);
  font-weight: 400;
  padding: 6px 10px;
  white-space: pre-wrap;
  max-width: 520px;
  line-height: 1.5;
  box-shadow: 0 4px 12px rgba(5, 8, 14, 0.5);
  pointer-events: none;
}

/* ── placeholder tint (panels-settings.css) ────────────────────
   Pseudo-element; the shared base layer's --text-placeholder tint is
   slightly darker than the legacy --text-muted this page showed. */
input::placeholder {
  color: var(--text-muted);
}
</style>

<style scoped>
/* Page-level AppShell overrides — ported from panels-shell.css at the
   Tailwind migration. The :deep() rules target AppShell internals, so
   they stay as CSS instead of utilities (coin_data pattern). */
.data-page-shell--market-data :deep(.app-shell__main) {
  width: 100%;
  max-width: none;
  min-height: 0;
  padding: 0;
}

.data-page-shell--market-data :deep(.app-shell__primary) {
  min-height: 0;
}
</style>
