<script setup lang="ts">
/*
 * market_data_main migration — M-data-1 scaffold + M-data-2
 * (source: frontend/market_data_main.html, kept as the legacy fallback until
 * M-data-8 flips the route)
 *
 * Behavior inventory (this file):
 *
 * ┌──────────────────────┬─ Task ─┬─ Legacy regions ────────────────────────────┐
 * │ App (this skeleton)  │ 1 ✓    │ DOM shell 2834-2979 + 3580-3639 (toasts),   │
 * │                      │        │ bootstrap 9736-9773 (restorePanel, title),  │
 * │                      │        │ document.title market.title (:3646)         │
 * │ SidebarNav           │ 1+2 ✓  │ sectionButtons :3674-3682 + :2925-2949,     │
 * │                      │        │ shortcut clicks :9112-9120, sync state      │
 * │                      │        │ :7415-7446 (mode payload — M-data-1 review  │
 * │                      │        │ handoff)                                    │
 * │ PanelShell           │ 1 ✓    │ setActivePanel toggling :9038-9043          │
 * │ ExchangeSelect       │ 1+2 ✓  │ context bar :2965-2977; select change       │
 * │                      │        │ :9611-9613 → setContextExchange fan-out     │
 * │ StatusPanel +        │ 2 ✓    │ status panel :3223-3227 + fragment mount    │
 * │ useStatusMonitor     │        │ :4102-4174, :7406-7413, :7813-7816          │
 * │ useContextExchange   │ 2 ✓    │ fan-out :7304-7333, bootstrap :9766-9771,   │
 * │                      │        │ best-1m section state :7687-7691            │
 * │ useStatusSummaries   │ 2 ✓    │ fetchStatus/refreshStatuses :9076-9096      │
 * │ DataTipTooltip       │ 2 ✓    │ #data-tip-tooltip :3637 + :3839-3865        │
 * │ Help opener wiring   │ 2 ✓    │ window._openMarketDataHelp/PBGUI_HELP_OPENER│
 * │                      │        │ :4085-4089 (shared_help_overlay path)       │
 * │ usePanels/useToasts/ │ 1 ✓    │ panel router + toasts + 4 frozen keys       │
 * │ useApi/config        │        │ :3662-3838, :4176-4196, :4888-5022,         │
 * │                      │        │ :9032-9107, :9736-9773                      │
 * │ Topnav / help chrome │ —      │ pbgui_nav.js + shared_help_overlay.js stay  │
 * │                      │        │ as global scripts loaded by index.html      │
 * │ Panel bodies         │ 3..7   │ placeholders below, one per registry panel  │
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
 */
import { onMounted, provide } from 'vue';
import { useI18n } from 'vue-i18n';
import { getBoot } from '@/shared/boot';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import DataTipTooltip from './components/DataTipTooltip.vue';
import ExchangeSelect from './components/ExchangeSelect.vue';
import PanelPlaceholder from './components/PanelPlaceholder.vue';
import PanelShell from './components/PanelShell.vue';
import SidebarNav from './components/SidebarNav.vue';
import StatusPanel from './components/StatusPanel.vue';
import ToastStack from './components/ToastStack.vue';
import { exchangeOptions } from './lib/exchange';
import { SHOW_TOAST_KEY, useToasts } from './composables/useToasts';
import {
  PANELS,
  readContextExchange,
  usePanels,
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

/* ── panel router (setActivePanel/restorePanel :9032-9107, :9736-9746) ── */

const { activePanel, setActivePanel, restorePanel } = usePanels();
restorePanel(); // bootstrap :9764 — read + remap + activate (before the fan-out)

/* ── status monitor controller (mount protocol :4102-4174) — created before
      the exchange context so the fan-out hook can reach it ── */

const statusMonitor = useStatusMonitor({
  getExchange: () => contextExchange.contextExchange.value,
});

/* ── exchange context (select :2969-2975; change :9611-9613; fan-out
      :7304-7333; restore :9766-9771) ── */

const fanoutHooks: ExchangeFanoutHooks = {
  // :7315 — the M-data-2 slice of the fan-out
  updateStatusPanel: () => statusMonitor.updateStatusPanel(),
  // loadSettings :7314 — M-data-3
  // syncInventorySubsectionVisibility :7317 + loadInventoryPanel :7318-7320 — M-data-6
  // refreshBest1mPanel :7321-7323 — M-data-7
  // onIntegrityExchangeChange :7324-7332 — M-data-5
};

const contextExchange = useContextExchange({
  initialExchange: readContextExchange(), // :9766 — raw stored value
  isPanelActive: (panel) => activePanel.value === panel, // .active-panel check
  hooks: fanoutHooks,
});

function onExchangeInput(value: string): void {
  contextExchange.setContextExchange(value); // :9611-9613
}

/** Legacy openBest1mPanel (:7687-7691): section → panel switch → refresh. */
function openBest1mPanel(mode: Best1mSection): void {
  contextExchange.setBest1mSection(mode); // :7688
  setActivePanel('best1m-panel'); // :7689
  // :7690 refreshBest1mPanel(false) — M-data-7 panel hook (setActivePanel
  // already triggers the panel's onEnter once wired)
}

/* ── status summaries (refreshStatuses :9076-9096, bootstrap :9772) ── */

const statusSummaries = useStatusSummaries();

/* ── toasts (showToast :4983-5002) — provided for M-data-2..7 panels ── */

const { toasts, showToast } = useToasts();
provide(SHOW_TOAST_KEY, showToast);

/* ── panel placeholder registry (M-data-3..7 replace these) ── */

const PLACEHOLDER_TASK: Record<Exclude<PanelId, 'status-panel'>, string> = {
  'settings-panel': 'M-data-3/4',
  'inventory-panel': 'M-data-6',
  'integrity-panel': 'M-data-5',
  'best1m-panel': 'M-data-7',
  'copy-data-panel': 'M-data-7',
  'activity-panel': 'M-data-6',
};

function placeholderTask(panel: PanelDef): string {
  return panel.id === 'status-panel'
    ? 'M-data-2'
    : PLACEHOLDER_TASK[panel.id as Exclude<PanelId, 'status-panel'>];
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
  <MigrationWatermark />
  <nav id="topnav"></nav>

  <div id="page-body">
    <SidebarNav
      :panels="PANELS"
      :active="activePanel"
      :context-exchange="contextExchange.contextExchange.value"
      :best1m-section="contextExchange.best1mSection.value"
      @select="setActivePanel"
      @shortcut="openBest1mPanel"
    />

    <main id="main-content">
      <ExchangeSelect
        :model-value="contextExchange.contextExchange.value"
        :options="exchangeOptions"
        @update:model-value="onExchangeInput"
      />

      <PanelShell :panels="PANELS" :active="activePanel" #default="{ panel }">
        <!-- M-data-3..7: real panel components keyed on panel.id go here -->
        <StatusPanel v-if="panel.id === 'status-panel'" :monitor="statusMonitor" />
        <PanelPlaceholder v-else :panel="panel" :task="placeholderTask(panel)" />
      </PanelShell>
    </main>
  </div>

  <DataTipTooltip />
  <ToastStack :toasts="toasts" />
</template>
