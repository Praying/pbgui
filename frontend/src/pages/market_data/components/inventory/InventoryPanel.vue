<script setup lang="ts">
/*
 * M-data-6 — the inventory panel body (legacy #inventory-panel DOM
 * :3502-3579 of market_data_main.html): the 4-view dataset table column
 * (head/feedback/metrics/filters/toolbar/table) and the coverage heatmap
 * column (title/caption/feedback/toolbar/legend/plots/OHLCV frame).
 *
 * The whole panel renders from the store controller (useInventory) —
 * this component is markup + event routing only. The delete-by-date
 * overlay is shared page chrome and lives in App.vue.
 *
 * Rail migration: the sidebar context blocks (:2929-2945 — view tabs +
 * build/delete actions, SidebarActions) moved here above the columns; the
 * view-tab click (:9351-9354) drops its setActivePanel leg (the panel is
 * definitionally active here) — setActiveInventoryView (:6376-6386) plus
 * the forced view-key reload (:6385) supersede the enter hook's load.
 *
 * The store stays mounted for the whole session (PanelShell hides
 * inactive sections), so the plot hosts registered here survive panel
 * switches exactly like legacy's static #inventory-*-plot divs.
 */
import { useI18n } from 'vue-i18n';
import {
  actBtnClass,
  calloutClass,
  fieldLabelClass,
  inputClass,
  noteClass,
  panelCardClass,
  panelHeadClass,
  settingsFieldClass,
} from '../../lib/uiClasses';
import type { InventoryController } from '../../composables/useInventory';
import type { InventorySubsection } from '../../types';
import SummaryCards from '../integrity/SummaryCards.vue';
import DataTable from './DataTable.vue';
import HeatmapPlot from './HeatmapPlot.vue';
import OhlcvFrame from './OhlcvFrame.vue';
import SidebarActions from './SidebarActions.vue';

const props = defineProps<{ store: InventoryController }>();

const { t } = useI18n();

/** TF buttons (:3535-3537) — 'all' plus every distinct timeframe. */
function timeframeButtons(): readonly string[] {
  return ['all', ...props.store.availableTimeframes.value];
}

/** Bound style for a parsed legend chip (hex-only, lib/heatmapLegend). */
function legendStyle(color: string): Record<string, string> {
  return { background: color };
}

/** View tab click (:6376-6386 + :6385) — set + persist, then the forced
 *  view-key reload. */
function onSelectView(view: InventorySubsection): void {
  props.store.setActiveView(view);
  void props.store.loadPanel(true);
}
</script>

<template>
  <div class="inventory-layout grid gap-3">
    <!-- legacy sidebar context blocks (:2929-2945) — relocated above the
         columns; visibility flags stay the store's active-panel checks -->
    <div id="inventory-panel-actions" class="inventory-panel-actions flex flex-wrap items-center gap-3">
      <SidebarActions
        :nav-visible="store.subsectionNavVisible.value"
        :available-views="store.availableViews.value"
        :active-view="store.currentView.value"
        :build-visible="store.sidebarBuildVisible.value"
        :build-text="store.sidebarBuildText.value"
        :build-disabled="store.sidebarBuildDisabled.value"
        :delete-visible="store.sidebarDeleteSectionVisible.value"
        :delete-text="store.sidebarDeleteText.value"
        :delete-disabled="store.sidebarDeleteDisabled.value"
        :older-disabled="store.sidebarOlderDisabled.value"
        @select-view="onSelectView"
        @build="store.actions.runBuildBest1m()"
        @delete-selected="store.actions.runDeleteSelected()"
        @delete-older="store.actions.openOlderDialog()"
        @clear-dataset="store.actions.runClearDataset()"
      />
    </div>
    <article :class="[panelCardClass, 'inventory-shell grid gap-3']">
      <div :class="panelHeadClass">
        <div>
          <div class="eyebrow">{{ t('market.ohlcvData') }}</div>
          <h3 id="inventory-title">{{ store.title.value }}</h3>
          <p :class="noteClass" id="inventory-helper-note">{{ store.helperNote.value }}</p>
        </div>
      </div>
      <div
        v-if="store.feedback.value.message"
        id="inventory-feedback"
        :class="calloutClass(store.feedback.value.level === 'error')"
      >{{ store.feedback.value.message }}</div>
      <!-- renderInventoryMetrics :7851-7866 — same .summary-grid markup as
           the integrity cards -->
      <SummaryCards id="inventory-summary-grid" :cards="store.metrics.value" />
      <div class="inventory-filter-grid grid gap-3 grid-cols-[minmax(0,1.2fr)_minmax(220px,0.8fr)] max-[980px]:grid-cols-1">
        <label :class="settingsFieldClass">
          <span :class="fieldLabelClass">{{ t('market.filterByCoin') }}</span>
          <input
            id="inventory-coin-filter"
            :class="inputClass"
            type="text"
            :placeholder="'e.g. GOOGL or BTC'"
            autocomplete="off"
            :value="store.currentViewState.value.coinFilter"
            @input="store.setCoinFilter(String(($event.target as HTMLInputElement).value || ''))"
          />
        </label>
        <label :class="settingsFieldClass">
          <span :class="fieldLabelClass">{{ t('market.filterByType') }}</span>
          <select
            id="inventory-kind-filter"
            :class="inputClass"
            :value="store.currentViewState.value.kindFilter"
            @change="store.setKindFilter(String(($event.target as HTMLSelectElement).value || 'all'))"
          >
            <option
              v-for="option in store.kindOptions.value"
              :key="option.value"
              :value="option.value"
              :disabled="option.disabled"
              :hidden="option.disabled"
            >{{ option.label }}</option>
          </select>
        </label>
      </div>
      <div class="inventory-table-toolbar mb-1 flex flex-wrap items-center gap-1">
        <button
          :class="actBtnClass(false)"
          id="btn-inventory-select-all"
          type="button"
          :disabled="store.selectAllDisabled.value"
          @click="store.selectAll()"
        >{{ t('market.selectAll') }}</button>
        <button
          :class="actBtnClass(false)"
          id="btn-inventory-deselect-all"
          type="button"
          :disabled="store.deselectAllDisabled.value"
          @click="store.deselectAll()"
        >{{ t('market.deselect') }}</button>
        <div class="inventory-timeframe-filter flex items-center gap-1" id="inventory-timeframe-filter" v-if="store.timeframeFilterSupported.value">
          <span class="inventory-timeframe-filter-label text-xs uppercase tracking-[0.06em] text-secondary">TF</span>
          <button
            v-for="timeframe in timeframeButtons()"
            :key="timeframe"
            :class="actBtnClass(store.currentViewState.value.timeframeFilter === timeframe)"
            :id="timeframe === 'all' ? 'btn-inventory-timeframe-all' : `btn-inventory-timeframe-${timeframe}`"
            type="button"
            :data-timeframe-filter="timeframe"
            :aria-pressed="store.currentViewState.value.timeframeFilter === timeframe ? 'true' : 'false'"
            @click="store.setTimeframeFilter(timeframe)"
          >{{ timeframe === 'all' ? t('common.all') : timeframe }}</button>
        </div>
        <button
          v-if="store.missingToggleSupported.value"
          id="btn-inventory-toggle-missing"
          type="button"
          :class="actBtnClass(store.missingTogglePressed.value)"
          :aria-pressed="store.missingTogglePressed.value ? 'true' : 'false'"
          :title="store.missingToggleTitle.value"
          @click="store.toggleIncludeMissing()"
        >{{ store.missingToggleText.value }}</button>
        <span :class="noteClass" id="inventory-selection-count">{{ store.selectionCountText.value }}</span>
      </div>
      <DataTable
        :columns="store.columns.value"
        :rows="store.tableRows.value"
        :selectedIds="store.currentViewState.value.selectedRowIds"
        :sortKey="store.currentViewState.value.sortKey"
        :sortDirection="store.currentViewState.value.sortDirection"
        :exchange="store.currentExchange.value"
        :viewKey="store.currentView.value"
        :emptyText="store.tableEmptyText.value"
        @sort="store.toggleSort"
        @commit="store.commitSelectionIds"
      />
    </article>

    <article :class="[panelCardClass, 'inventory-heatmap-shell grid gap-3']" id="inventory-heatmap-card">
      <div>
        <div class="eyebrow">{{ t('market.coverage') }}</div>
        <h3 id="inventory-heatmap-title">{{ store.heatmap.heatmapTitle.value }}</h3>
        <p :class="noteClass" id="inventory-heatmap-caption">{{ store.heatmap.heatmapCaption.value }}</p>
      </div>
      <div
        v-if="store.heatmap.heatmapFeedback.value.message"
        id="inventory-heatmap-feedback"
        :class="calloutClass(store.heatmap.heatmapFeedback.value.level === 'error')"
      >{{ store.heatmap.heatmapFeedback.value.message }}</div>
      <div class="inventory-heatmap-toolbar flex flex-wrap items-center gap-2" id="inventory-heatmap-toolbar" v-if="store.heatmap.toolbarVisible.value">
        <label :class="settingsFieldClass" id="inventory-month-field" v-if="store.heatmap.monthFieldVisible.value">
          <span :class="fieldLabelClass">{{ t('market.selectMonthForMinute') }}</span>
          <select
            id="inventory-month-select"
            :class="inputClass"
            :value="store.currentViewState.value.selectedMonth"
            @change="store.heatmap.setMonth(String(($event.target as HTMLSelectElement).value || ''))"
          >
            <option v-for="month in store.heatmap.months.value" :key="month" :value="month">{{ month }}</option>
          </select>
        </label>
        <label class="inventory-toggle inline-flex items-center gap-1 text-sm text-secondary" id="inventory-holiday-toggle" v-if="store.heatmap.holidayToggleVisible.value">
          <input
            id="inventory-show-holiday"
            type="checkbox"
            :checked="store.currentViewState.value.showHoliday !== false"
            @change="store.heatmap.setShowHoliday(($event.target as HTMLInputElement).checked)"
          />
          <span>{{ t('market.highlightMarketHolidays') }}</span>
        </label>
        <label class="inventory-toggle inline-flex items-center gap-1 text-sm text-secondary" id="inventory-oos-toggle" v-if="store.heatmap.oosToggleVisible.value">
          <input
            id="inventory-show-oos"
            type="checkbox"
            :checked="store.currentViewState.value.showOos !== false"
            @change="store.heatmap.setShowOos(($event.target as HTMLInputElement).checked)"
          />
          <span>{{ t('market.highlightExpectedGaps') }}</span>
        </label>
      </div>
      <!-- server legend_html parsed to structured items — never v-html -->
      <div class="inventory-legend flex flex-wrap gap-1" id="inventory-heatmap-legend">
        <span
          v-for="item in store.heatmap.overviewLegend.value"
          :key="item.label"
          class="inventory-legend-item inline-flex min-h-5 items-center whitespace-nowrap rounded-md py-[1px] px-2 text-xs text-primary"
          :style="legendStyle(item.color)"
        >{{ item.label }}</span>
      </div>
      <HeatmapPlot id="inventory-overview-plot" plot-key="overview" :register="store.registerPlot" />
      <div class="inventory-minute-shell grid gap-2" id="inventory-minute-shell" v-if="store.heatmap.minuteShellVisible.value">
        <div class="inventory-legend flex flex-wrap gap-1" id="inventory-minute-legend">
          <span
            v-for="item in store.heatmap.minuteLegend.value"
            :key="item.label"
            class="inventory-legend-item inline-flex min-h-5 items-center whitespace-nowrap rounded-md py-[1px] px-2 text-xs text-primary"
            :style="legendStyle(item.color)"
          >{{ item.label }}</span>
        </div>
        <HeatmapPlot id="inventory-minute-plot" plot-key="minute" :register="store.registerPlot" />
      </div>
      <OhlcvFrame
        :visible="store.heatmap.ohlcvVisible.value"
        :open="store.heatmap.ohlcvOpen.value"
        :summary="store.heatmap.ohlcvSummary.value"
        :src="store.heatmap.ohlcvFrameSrc.value"
        @toggle="store.heatmap.toggleOhlcv"
      />
    </article>
  </div>
</template>
