<script setup lang="ts">
/*
 * market_data_main migration — M-data-1 scaffold
 * (source: frontend/market_data_main.html, kept as the legacy fallback until
 * M-data-8 flips the route)
 *
 * Behavior inventory (this scaffold):
 *
 * ┌──────────────────────┬─ Task ─┬─ Legacy regions ────────────────────────────┐
 * │ App (this skeleton)  │ 1 ✓    │ DOM shell 2834-2979 + 3580-3639 (toasts),   │
 * │                      │        │ bootstrap 9736-9773 (restorePanel, title),  │
 * │                      │        │ document.title market.title (:3646)         │
 * │ SidebarNav           │ 1 ✓    │ sectionButtons :3674-3682 + :2925-2949,     │
 * │                      │        │ best-1m shortcut click :9112-9115           │
 * │ PanelShell           │ 1 ✓    │ setActivePanel toggling :9038-9043          │
 * │ ExchangeSelect       │ 1 ✓    │ context bar :2965-2977; persistence :7310,  │
 * │                      │        │ restore :9766 (fan-out → M-data-2)          │
 * │ usePanels/useToasts/ │ 1 ✓    │ panel router + toasts + 4 frozen keys       │
 * │ useApi/config        │        │ :3662-3838, :4176-4196, :4888-5022,         │
 * │                      │        │ :9032-9107, :9736-9773                      │
 * │ Topnav / help chrome │ —      │ pbgui_nav.js + shared_help_overlay.js stay  │
 * │                      │        │ as global scripts loaded by index.html      │
 * │ Panel bodies         │ 2..7   │ placeholders below, one per registry panel  │
 * └──────────────────────┴────────┴─────────────────────────────────────────────┘
 *
 * NOT PORTED (with justification):
 *  - #sidebar-resize handle (:2962) — silent no-op in legacy (the guard at
 *    :9748-9755 never fires; sidebar_resize.js is not included). Recon §0.
 *  - #help-ovl / #confirm-ovl / #inventory-delete-date-ovl overlays and
 *    #data-tip-tooltip (:2838-2915, :3637) — owned by M-data-2/3/6.
 *  - refreshStatuses bootstrap call (:9772) — needs the status panel (M-data-2).
 *
 * Deliberate deviations (documented):
 *  - Context exchange persistence happens on change (:7310 slice) without the
 *    legacy load fan-out; the fan-out arrives with M-data-2.
 *  - Toast/panel timers are disposed on unmount (legacy leaked them).
 */
import { onMounted, provide, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import ExchangeSelect from './components/ExchangeSelect.vue';
import PanelPlaceholder from './components/PanelPlaceholder.vue';
import PanelShell from './components/PanelShell.vue';
import SidebarNav from './components/SidebarNav.vue';
import ToastStack from './components/ToastStack.vue';
import { exchangeOptions } from './lib/exchange';
import { SHOW_TOAST_KEY, useToasts } from './composables/useToasts';
import {
  PANELS,
  persistContextExchange,
  readContextExchange,
  usePanels,
} from './composables/usePanels';
import type { PanelDef, PanelId } from './types';

const { t } = useI18n();

/* ── panel router (setActivePanel/restorePanel :9032-9107, :9736-9746) ── */

const { activePanel, setActivePanel, restorePanel } = usePanels();
restorePanel(); // bootstrap :9764 — read + remap + activate

/* ── exchange context (select :2969-2975; persistence :7310/:9766) ── */

const contextExchange = ref(readContextExchange());
watch(contextExchange, (exchangeKey) => {
  persistContextExchange(window.localStorage, exchangeKey); // :7310 slice
  // M-data-2: setContextExchange fan-out (:7314-7333)
});

/* ── toasts (showToast :4983-5002) — provided for M-data-2..7 panels ── */

const { toasts, showToast } = useToasts();
provide(SHOW_TOAST_KEY, showToast);

/* ── panel placeholder registry (M-data-2..7 replace these) ── */

const PLACEHOLDER_TASK: Record<PanelId, string> = {
  'settings-panel': 'M-data-3/4',
  'status-panel': 'M-data-2',
  'inventory-panel': 'M-data-6',
  'integrity-panel': 'M-data-5',
  'best1m-panel': 'M-data-7',
  'copy-data-panel': 'M-data-7',
  'activity-panel': 'M-data-6',
};

function placeholderTask(panel: PanelDef): string {
  return PLACEHOLDER_TASK[panel.id];
}

onMounted(() => {
  document.title = t('market.title'); // :3646
});
</script>

<template>
  <MigrationWatermark />
  <nav id="topnav"></nav>

  <div id="page-body">
    <SidebarNav :panels="PANELS" :active="activePanel" @select="setActivePanel" />

    <main id="main-content">
      <ExchangeSelect v-model="contextExchange" :options="exchangeOptions" />

      <PanelShell :panels="PANELS" :active="activePanel" #default="{ panel }">
        <!-- M-data-2..7: real panel components keyed on panel.id go here -->
        <PanelPlaceholder :panel="panel" :task="placeholderTask(panel)" />
      </PanelShell>
    </main>
  </div>

  <ToastStack :toasts="toasts" />
</template>
