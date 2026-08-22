<script setup lang="ts">
/*
 * Coin Data page — the Vue port of frontend/coin_data.html (3,197 lines,
 * legacy line refs below are provenance):
 *
 * ┌────────────────────────┬─ Legacy regions ─────────────────────────────┐
 * │ App (this shell)       │ DOM :1429-1665, bootstrap :3174-3180, title   │
 * │                        │ :3184, help opener :1964-1968                │
 * │ Rail sections          │ view buttons :3085-3111 (sidebar :1456-1476  │
 * │                        │ retired into the workbench rail via the      │
 * │                        │ AppShell sections API; refresh/CPT toolbar   │
 * │                        │ actions moved to #header-actions)            │
 * │ FiltersPanel +         │ filters :1481-1511, steppers :2527-2567,     │
 * │ TagMultiselect         │ drafts :2402-2464, tags :2377-2400           │
 * │ SymbolTable ×3         │ main :1560-1604, unmatched :1532-1558,       │
 * │                        │ hip3 :1606-1650, sorting :2581-2604          │
 * │ SelectedCard           │ :1513-1530, :2718-2836, drag/resize :2936-   │
 * │                        │ 3058, viewport reset :3061-3069              │
 * │ BusyOverlay            │ :1654-1665, progress :2041-2071              │
 * │ useCoinDataState       │ filters/state/persistence/normalize :1713-   │
 * │                        │ 2110, loadState :2126-2182, sort :2581-2595  │
 * │ useRefreshJobs         │ runRefresh/poll :2184-2262                   │
 * │ Topnav / help chrome   │ pbgui_nav.js + shared_help_overlay.js stay   │
 * │                        │ as global scripts loaded by index.html       │
 * └────────────────────────┴──────────────────────────────────────────────┘
 *
 * NOT PORTED (documented):
 *  - The inline #help-ovl overlay (:1432-1453, init :1839-1969) — dead
 *    chrome: the `visible` class was never added; the live path is
 *    PBGuiSharedHelp.open via the nav's Guide button (market_data recon).
 *    mdToHtml/renderHelpToc were only consumed by that dead path.
 *  - editor_shared.js multiselect controller — replaced by TagMultiselect
 *    (the only coin_data consumer of that script).
 *  - In-page sidebar + PBGuiSidebarResize drag handle (:1456-1476,
 *    :3177) — view switching moved into the workbench rail (AppShell
 *    sections API); the refresh/CPT toolbar buttons moved to the shell's
 *    header actions.
 *
 * Deliberate deviations (documented):
 *  - setActionStatus messages surface through the header StatusStrip (the
 *    legacy #action-status element did not exist in the DOM — the guard in
 *    setActionStatus made every status message invisible).
 *  - Debounce/poll timers are disposed on unmount (legacy leaked them).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getBoot } from '@/shared/boot';
import AppShell from '@/shared/components/AppShell.vue';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import StatusStrip from '@/shared/components/StatusStrip.vue';
import type { PageSection } from '@/shared/navigation';
import BusyOverlay from './components/BusyOverlay.vue';
import FiltersPanel from './components/FiltersPanel.vue';
import SelectedCard from './components/SelectedCard.vue';
import SymbolTable from './components/SymbolTable.vue';
import { useCoinDataState, type NumberFilterKey } from './composables/useCoinDataState';
import { useRefreshJobs, type RefreshPath } from './composables/useRefreshJobs';

const { t } = useI18n();

const store = useCoinDataState({ t: (key, params) => t(key, params ?? {}) });

const refresh = useRefreshJobs({
  t: (key, params) => t(key, params ?? {}),
  getPayload: () => ({
    exchange: store.filters.value.exchange,
    market_cap: store.filters.value.marketCap,
    vol_mcap: store.filters.value.volMcap,
    tags: store.filters.value.tags,
    // :2241 — only send only_cpt for exchanges that support the filter
    only_cpt: store.filters.value.onlyCpt && store.supportsCopyTradingFilter.value,
  }),
  applyState: (state) => store.applyServerState(state),
  setStatus: (message, isError) => store.setActionStatus(message, isError),
});

/* ── refresh buttons (:3085-3096) ── */

function onRefresh(path: RefreshPath, busyKey: string, okKey: string): void {
  void refresh.runRefresh(path, t(busyKey), t(okKey));
}

/* ── filter draft display (syncFilterNumberInput :2418-2430) ── */

const marketCapText = computed(() =>
  store.marketCapDraft.value !== null ? store.marketCapDraft.value : String(store.filters.value.marketCap || 0)
);
const volMcapText = computed(() =>
  store.volMcapDraft.value !== null ? store.volMcapDraft.value : String(store.filters.value.volMcap || 0)
);

/* ── panel meta (renderSummaries :2294-2315) ── */

const counts = computed(() => store.serverState.value?.counts || { main: 0, unmatched_visible: 0, unmatched_all: 0, hip3: 0 });
const meta = computed(() => store.serverState.value?.meta || { cmc_line: '', cmc_line_detail: '', exchange_line: '', exchange_line_detail: '', timestamps: {} });
const sectionTitles = computed(() => store.serverState.value?.sections || { unmatched_title: '', main_title: '', hip3_title: '' });

/* ── page sections in the rail (view buttons :3085-3111) ──
   The legacy sidebar view buttons move under this page's rail entry.
   Labels keep the retired buttons' i18n count text; hip3 lists only for
   exchanges that support it (renderHip3ViewButton :2356). */

const hip3CountLabel = computed(() =>
  store.filters.value.hip3Dex
    ? `${store.hip3VisibleCount.value} of ${counts.value.hip3}` // :2297-2299
    : String(store.hip3VisibleCount.value)
);

const sections = computed<PageSection[]>(() => {
  const items: PageSection[] = [
    { key: 'main', label: t('market.matchedSymbolsCount', { count: counts.value.main }) },
    { key: 'unmatched', label: t('market.cmcUnmatchedCount', { count: counts.value.unmatched_visible }) },
  ];
  if (store.supportsHip3.value) {
    items.push({ key: 'hip3', label: t('market.hip3SymbolsCount', { count: hip3CountLabel.value }) });
  }
  return items;
});

function onSectionSelect(sectionKey: string): void {
  if (sectionKey === 'main' || sectionKey === 'unmatched' || sectionKey === 'hip3') {
    store.setActiveView(sectionKey);
  }
}

/* ── refresh/CMC toolbar actions (renderSidebarMeta :2283-2291) ── */

const cmcTitle = computed(() =>
  store.hasMaterializedCmcKey.value ? undefined : store.cmcDisabledReason.value + t('market.cachedCoinDataReadable') // :2290
);

const mainPanelMeta = computed(() => meta.value.exchange_line + ' | ' + meta.value.cmc_line); // :2306
const mainPanelMetaTitle = computed(() =>
  [meta.value.exchange_line_detail || meta.value.exchange_line, meta.value.cmc_line_detail || meta.value.cmc_line]
    .filter(Boolean)
    .join(' | ')
); // :2307-2310

const sortPill = computed(() => {
  const state = store.sortStates.value.main;
  return t('market.sortedBy', { key: state.key.replace('_', ' '), dir: state.dir }); // :2840
});

const hip3SummaryTitle = computed(() =>
  store.filters.value.hip3Dex
    ? t('market.hip3SymbolsDexCount', {
        visible: store.hip3VisibleCount.value,
        total: counts.value.hip3,
        dex: store.filters.value.hip3Dex,
      }) // :2312-2314
    : sectionTitles.value.hip3_title
);

const hip3DexFieldVisible = computed(
  () => store.supportsHip3.value && store.activeView.value === 'hip3' // renderHip3DexFilter :2356
);

/* ── warnings (renderWarnings :2264-2276) ── */

const warnings = computed(() => store.serverState.value?.warnings || []);

/* ── selected card (:2781-2836) ── */

const selectedCardVisible = computed(
  () => Boolean(store.selectedRow.value) && store.selectedTable.value === store.activeView.value // :2786
);

/* ── viewport height sync (syncActiveTableViewport :2843-2862) ── */

const mainContentEl = useTemplateRef<HTMLElement>('mainContent');

function syncActiveTableViewport(): void {
  const wrap = mainContentEl.value?.querySelector(
    store.activeView.value === 'main'
      ? '#main-panel .table-wrap'
      : store.activeView.value === 'unmatched'
        ? '#unmatched-panel .table-wrap'
        : '#hip3-panel .table-wrap'
  );
  mainContentEl.value?.querySelectorAll('.table-wrap').forEach((node) => {
    (node as HTMLElement).style.height = '';
    (node as HTMLElement).style.maxHeight = '';
  });
  if (!wrap || window.innerWidth <= 980) return;
  const available = Math.max(180, Math.floor(window.innerHeight - wrap.getBoundingClientRect().top - 12));
  (wrap as HTMLElement).style.height = available + 'px';
  (wrap as HTMLElement).style.maxHeight = available + 'px';
}

watch(
  () => [store.activeView.value, store.serverState.value] as const,
  () => void nextTick(syncActiveTableViewport)
);

function onWindowResize(): void {
  syncActiveTableViewport();
}

/* ── help opener (initHelpOverlay tail :1964-1968) ── */

declare global {
  interface Window {
    _openCoinDataHelp?: () => void;
    PBGUI_HELP_OPENER?: () => void;
    PBGuiSharedHelp?: { open?: (keyword: string, opts: { token: string }) => void };
  }
}

/** Legacy helpDefaultTopic (:1747). */
const HELP_DEFAULT_TOPIC = 'coin data';

function openCoinDataHelp(): void {
  const sharedHelp = window.PBGuiSharedHelp;
  if (!sharedHelp || typeof sharedHelp.open !== 'function') return; // :1965
  sharedHelp.open(HELP_DEFAULT_TOPIC, { token: getBoot().token }); // :1966
}

/* ── bootstrap (:3174-3180, :3183-3192) ── */

onMounted(() => {
  document.title = t('market.coinDataTitle');
  window._openCoinDataHelp = openCoinDataHelp;
  window.PBGUI_HELP_OPENER = window._openCoinDataHelp;
  window.addEventListener('resize', onWindowResize);
  void store.loadState(); // :3180
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize);
  refresh.stop(); // deviation: legacy leaked the poll interval
  delete window._openCoinDataHelp;
  delete window.PBGUI_HELP_OPENER;
});
</script>

<template>
  <AppShell
    class="data-page-shell data-page-shell--coin-data"
    page-key="info_coin_data"
    :page-title="t('market.coinDataTitle')"
    :sections="sections"
    :active-section="store.activeView.value"
    @update:section="onSectionSelect"
  >
    <template #status>
      <StatusStrip
        :label="t('shared.status')"
        :value="store.isLoading.value ? t('common.loading') : store.actionStatus.value.message || t('common.ok')"
        :tone="store.actionStatus.value.isError ? 'danger' : store.isLoading.value ? 'warning' : 'success'"
      />
    </template>

    <template #header-actions>
      <!-- Legacy sidebar toolbar (:3085-3111): refresh actions + the CPT
           filter toggle keep their ids and gating; only the position moved
           (the view buttons became the rail sections above). -->
      <button class="pbgui-action primary" id="btn-refresh-exchange" type="button" @click="onRefresh('/refresh/exchange', 'market.refreshingSelectedExchange', 'market.refreshedSelectedExchange')">{{ t('market.refreshSelectedExchange') }}</button>
      <button class="pbgui-action" id="btn-refresh-all" type="button" @click="onRefresh('/refresh/all', 'market.refreshingAllExchanges', 'market.allExchangesRefreshed')">{{ t('market.refreshAllExchanges') }}</button>
      <button
        class="pbgui-action"
        id="btn-refresh-cmc"
        type="button"
        :disabled="!store.hasMaterializedCmcKey.value"
        :title="cmcTitle"
        @click="onRefresh('/refresh/cmc', 'market.refreshingCmcSelected', 'market.cmcSelectedRefreshed')"
      >{{ t('market.refreshCmcSelected') }}</button>
      <button
        class="pbgui-action"
        id="btn-refresh-cmc-all"
        type="button"
        :disabled="!store.hasMaterializedCmcKey.value"
        :title="cmcTitle"
        @click="onRefresh('/refresh/cmc_all', 'market.refreshingCmcAll', 'market.cmcAllRefreshed')"
      >{{ t('market.refreshCmcAll') }}</button>
      <button
        v-if="store.supportsCopyTradingFilter.value"
        class="pbgui-action"
        :class="{ primary: store.filters.value.onlyCpt }"
        id="btn-only-cpt"
        type="button"
        :aria-pressed="store.filters.value.onlyCpt"
        @click="store.toggleOnlyCpt()"
      >{{ t('market.onlyCopyTrading') }}</button>
    </template>

    <MigrationWatermark />
    <div id="page-body">
    <div id="main-content" ref="mainContent">
      <div id="warning-box" class="warning-box" :class="{ hidden: !warnings.length }">
        <div v-for="warning in warnings" :key="warning">{{ warning }}</div>
      </div>

      <FiltersPanel
        :exchanges="store.serverState.value?.options.exchanges || []"
        :exchange="store.filters.value.exchange"
        :market-cap-text="marketCapText"
        :vol-mcap-text="volMcapText"
        :tags="store.filters.value.tags"
        :tag-options="store.serverState.value?.options.tags || []"
        :quote-filter="store.serverState.value?.options.quote_filter || []"
        :hip3-dex="store.filters.value.hip3Dex"
        :hip3-dex-options="store.hip3DexOptions.value"
        :hip3-dex-visible="hip3DexFieldVisible"
        @set-exchange="store.setExchange"
        @number-input="(key: NumberFilterKey, value: string) => store.onNumberInput(key, value)"
        @number-change="store.onNumberChange"
        @step-number="store.stepNumberFilter"
        @set-tags="store.setTags"
        @set-hip3-dex="store.setHip3Dex"
        @reset="store.resetFilters"
      />

      <SelectedCard
        :row="store.selectedRow.value"
        :visible="selectedCardVisible"
        @close="store.closeSelectedDetails"
      />

      <details
        class="panel"
        id="unmatched-panel"
        :class="{ hidden: store.activeView.value !== 'unmatched' }"
        :open="store.activeView.value === 'unmatched'"
      >
        <summary id="unmatched-summary">{{ sectionTitles.unmatched_title || t('market.cmcUnmatchedSummary') }}</summary>
        <div class="panel-body">
          <SymbolTable
            table="unmatched"
            :rows="store.sortedUnmatchedRows.value"
            :selected-key="store.selectedKey.value"
            @sort="store.handleSortClick"
            @select="store.selectRow"
          />
        </div>
      </details>

      <section class="panel" id="main-panel" :class="{ hidden: store.activeView.value !== 'main' }">
        <div class="panel-head">
          <div class="panel-title-wrap">
            <div class="panel-title" id="main-panel-title">{{ t('market.matchedSymbolsLowerCount', { count: counts.main }) }}</div>
            <span class="panel-meta" id="main-panel-meta" :title="mainPanelMetaTitle">{{ mainPanelMeta }}</span>
          </div>
          <span class="pill" id="main-sort-pill">{{ sortPill }}</span>
        </div>
        <SymbolTable
          table="main"
          :rows="store.sortedMainRows.value"
          :selected-key="store.selectedKey.value"
          @sort="store.handleSortClick"
          @select="store.selectRow"
        />
      </section>

      <details
        class="panel"
        id="hip3-panel"
        :class="[{ hidden: store.activeView.value !== 'hip3' }, { 'active-panel': store.activeView.value === 'hip3' }]"
        :open="store.activeView.value === 'hip3'"
      >
        <summary id="hip3-summary">
          <span class="summary-title">
            <span class="summary-title-text" id="hip3-summary-title">{{ hip3SummaryTitle || t('market.hip3SummaryTitle') }}</span>
          </span>
          <span class="summary-inline-actions" :class="{ hidden: !hip3DexFieldVisible }">
            <label class="summary-field" id="field-hip3-dex" @mousedown.stop @click.stop>
              <span class="summary-field-label">{{ t('market.dex') }}</span>
              <select
                id="filter-hip3-dex"
                :disabled="!store.hip3DexOptions.value.length"
                @mousedown.stop
                @click.stop
                @change="store.setHip3Dex(($event.target as HTMLSelectElement).value)"
              >
                <option value="" :selected="!store.filters.value.hip3Dex">{{ t('market.allDexes') }}</option>
                <option
                  v-for="dex in store.hip3DexOptions.value"
                  :key="dex"
                  :value="dex"
                  :selected="dex === store.filters.value.hip3Dex"
                >{{ dex }}</option>
              </select>
            </label>
          </span>
        </summary>
        <div class="panel-body">
          <SymbolTable
            table="hip3"
            :rows="store.sortedHip3Rows.value"
            :selected-key="store.selectedKey.value"
            @sort="store.handleSortClick"
            @select="store.selectRow"
          />
        </div>
      </details>
    </div>
    </div>

    <BusyOverlay :busy="refresh.busy.value" />
  </AppShell>
</template>
